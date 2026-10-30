package in.craves.advanced.platform.module;

import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/advanced")
public class FeatureStatusController {
    public record FeatureFlag(String id, boolean enabled, boolean available) { }

    private final ModuleRuntime runtime;

    public FeatureStatusController(ModuleRuntime runtime) {
        this.runtime = runtime;
    }

    /** Public: lets the apps show or hide each feature. No internals. */
    @GetMapping("/features")
    public ResponseEntity<List<FeatureFlag>> features() {
        List<FeatureFlag> flags = runtime.statuses().values().stream().filter(status -> !status.id().equals("platform"))
                .map(status -> new FeatureFlag(status.id(), status.enabled(), status.state() != ModuleRuntime.State.FAILED
                        && status.state() != ModuleRuntime.State.DISABLED))
                .toList();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(flags);
    }

    /** Staff: per-module schema, state and last migration error. */
    @GetMapping("/modules")
    public List<ModuleRuntime.Status> modules() {
        CurrentUser.requireAnyRole(Roles.PLATFORM_ADMIN, Roles.OPERATIONS_ADMIN, Roles.AUDIT_ADMIN);
        return List.copyOf(runtime.statuses().values());
    }
}
