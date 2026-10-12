package in.craves.order.web;

import in.craves.order.delivery.DeliveryHandoffEligibilityService;
import in.craves.order.delivery.DeliveryHandoffEligibilityService.Eligibility;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/internal/v1/delivery-handoff-eligibility")
public class InternalDeliveryHandoffEligibilityController {
    private final DeliveryHandoffEligibilityService eligibility;
    private final byte[] configuredKey;

    public InternalDeliveryHandoffEligibilityController(
        DeliveryHandoffEligibilityService eligibility,
        @Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String configuredKey
    ) {
        this.eligibility = eligibility;
        this.configuredKey = configuredKey == null
            ? new byte[0] : configuredKey.getBytes(StandardCharsets.UTF_8);
    }

    @GetMapping("/{chefSubOrderId}")
    public ResponseEntity<Eligibility> check(
        @PathVariable UUID chefSubOrderId,
        @RequestParam UUID checkoutId,
        @RequestParam UUID deliveryJobId,
        @RequestParam String borzoProviderDeliveryId,
        @RequestHeader(value = "X-Craves-Internal-Secret", required = false) String providedKey
    ) {
        byte[] provided = providedKey == null
            ? new byte[0] : providedKey.getBytes(StandardCharsets.UTF_8);
        if (configuredKey.length == 0 || !MessageDigest.isEqual(configuredKey, provided)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .body(eligibility.check(chefSubOrderId, checkoutId,
                deliveryJobId, borzoProviderDeliveryId));
    }
}
