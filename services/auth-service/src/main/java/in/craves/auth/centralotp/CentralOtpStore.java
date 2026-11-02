package in.craves.auth.centralotp;

import in.craves.auth.exception.AuthException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class CentralOtpStore {
    record Claim(String phone, String challenge, UUID operation, long expiresAt, long resendAt) {
        @Override public String toString() { return "Claim[redacted]"; }
    }
    /** How long a code works: 10 minutes (NIST SP 800-63B-4); MSG91 is told the same (CentralOtpProvider). */
    static final long CODE_LIFE_MS = 600_000;
    private static final Logger log = LoggerFactory.getLogger(CentralOtpStore.class);
    private final JdbcTemplate db;
    private final TransactionTemplate transaction;
    private final SecureRandom random = new SecureRandom();

    public CentralOtpStore(JdbcTemplate db, PlatformTransactionManager manager) {
        this.db = db;
        transaction = new TransactionTemplate(manager);
        transaction.setTimeout(5);
    }

    Claim send(String phone, String previous, CentralOtpCaller.Caller caller) {
        return Objects.requireNonNull(transaction.execute(status -> {
            long now = System.currentTimeMillis();
            db.execute("SET LOCAL lock_timeout = '1000ms'");
            db.update("INSERT INTO auth_phone_otp(phone_hash,phone_number,updated_at) VALUES (?,?,?) "
                    + "ON CONFLICT(phone_hash) DO NOTHING", hash(phone), phone, now);
            var row = db.queryForMap("SELECT * FROM auth_phone_otp WHERE phone_hash=? FOR UPDATE", hash(phone));
            if ((long) row.get("lease_until") > now) { throw busy(); }
            if ((long) row.get("resend_at") > now) {
                throw new AuthException(HttpStatus.TOO_MANY_REQUESTS, "OTP_COOLDOWN",
                        "Please wait before requesting another code.");
            }
            int resends = 0;
            if (previous != null) {
                // A new code never resets the failed tries (NIST SP 800-63B-4): a resend after 5 starts again instead.
                if (!hash(previous).equals(row.get("challenge_hash"))
                        || !"ACTIVE".equals(row.get("state")) || (long) row.get("expires_at") <= now
                        || (int) row.get("attempts") >= 5) {
                    throw restart();
                }
                resends = (int) row.get("resends") + 1;
                if (resends > 2) {
                    throw AuthException.badRequest("OTP_RESEND_LIMIT", "The resend limit was reached. Start again shortly.");
                }
            }
            // Per caller, so one script can't spend the shared minute budget and lock everyone out; checked first, so a
            // refused request never waits on that shared row (a refusal rolls back: it adds to no bucket).
            int ipSends = caller.ip() == null ? 0 : limit("ip:" + hash(caller.ip()), now / 3600000, 20);
            if (caller.install() != null) { limit("install:" + hash(caller.install()), now / 3600000, 10); }
            limit("global", now / 60000, 100);
            limit("phone:" + hash(phone), now / 3600000, 5);
            // Holds no address, install or phone: only whether the limits apply, and this address's sends this hour (a
            // count that keeps climbing across different people means they share one address: docs/riders/GO-LIVE.md §11).
            log.info("OTP_SEND ipKnown={} viaForwarder={} installKnown={} ipSendsThisHour={}",
                    caller.ip() != null, caller.viaForwarder(), caller.install() != null, ipSends);
            byte[] bytes = new byte[32]; random.nextBytes(bytes);
            String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            UUID operation = UUID.randomUUID();
            // Codes live 10 minutes (NIST); a resend keeps the session's failed tries, a fresh start clears them.
            db.update("UPDATE auth_phone_otp SET challenge_hash=?,state='SENDING',operation_id=?,lease_until=?,"
                    + "expires_at=?,resend_at=?,attempts=CASE WHEN ? THEN attempts ELSE 0 END,resends=?,updated_at=? WHERE phone_hash=?",
                    hash(challenge), operation, now + 30000, now + CODE_LIFE_MS, now + 30000, previous != null, resends, now, hash(phone));
            // Commit replacement before contacting MSG91: an ambiguous timeout must never revive an old challenge.
            db.update("DELETE FROM auth_phone_otp_limits WHERE (scope,bucket) IN "
                    + "(SELECT scope,bucket FROM auth_phone_otp_limits WHERE "
                    + "(scope='global' AND bucket<?) OR (scope<>'global' AND bucket<?) LIMIT 500)",
                    now / 60000 - 2880, now / 3600000 - 48);
            db.update("DELETE FROM auth_phone_otp WHERE phone_hash IN "
                    + "(SELECT phone_hash FROM auth_phone_otp WHERE updated_at < ? LIMIT 500)", now - 172800000);
            return new Claim(phone, challenge, operation, now + CODE_LIFE_MS, now + 30000);
        }));
    }

    Claim verify(String challenge, CentralOtpCaller.Caller caller) {
        return Objects.requireNonNull(transaction.execute(status -> {
            long now = System.currentTimeMillis();
            db.execute("SET LOCAL lock_timeout = '1000ms'");
            var rows = db.queryForList("SELECT * FROM auth_phone_otp WHERE challenge_hash=? FOR UPDATE", hash(challenge));
            if (rows.size() != 1) { throw restart(); }
            var row = rows.getFirst();
            if ((long) row.get("lease_until") > now) { throw busy(); }
            String state = (String) row.get("state");
            if ((!"ACTIVE".equals(state) && !"VERIFYING".equals(state))
                    || (long) row.get("expires_at") <= now || (int) row.get("attempts") >= 5) { throw restart(); }
            // In the attempt's transaction: they count with it, and a check they refuse rolls back without using a try.
            if (caller.ip() != null) { limit("vip:" + hash(caller.ip()), now / 3600000, 60); }
            if (caller.install() != null) { limit("vinst:" + hash(caller.install()), now / 3600000, 30); }
            UUID operation = UUID.randomUUID();
            db.update("UPDATE auth_phone_otp SET state='VERIFYING',operation_id=?,lease_until=?,attempts=attempts+1,"
                    + "updated_at=? WHERE challenge_hash=?", operation, now + 30000, now, hash(challenge));
            return new Claim((String) row.get("phone_number"), challenge, operation,
                    (long) row.get("expires_at"), (long) row.get("resend_at"));
        }));
    }

    boolean finish(Claim claim, String state) {
        long now = System.currentTimeMillis();
        return db.update("UPDATE auth_phone_otp SET state=CASE WHEN attempts>=5 AND ?='ACTIVE' THEN 'FAILED' ELSE ? END,"
                + "lease_until=0,updated_at=? WHERE challenge_hash=? AND operation_id=? AND lease_until>=? "
                + "AND expires_at>? AND state IN ('SENDING','VERIFYING')",
                state, state, now, hash(claim.challenge()), claim.operation(), now, now) == 1;
    }

    // Every scope but "global" counts hours: the cleanup in send() removes only those older than 48 of them.
    private int limit(String scope, long bucket, int maximum) {
        Integer count = db.queryForObject("INSERT INTO auth_phone_otp_limits(scope,bucket,count) VALUES (?,?,1) "
                + "ON CONFLICT(scope,bucket) DO UPDATE SET count=auth_phone_otp_limits.count+1 RETURNING count",
                Integer.class, scope, bucket);
        if (count == null || count > maximum) {
            throw new AuthException(HttpStatus.TOO_MANY_REQUESTS, "OTP_RATE_LIMIT",
                    "Too many verification requests. Please try again later.");
        }
        return count;
    }

    static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
    static AuthException restart() {
        return AuthException.badRequest("OTP_RESTART", "This verification request has ended. Request a new code.");
    }
    private static AuthException busy() {
        return new AuthException(HttpStatus.CONFLICT, "OTP_BUSY", "A verification request is already in progress.");
    }
}
