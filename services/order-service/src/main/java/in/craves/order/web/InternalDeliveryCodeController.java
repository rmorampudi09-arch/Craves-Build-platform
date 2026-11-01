package in.craves.order.web;

import in.craves.order.delivery.DeliveryCodeService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Checks the code a Craves rider enters at the door. Does not change the order status. */
@RestController
@RequestMapping("/internal/v1/orders")
public class InternalDeliveryCodeController {
    private final DeliveryCodeService deliveryCodes;
    private final byte[] configuredKey;

    public InternalDeliveryCodeController(
        DeliveryCodeService deliveryCodes,
        @Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String configuredKey
    ) {
        this.deliveryCodes = deliveryCodes;
        this.configuredKey = configuredKey == null
            ? new byte[0] : configuredKey.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/{orderId}/delivery-code/verify")
    public ResponseEntity<Map<String, Object>> verify(
        @PathVariable UUID orderId,
        @RequestBody VerifyRequest request,
        @RequestHeader(value = "X-Craves-Internal-Secret", required = false) String providedKey
    ) {
        byte[] provided = providedKey == null
            ? new byte[0] : providedKey.getBytes(StandardCharsets.UTF_8);
        if (configuredKey.length == 0 || !MessageDigest.isEqual(configuredKey, provided)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        DeliveryCodeService.Verification result = deliveryCodes.verify(orderId, request.code());
        return switch (result.outcome()) {
            case VERIFIED -> respond(HttpStatus.OK, Map.of("verified", true));
            case INVALID -> respond(HttpStatus.UNPROCESSABLE_ENTITY,
                Map.of("code", "DELIVERY_CODE_INVALID", "attemptsLeft", result.attemptsLeft()));
            case LOCKED -> respond(HttpStatus.LOCKED, Map.of("code", "DELIVERY_CODE_LOCKED"));
            case NOT_FOUND -> respond(HttpStatus.NOT_FOUND, Map.of("code", "DELIVERY_CODE_NOT_FOUND"));
        };
    }

    private static ResponseEntity<Map<String, Object>> respond(HttpStatus status, Map<String, Object> body) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);
    }

    public record VerifyRequest(String code) {
    }
}
