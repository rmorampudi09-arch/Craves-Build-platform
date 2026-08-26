package in.craves.notification.api;

import in.craves.notification.security.CravesPrincipal;
import in.craves.notification.service.NotificationPreferenceService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/notification-preferences")
public class NotificationPreferenceController {
    private final NotificationPreferenceService notificationPreferenceService;

    public NotificationPreferenceController(NotificationPreferenceService notificationPreferenceService) {
        this.notificationPreferenceService = notificationPreferenceService;
    }

    @GetMapping
    public List<NotificationPreferenceResponse> list(Authentication authentication) {
        return notificationPreferenceService.list(currentIdentity(authentication));
    }

    @PutMapping
    @ResponseStatus(HttpStatus.OK)
    public NotificationPreferenceResponse upsert(
        Authentication authentication,
        @Valid @RequestBody NotificationPreferenceUpsertRequest request
    ) {
        return notificationPreferenceService.upsert(currentIdentity(authentication), request);
    }

    private static java.util.UUID currentIdentity(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CravesPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves access token is required");
        }
        return principal.identityId();
    }
}
