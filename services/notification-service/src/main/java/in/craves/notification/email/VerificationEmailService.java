package in.craves.notification.email;

import java.sql.Timestamp;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class VerificationEmailService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final VerificationEmailTransport transport;
    public VerificationEmailService(JdbcTemplate jdbc, PlatformTransactionManager transactions, VerificationEmailTransport transport) {
        this.jdbc = jdbc; this.tx = new TransactionTemplate(transactions); this.transport = transport;
    }
    public VerificationEmailTransport.Outcome deliver(VerificationEmailRequest request, String fingerprint) {
        // Commit the claim before contacting ACS. Any process/network failure remains UNKNOWN, never resendable.
        Claim claim = tx.execute(ignored -> {
            int inserted = jdbc.update("INSERT INTO notification_schema.auth_email_verification_receipt " +
                "(challenge_id,identity_id,request_fingerprint,status,expires_at) VALUES (?,?,?,'UNKNOWN',?) ON CONFLICT DO NOTHING",
                request.challengeId(), request.identityId(), fingerprint, Timestamp.from(request.expiresAt()));
            var receipt = jdbc.queryForMap("SELECT identity_id,request_fingerprint,status FROM notification_schema.auth_email_verification_receipt WHERE challenge_id = ? FOR UPDATE", request.challengeId());
            if (!request.identityId().equals(receipt.get("identity_id")) || !fingerprint.equals(receipt.get("request_fingerprint")))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_REQUEST_CONFLICT");
            return new Claim(inserted == 1, String.valueOf(receipt.get("status")));
        });
        if (claim == null) return VerificationEmailTransport.Outcome.UNKNOWN;
        if (!claim.created()) return switch (claim.status()) {
            case "ACCEPTED" -> VerificationEmailTransport.Outcome.ACCEPTED;
            case "FAILED" -> VerificationEmailTransport.Outcome.UNAVAILABLE;
            default -> VerificationEmailTransport.Outcome.UNKNOWN;
        };
        VerificationEmailTransport.Outcome result;
        try { result = transport.send(request); }
        catch (RuntimeException ex) { result = VerificationEmailTransport.Outcome.UNKNOWN; }
        if (result != VerificationEmailTransport.Outcome.UNKNOWN) {
            String status = result == VerificationEmailTransport.Outcome.ACCEPTED ? "ACCEPTED" : "FAILED";
            try { tx.executeWithoutResult(ignored -> jdbc.update("UPDATE notification_schema.auth_email_verification_receipt SET status = ?, completed_at = now() WHERE challenge_id = ? AND status = 'UNKNOWN'", status, request.challengeId())); }
            catch (RuntimeException ex) { return VerificationEmailTransport.Outcome.UNKNOWN; }
        }
        return result;
    }
    private record Claim(boolean created, String status) {}
}
