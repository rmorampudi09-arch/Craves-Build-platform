package in.craves.userchef.email;

import in.craves.userchef.exception.ApiException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthEmailProjectionService {
    public record Event(UUID eventId, UUID identityId, String email, boolean emailVerified, long emailRevision, Instant verifiedAt) {
        @Override public String toString() { return "EmailProjectionEvent[REDACTED]"; }
    }
    public record Receipt(String status, long emailRevision) {}
    private final JdbcTemplate jdbc;
    public AuthEmailProjectionService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    /** Must run inside the caller's transaction, before profile/application writes. */
    public void lockIdentity(UUID identity) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 711))", Object.class, identity.toString());
    }
    public String projectedEmail(UUID identity) {
        var rows = jdbc.query("SELECT email FROM auth_email_projection WHERE identity_id = ?", (rs, n) -> rs.getString(1), identity);
        return rows.isEmpty() ? null : rows.getFirst();
    }
    @Transactional
    public Receipt receive(Event event, String fingerprint) {
        lockIdentity(event.identityId());
        var prior = jdbc.queryForList("SELECT request_fingerprint,result_revision FROM auth_email_projection_receipt WHERE event_id = ?", event.eventId());
        if (!prior.isEmpty()) {
            if (!fingerprint.equals(prior.getFirst().get("request_fingerprint"))) throw conflict();
            return new Receipt("DUPLICATE", ((Number) prior.getFirst().get("result_revision")).longValue());
        }
        var current = jdbc.queryForList("SELECT email,email_revision,verified_at FROM auth_email_projection WHERE identity_id = ?", event.identityId());
        long revision = current.isEmpty() ? 0 : ((Number) current.getFirst().get("email_revision")).longValue();
        String result = "STALE";
        if (revision == event.emailRevision()) {
            if (!event.email().equals(current.getFirst().get("email")) || !event.verifiedAt().equals(((Timestamp)current.getFirst().get("verified_at")).toInstant())) throw conflict();
            result = "DUPLICATE";
        } else if (revision < event.emailRevision()) {
            jdbc.update("INSERT INTO auth_email_projection (identity_id,email,email_revision,verified_at) VALUES (?,?,?,?) " +
                "ON CONFLICT (identity_id) DO UPDATE SET email=EXCLUDED.email,email_revision=EXCLUDED.email_revision,verified_at=EXCLUDED.verified_at,updated_at=now()",
                event.identityId(), event.email(), event.emailRevision(), Timestamp.from(event.verifiedAt()));
            jdbc.update("UPDATE customer_profile SET email = ?, updated_at = now() WHERE identity_id = ?", event.email(), event.identityId());
            jdbc.update("UPDATE chef_application SET email = ?, updated_at = now() WHERE identity_id = ?", event.email(), event.identityId());
            revision = event.emailRevision(); result = "APPLIED";
        }
        jdbc.update("INSERT INTO auth_email_projection_receipt(event_id,identity_id,request_fingerprint,event_revision,result_revision,result) VALUES (?,?,?,?,?,?)",
            event.eventId(), event.identityId(), fingerprint, event.emailRevision(), revision, result);
        return new Receipt(result, revision);
    }
    public static boolean valid(Event event, Instant now) {
        return event != null && event.eventId() != null && event.identityId() != null && validEmail(event.email()) && event.emailVerified() &&
            event.emailRevision() > 0 && event.verifiedAt() != null && !event.verifiedAt().isAfter(now.plusSeconds(300));
    }
    public static boolean validEmail(String value) {
        return value != null && value.length() <= 254 && value.equals(value.trim()) &&
            value.matches("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+");
    }
    private static ApiException conflict() { return ApiException.conflict("EMAIL_PROJECTION_CONFLICT", "Email projection conflict"); }
}
