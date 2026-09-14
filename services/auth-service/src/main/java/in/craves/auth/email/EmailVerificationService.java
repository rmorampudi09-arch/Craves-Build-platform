package in.craves.auth.email;

import in.craves.auth.exception.AuthException;
import in.craves.auth.security.CurrentUser;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class EmailVerificationService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final EmailVerificationSettings settings;
    private final EmailVerificationTransport transport;
    private final Clock clock;
    public EmailVerificationService(JdbcTemplate jdbc, PlatformTransactionManager manager,
        EmailVerificationSettings settings, EmailVerificationTransport transport, Clock clock) {
        this.jdbc=jdbc; tx=new TransactionTemplate(manager); this.settings=settings; this.transport=transport; this.clock=clock;
    }
    public EmailVerificationState state(CurrentUser user) {
        requireEnabled();
        return tx.execute(ignored -> stateLocked(user,now()));
    }
    public EmailVerificationState issue(CurrentUser user, String rawEmail, UUID requestId) {
        requireEnabled();
        String email=EmailVerificationCrypto.normalizeEmail(rawEmail);
        if (requestId==null) throw AuthException.badRequest("EMAIL_REQUEST_INVALID","A request identifier is required");
        Issuance issued=tx.execute(ignored -> issueLocked(user,email,requestId,null,now()));
        return dispatch(user,issued);
    }
    public EmailVerificationState resend(CurrentUser user,UUID challengeId,UUID requestId) {
        requireEnabled();
        if (challengeId==null || requestId==null) throw AuthException.badRequest("EMAIL_REQUEST_INVALID","A request identifier is required");
        Issuance issued=tx.execute(ignored -> {
            identity(user);
            List<UUID> retry=jdbc.query("SELECT parent_challenge_id FROM auth_email_challenge WHERE identity_id=? AND request_id=?",
                (rs,row)->rs.getObject(1,UUID.class),user.identityId(),requestId);
            if (!retry.isEmpty()) {
                if (!challengeId.equals(retry.getFirst())) throw AuthException.conflict("EMAIL_REQUEST_CONFLICT","This verification request cannot be reused");
                return null;
            }
            List<Challenge> rows=jdbc.query("SELECT * FROM auth_email_challenge WHERE identity_id=? ORDER BY created_at DESC LIMIT 1",this::challenge,user.identityId());
            if (rows.isEmpty() || !rows.getFirst().id.equals(challengeId) ||
                !List.of("PENDING","EXPIRED","EXHAUSTED").contains(rows.getFirst().status)) throw invalidCode();
            return issueLocked(user,rows.getFirst().email,requestId,challengeId,now());
        });
        return dispatch(user,issued);
    }
    private EmailVerificationState dispatch(CurrentUser user,Issuance issued) {
        if (issued!=null) {
            // Do not keep a transaction/row lock open while contacting ACS through Notification.
            String delivery;
            try { delivery=transport.send(issued.id,user.identityId(),issued.email,issued.code,issued.expiresAt); }
            catch (Exception ignored) { delivery="UNKNOWN"; }
            if (!List.of("ACCEPTED","UNKNOWN","UNAVAILABLE").contains(delivery)) delivery="UNKNOWN";
            jdbc.update("UPDATE auth_email_challenge SET delivery_status=? WHERE id=? AND delivery_status='PENDING'",
                delivery,issued.id);
        }
        return state(user);
    }
    private Issuance issueLocked(CurrentUser user, String email, UUID requestId, UUID parentChallenge, Instant now) {
        Identity identity=identity(user);
        List<Challenge> previous=jdbc.query("SELECT * FROM auth_email_challenge WHERE identity_id=? AND request_id=?",
            this::challenge,user.identityId(),requestId);
        if (!previous.isEmpty()) {
            if (!previous.getFirst().email.equals(email)) throw AuthException.conflict("EMAIL_REQUEST_CONFLICT","This verification request cannot be reused");
            return null;
        }
        if (identity.verified && email.equals(identity.email)) {
            int changed=jdbc.update("UPDATE auth_email_challenge SET status='SUPERSEDED',completed_at=? WHERE identity_id=? AND status='PENDING'",
                Timestamp.from(now),user.identityId());
            if (changed>0) audit(user.identityId(),null,"REPLACEMENT_CANCELLED",identity.revision,now);
            return null;
        }
        List<Instant> recent=jdbc.query("SELECT created_at FROM auth_email_challenge WHERE identity_id=? ORDER BY created_at DESC LIMIT 1",
            (rs,row)->rs.getTimestamp(1).toInstant(),user.identityId());
        if (!recent.isEmpty() && recent.getFirst().plusSeconds(60).isAfter(now)) throw rateLimited();
        Integer count=jdbc.queryForObject("SELECT count(*) FROM auth_email_challenge WHERE identity_id=? AND created_at>?",
            Integer.class,user.identityId(),Timestamp.from(now.minusSeconds(3600)));
        if (count!=null && count>=6) throw rateLimited();
        String recipientKey=EmailVerificationCrypto.recipientKey(settings.codeKey(),email);
        // Serialize destination-wide limits even when different authenticated users target one mailbox.
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement=connection.prepareStatement("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))")) {
                statement.setString(1,recipientKey); statement.execute(); return null;
            }
        });
        count=jdbc.queryForObject("SELECT count(*) FROM auth_email_challenge WHERE recipient_key=? AND created_at>?",
            Integer.class,recipientKey,Timestamp.from(now.minusSeconds(3600)));
        if (count!=null && count>=10) throw rateLimited();
        jdbc.update("UPDATE auth_email_challenge SET status='SUPERSEDED',completed_at=? WHERE identity_id=? AND status='PENDING'",
            Timestamp.from(now),user.identityId());
        UUID id=UUID.randomUUID(); String code=EmailVerificationCrypto.newCode(); Instant expires=now.plusSeconds(600);
        jdbc.update("INSERT INTO auth_email_challenge(id,identity_id,request_id,parent_challenge_id,pending_email,recipient_key,code_mac,status,created_at,expires_at,resend_available_at) " +
            "VALUES(?,?,?,?,?,?,?,'PENDING',?,?,?)",id,user.identityId(),requestId,parentChallenge,email,recipientKey,
            EmailVerificationCrypto.codeMac(settings.codeKey(),user.identityId(),email,id,code),
            Timestamp.from(now),Timestamp.from(expires),Timestamp.from(now.plusSeconds(60)));
        audit(user.identityId(),id,"CHALLENGE_CREATED",identity.revision,now);
        return new Issuance(id,email,code,expires);
    }
    public EmailVerificationState verify(CurrentUser user, UUID challengeId, String code) {
        requireEnabled();
        if (challengeId==null || code==null || !code.matches("[0-9]{6}")) throw invalidCode();
        // Authentication rejection is returned after committing attempt/exhaustion evidence.
        boolean accepted=Boolean.TRUE.equals(tx.execute(ignored -> verifyLocked(user,challengeId,code,now())));
        if (!accepted) throw invalidCode();
        return state(user);
    }
    private boolean verifyLocked(CurrentUser user, UUID id, String code, Instant now) {
        Identity identity=identity(user);
        List<Challenge> rows=jdbc.query("SELECT * FROM auth_email_challenge WHERE id=? AND identity_id=? FOR UPDATE",this::challenge,id,user.identityId());
        if (rows.isEmpty()) return false;
        Challenge challenge=rows.getFirst();
        if (!"PENDING".equals(challenge.status)) return false;
        if (!challenge.expiresAt.isAfter(now)) {
            jdbc.update("UPDATE auth_email_challenge SET status='EXPIRED',completed_at=? WHERE id=?",Timestamp.from(now),id);
            audit(user.identityId(),id,"CHALLENGE_EXPIRED",identity.revision,now); return false;
        }
        String expected=EmailVerificationCrypto.codeMac(settings.codeKey(),user.identityId(),challenge.email,id,code);
        if (!EmailVerificationCrypto.matches(challenge.mac,expected)) {
            int attempts=challenge.attempts+1;
            jdbc.update("UPDATE auth_email_challenge SET attempts=?,status=?,completed_at=? WHERE id=?",
                attempts,attempts>=5?"EXHAUSTED":"PENDING",attempts>=5?Timestamp.from(now):null,id);
            audit(user.identityId(),id,attempts>=5?"ATTEMPTS_EXHAUSTED":"CODE_REJECTED",identity.revision,now); return false;
        }
        long revision=Math.addExact(identity.revision,1);
        jdbc.update("UPDATE auth_identity SET email=?,email_verified=true,email_revision=?,email_verified_at=?,updated_at=? WHERE id=?",
            challenge.email,revision,Timestamp.from(now),Timestamp.from(now),user.identityId());
        jdbc.update("UPDATE auth_email_challenge SET status='VERIFIED',completed_at=? WHERE id=?",Timestamp.from(now),id);
        jdbc.update("INSERT INTO auth_email_projection_outbox(event_id,identity_id,email,email_revision,verified_at,created_at,next_attempt_at) VALUES(?,?,?,?,?,?,?)",
            UUID.randomUUID(),user.identityId(),challenge.email,revision,Timestamp.from(now),Timestamp.from(now),Timestamp.from(now));
        audit(user.identityId(),id,"EMAIL_VERIFIED",revision,now);
        return true;
    }
    private EmailVerificationState stateLocked(CurrentUser user, Instant now) {
        Identity identity=identity(user);
        List<Challenge> pending=jdbc.query("SELECT * FROM auth_email_challenge WHERE identity_id=? AND status='PENDING' ORDER BY created_at DESC LIMIT 1",
            this::challenge,user.identityId());
        EmailVerificationState.Pending item=null;
        if (!pending.isEmpty()) {
            Challenge p=pending.getFirst();
            item=new EmailVerificationState.Pending(p.id,EmailVerificationCrypto.mask(p.email),p.expiresAt,p.resendAt,p.delivery);
        }
        return new EmailVerificationState(identity.email,identity.verified,identity.revision,item,now);
    }
    private Identity identity(CurrentUser user) {
        if (user==null) throw AuthException.unauthorized("AUTHENTICATION_REQUIRED","Authentication is required");
        List<Identity> rows=jdbc.query("SELECT email,email_verified,email_revision,status,token_version FROM auth_identity WHERE id=? FOR UPDATE",
            (rs,row)->new Identity(rs.getString(1),rs.getBoolean(2),rs.getLong(3),rs.getString(4),rs.getLong(5)),user.identityId());
        if (rows.isEmpty()) throw AuthException.unauthorized("AUTHENTICATION_REQUIRED","Authentication is required");
        Identity identity=rows.getFirst();
        if (!"ACTIVE".equals(identity.status)) throw AuthException.forbidden("IDENTITY_NOT_ACTIVE","Identity is not active");
        if (identity.tokenVersion!=user.tokenVersion()) throw AuthException.unauthorized("AUTHENTICATION_REQUIRED","Authentication is required");
        return identity;
    }
    private Challenge challenge(ResultSet rs,int row) throws SQLException {
        return new Challenge(rs.getObject("id",UUID.class),rs.getString("pending_email"),rs.getString("code_mac"),
            rs.getString("status"),rs.getInt("attempts"),rs.getTimestamp("expires_at").toInstant(),
            rs.getTimestamp("resend_available_at").toInstant(),rs.getString("delivery_status"));
    }
    private void audit(UUID owner,UUID challenge,String action,long revision,Instant now) {
        jdbc.update("INSERT INTO auth_email_audit(id,identity_id,challenge_id,action,email_revision,created_at) VALUES(?,?,?,?,?,?)",
            UUID.randomUUID(),owner,challenge,action,revision,Timestamp.from(now));
    }
    private void requireEnabled() {
        if (!settings.enabled()) throw new AuthException(HttpStatus.SERVICE_UNAVAILABLE,"EMAIL_VERIFICATION_DISABLED","Email verification is temporarily unavailable");
    }
    private Instant now() { return clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MICROS); }
    private static AuthException invalidCode() { return AuthException.badRequest("EMAIL_CODE_INVALID","The code could not be verified. Request a new code if needed."); }
    private static AuthException rateLimited() { return new AuthException(HttpStatus.TOO_MANY_REQUESTS,"EMAIL_VERIFICATION_RATE_LIMITED","Please wait before requesting another verification code"); }
    private record Identity(String email,boolean verified,long revision,String status,long tokenVersion) { }
    private record Challenge(UUID id,String email,String mac,String status,int attempts,Instant expiresAt,Instant resendAt,String delivery) { }
    private record Issuance(UUID id,String email,String code,Instant expiresAt) {
        @Override public String toString() { return "Issuance[REDACTED]"; }
    }
}
