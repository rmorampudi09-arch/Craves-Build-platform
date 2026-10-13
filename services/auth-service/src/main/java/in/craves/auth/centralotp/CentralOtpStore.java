package in.craves.auth.centralotp;

import in.craves.auth.exception.AuthException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
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
    private final JdbcTemplate db;
    private final TransactionTemplate transaction;
    private final SecureRandom random = new SecureRandom();

    public CentralOtpStore(JdbcTemplate db, PlatformTransactionManager manager) {
        this.db = db;
        transaction = new TransactionTemplate(manager);
        transaction.setTimeout(5);
    }

    Claim send(String phone, String previous) {
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
                if (!hash(previous).equals(row.get("challenge_hash"))
                        || !"ACTIVE".equals(row.get("state")) || (long) row.get("expires_at") <= now) {
                    throw restart();
                }
                resends = (int) row.get("resends") + 1;
                if (resends > 2) {
                    throw AuthException.badRequest("OTP_RESEND_LIMIT", "The resend limit was reached. Start again shortly.");
                }
            }
            limit("global", now / 60000, 100);
            limit("phone:" + hash(phone), now / 3600000, 5);
            byte[] bytes = new byte[32]; random.nextBytes(bytes);
            String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            UUID operation = UUID.randomUUID();
            db.update("UPDATE auth_phone_otp SET challenge_hash=?,state='SENDING',operation_id=?,lease_until=?,"
                    + "expires_at=?,resend_at=?,attempts=0,resends=?,updated_at=? WHERE phone_hash=?",
                    hash(challenge), operation, now + 30000, now + 900000, now + 30000, resends, now, hash(phone));
            // Commit replacement before contacting MSG91: an ambiguous timeout must never revive an old challenge.
            db.update("DELETE FROM auth_phone_otp_limits WHERE (scope,bucket) IN "
                    + "(SELECT scope,bucket FROM auth_phone_otp_limits WHERE "
                    + "(scope='global' AND bucket<?) OR (scope<>'global' AND bucket<?) LIMIT 500)",
                    now / 60000 - 2880, now / 3600000 - 48);
            db.update("DELETE FROM auth_phone_otp WHERE phone_hash IN "
                    + "(SELECT phone_hash FROM auth_phone_otp WHERE updated_at < ? LIMIT 500)", now - 172800000);
            return new Claim(phone, challenge, operation, now + 900000, now + 30000);
        }));
    }

    Claim verify(String challenge) {
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

    private void limit(String scope, long bucket, int maximum) {
        Integer count = db.queryForObject("INSERT INTO auth_phone_otp_limits(scope,bucket,count) VALUES (?,?,1) "
                + "ON CONFLICT(scope,bucket) DO UPDATE SET count=auth_phone_otp_limits.count+1 RETURNING count",
                Integer.class, scope, bucket);
        if (count == null || count > maximum) {
            throw new AuthException(HttpStatus.TOO_MANY_REQUESTS, "OTP_RATE_LIMIT",
                    "Too many verification requests. Please try again later.");
        }
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
