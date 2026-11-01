package in.craves.userchef.web;

import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.CustomerLaunchAlertService;
import in.craves.userchef.service.CustomerLaunchAlertService.LaunchAlertRequest;
import in.craves.userchef.service.CustomerLaunchAlertService.LaunchAlertStatus;
import jakarta.validation.Valid;
import java.math.BigDecimal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customer/launch-alerts")
public class CustomerLaunchAlertController {
    private final CustomerLaunchAlertService service;

    public CustomerLaunchAlertController(CustomerLaunchAlertService service) {
        this.service = service;
    }

    @GetMapping
    public LaunchAlertStatus status(
        @AuthenticationPrincipal CurrentUser user,
        @RequestParam BigDecimal latitude,
        @RequestParam BigDecimal longitude
    ) {
        return service.status(user, latitude, longitude);
    }

    @PutMapping
    public LaunchAlertStatus subscribe(
        @AuthenticationPrincipal CurrentUser user,
        @Valid @RequestBody LaunchAlertRequest request
    ) {
        return service.subscribe(user, request);
    }
}
