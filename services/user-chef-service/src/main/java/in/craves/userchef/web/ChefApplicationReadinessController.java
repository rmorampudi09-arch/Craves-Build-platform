package in.craves.userchef.web;

import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.ChefApplicationReadinessService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/chef/application/readiness")
public class ChefApplicationReadinessController {
    private final ChefApplicationReadinessService service;

    public ChefApplicationReadinessController(ChefApplicationReadinessService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<ChefApplicationReadiness> get(@AuthenticationPrincipal CurrentUser user) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.getReadiness(user));
    }
}
