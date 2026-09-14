package in.craves.auth.email;

import java.time.Instant;
import java.util.UUID;

public record EmailVerificationState(String email, boolean emailVerified, long emailRevision, Pending pending, Instant serverTime) {
    public record Pending(UUID challengeId, String maskedEmail, Instant expiresAt, Instant resendAvailableAt, String deliveryStatus) { }
}
