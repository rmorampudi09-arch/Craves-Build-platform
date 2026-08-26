package in.craves.notification.api;

import in.craves.notification.domain.NotificationChannel;
import java.time.OffsetDateTime;
import java.util.UUID;

public record NotificationPreferenceResponse(
    UUID userId,
    String topic,
    NotificationChannel channel,
    boolean enabled,
    OffsetDateTime updatedAt
) {}
