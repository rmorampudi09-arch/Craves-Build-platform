package in.craves.notification.email;

import java.time.Instant;
import java.util.UUID;

/** Transient only. Never serialize into queues, audit, logs or exception messages. */
public record VerificationEmailRequest(UUID challengeId, UUID identityId, String email, String code, Instant expiresAt) {
    public boolean valid(Instant now) {
        return challengeId != null && identityId != null && validEmail(email) && code != null && code.matches("[0-9]{6}") &&
            expiresAt != null && expiresAt.isAfter(now) && !expiresAt.isAfter(now.plusSeconds(660));
    }
    public static boolean validEmail(String email) {
        return email != null && email.length() <= 254 && email.equals(email.trim()) &&
            email.matches("[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+");
    }
    @Override public String toString() { return "VerificationEmailRequest[REDACTED]"; }
}
