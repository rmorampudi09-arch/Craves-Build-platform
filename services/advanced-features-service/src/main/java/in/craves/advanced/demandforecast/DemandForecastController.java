package in.craves.advanced.demandforecast;

import in.craves.advanced.demandforecast.DemandForecastDtos.DemandForecast;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** How many portions of each dish the chef's kitchen usually gets on that weekday, so they can plan shopping and prep. */
@RestController
@RequestMapping("/api/v1/advanced/demand-forecast")
public class DemandForecastController {
    private final DemandForecastService service;

    public DemandForecastController(DemandForecastService service) {
        this.service = service;
    }

    @GetMapping("/dishes")
    public ResponseEntity<DemandForecast> dishDemandForecast(@RequestParam("date") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        CurrentUser.requireAnyRole(Roles.CHEF);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.forDate(CurrentUser.bearerToken(), date));
    }
}
