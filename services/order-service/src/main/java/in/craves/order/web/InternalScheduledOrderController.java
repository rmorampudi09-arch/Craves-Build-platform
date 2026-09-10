package in.craves.order.web;

import in.craves.order.schedule.ScheduledOrderModels.PaymentEligibilityResponse;
import in.craves.order.schedule.ScheduledOrderService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/internal/v1/checkouts")
public class InternalScheduledOrderController {
    private static final String INTERNAL_HEADER = "X-Craves-Internal-Secret";

    private final ScheduledOrderService schedules;
    private final byte[] configuredKey;

    public InternalScheduledOrderController(
        ScheduledOrderService schedules,
        @Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String configuredKey
    ) {
        this.schedules = schedules;
        this.configuredKey = configuredKey == null
            ? new byte[0]
            : configuredKey.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/{checkoutId}/schedule-payment-eligibility")
    public PaymentEligibilityResponse paymentEligibility(
        @PathVariable UUID checkoutId,
        @RequestHeader(value = INTERNAL_HEADER, required = false) String providedKey
    ) {
        byte[] provided = providedKey == null
            ? new byte[0]
            : providedKey.getBytes(StandardCharsets.UTF_8);
        if (configuredKey.length == 0 || !MessageDigest.isEqual(configuredKey, provided)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return schedules.paymentEligibility(checkoutId);
    }
}
