package in.craves.auth.email;

import java.time.Instant;
import java.util.UUID;

public interface EmailVerificationTransport {
    String send(UUID challengeId, UUID identityId, String email, String code, Instant expiresAt);
    boolean project(UUID eventId, UUID identityId, String email, long emailRevision, Instant verifiedAt);
}
