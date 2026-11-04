package in.craves.auth.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record IdentityResponse(
    UUID id,
    String firebaseUid,
    String phoneNumber,
    String email,
    boolean emailVerified,
    String displayName,
    String status,
    List<String> roles,
    Instant lastLoginAt,
    PendingDeletion pendingDeletion
) {
    /** The person's open account deletion request, for the app banner; null when there is none. */
    public record PendingDeletion(UUID requestId, String scope, String status, Instant dueAt) {
    }
}
