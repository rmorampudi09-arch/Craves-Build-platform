package in.craves.notification.api;

import jakarta.validation.constraints.NotNull;

public record UpdateNotificationPreferenceRequest(
    @NotNull NotificationPreferenceCategory category,
    @NotNull Boolean inAppEnabled,
    @NotNull Boolean pushEnabled,
    @NotNull Boolean emailEnabled,
    @NotNull Boolean smsEnabled
) {
}
