package in.craves.notification.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record UpdateNotificationPreferencesRequest(
    @NotEmpty List<@Valid UpdateNotificationPreferenceRequest> preferences
) {
}
