package in.craves.notification.api;

import in.craves.notification.service.NotificationService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/notifications")
public class AppNotificationController {
    private final NotificationService notificationService;

    public AppNotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping("/in-app")
    public List<AppNoticeResponse> list(@RequestHeader(value = "X-Craves-" + "Identity-Id", required = false) String identityId,
                                        @RequestParam(defaultValue = "50") int limit) {
        return notificationService.appNotices(parseIdentity(identityId), limit);
    }

    @PatchMapping("/in-app/{noticeId}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@RequestHeader(value = "X-Craves-" + "Identity-Id", required = false) String identityId,
                         @PathVariable UUID noticeId) {
        notificationService.markRead(parseIdentity(identityId), noticeId);
    }

    private static UUID parseIdentity(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identity header is required");
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identity header is invalid");
        }
    }
}
