package in.craves.integration.delivery;

import in.craves.integration.delivery.shiprocket.ShiprocketPickupProvisioningService;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(prefix = "craves.providers.shiprocket", name = "enabled", havingValue = "true")
@RequestMapping("/internal/v1/delivery-pickup-locations")
public class PickupLocationProvisioningController {
    private final InternalRequestAuthorizer internalRequestAuthorizer;
    private final ShiprocketPickupProvisioningService shiprocketProvisioningService;

    public PickupLocationProvisioningController(
        InternalRequestAuthorizer internalRequestAuthorizer,
        ShiprocketPickupProvisioningService shiprocketProvisioningService
    ) {
        this.internalRequestAuthorizer = internalRequestAuthorizer;
        this.shiprocketProvisioningService = shiprocketProvisioningService;
    }

    @PostMapping("/provision")
    public ResponseEntity<Map<String, Object>> provision(
        @RequestHeader(value = "X-Craves-Internal-Secret", required = false) String internalSecret,
        @RequestBody PickupLocationProvisioningRequest request
    ) {
        internalRequestAuthorizer.requireAuthorized(internalSecret);
        ShiprocketPickupProvisioningService.ProvisioningResult result =
            shiprocketProvisioningService.provision(request);
        return ResponseEntity.ok(Map.of(
            "pickupLocationId", request.pickupLocationId(),
            "provider", result.providerId(),
            "externalLocationCode", result.externalLocationCode(),
            "created", result.created(),
            "verified", true
        ));
    }

    public record PickupLocationProvisioningRequest(
        UUID pickupLocationId,
        UUID kitchenId,
        int versionNumber,
        String kitchenName,
        String contactPhone,
        String contactEmail,
        String addressLine1,
        String addressLine2,
        String landmark,
        String areaName,
        String city,
        String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude,
        String country
    ) {
    }
}
