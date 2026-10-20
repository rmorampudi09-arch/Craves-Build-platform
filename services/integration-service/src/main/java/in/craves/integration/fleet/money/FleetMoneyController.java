package in.craves.integration.fleet.money;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.money.FleetMoneyModels.EarningsPage;
import in.craves.integration.fleet.money.FleetMoneyModels.PayoutsPage;
import in.craves.integration.fleet.money.FleetMoneyModels.TripEarning;
import in.craves.integration.fleet.money.FleetMoneyModels.WithdrawalInput;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The rider's money (rider-v1 /earnings, /payouts, /withdrawals). RIDER only (WebSecurityConfiguration); off unless
 * CRAVES_FLEET_RIDER_API_ENABLED.
 */
@RestController
@RequestMapping("/api/v1/rider")
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetMoneyController {
    private final FleetRiderService riders;
    private final FleetEarnings earnings;
    private final FleetPayouts payouts;

    public FleetMoneyController(FleetRiderService riders, FleetEarnings earnings, FleetPayouts payouts) {
        this.riders = riders;
        this.earnings = earnings;
        this.payouts = payouts;
    }

    @GetMapping("/earnings")
    public ResponseEntity<EarningsPage> earnings(@AuthenticationPrincipal CravesPrincipal principal, @RequestParam String range,
                                                 @RequestParam(required = false) String cursor) {
        return noStore(earnings.earnings(rider(principal), range, cursor));
    }

    @GetMapping("/earnings/trips/{tripId}")
    public ResponseEntity<TripEarning> trip(@AuthenticationPrincipal CravesPrincipal principal, @PathVariable UUID tripId) {
        return noStore(earnings.tripEarning(rider(principal), tripId));
    }

    @GetMapping("/payouts")
    public ResponseEntity<PayoutsPage> payouts(@AuthenticationPrincipal CravesPrincipal principal) {
        return noStore(payouts.payouts(rider(principal)));
    }

    /** One free withdrawal a day, paid by 13:00 the next day. */
    @PostMapping("/withdrawals")
    public ResponseEntity<Void> withdraw(@AuthenticationPrincipal CravesPrincipal principal, @RequestHeader("Idempotency-Key") String key,
                                         @RequestBody WithdrawalInput body) {
        payouts.withdraw(rider(principal), key, body.amountPaise());
        return ResponseEntity.noContent().build();
    }

    UUID rider(CravesPrincipal principal) {
        if (principal == null || principal.identityId() == null) {
            throw new FleetApiException(401, "SIGN_IN_REQUIRED", "Sign in again.");
        }
        return riders.riderId(principal.identityId());
    }

    static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(body);
    }
}
