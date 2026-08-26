package in.craves.notification.api;

import in.craves.notification.domain.NotificationChannel;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record NotificationPreferenceUpsertRequest(
    @NotBlank String topic,
    @NotNull NotificationChannel channel,
    @NotNull Boolean enabled
) {}
