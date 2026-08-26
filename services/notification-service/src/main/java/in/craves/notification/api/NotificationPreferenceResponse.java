package in.craves.notification.api;

import java.time.OffsetDateTime;
import java.util.UUID;

public record NotificationPreferenceResponse(
    UUID id,
    UUID recipientIdentityId,
    String userRole,
    NotificationPreferenceCategory category,
    boolean inAppEnabled,
    boolean pushEnabled,
    boolean emailEnabled,
    boolean smsEnabled,
    OffsetDateTime updatedAt
) {
}
