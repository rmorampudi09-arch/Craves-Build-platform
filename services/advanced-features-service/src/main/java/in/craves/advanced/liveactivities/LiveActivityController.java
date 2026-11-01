package in.craves.advanced.liveactivities;

import in.craves.advanced.liveactivities.LiveActivityDtos.LiveActivityRegistration;
import in.craves.advanced.liveactivities.LiveActivityDtos.LiveActivityView;
import in.craves.advanced.liveactivities.LiveActivityDtos.LiveOrderState;
import in.craves.advanced.platform.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A customer's own orders only; each order is read from Order service with the caller's token. */
@RestController
@RequestMapping("/api/v1/advanced/live-activities")
public class LiveActivityController {
    private final LiveActivityService service;

    public LiveActivityController(LiveActivityService service) {
        this.service = service;
    }

    @GetMapping("/orders/{orderId}/state")
    public ResponseEntity<LiveOrderState> liveOrderState(@PathVariable UUID orderId) {
        return ok(service.state(CurrentUser.id(), CurrentUser.bearerToken(), orderId));
    }

    @PutMapping("/orders/{orderId}")
    public ResponseEntity<LiveOrderState> startLiveActivity(@PathVariable UUID orderId, @Valid @RequestBody LiveActivityRegistration request) {
        return ok(service.register(CurrentUser.id(), CurrentUser.bearerToken(), orderId, request.pushToken()));
    }

    @DeleteMapping("/orders/{orderId}")
    public ResponseEntity<Void> endLiveActivity(@PathVariable UUID orderId) {
        service.end(CurrentUser.id(), orderId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<List<LiveActivityView>> myLiveActivities() {
        return ok(service.mine(CurrentUser.id()));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
