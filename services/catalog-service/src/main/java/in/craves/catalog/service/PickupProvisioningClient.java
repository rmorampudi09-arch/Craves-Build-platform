package in.craves.catalog.service;

import in.craves.catalog.config.PickupProvisioningProperties;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Component
public class PickupProvisioningClient {
    private final PickupProvisioningProperties properties;
    private final RestClient restClient;

    public PickupProvisioningClient(PickupProvisioningProperties properties, RestClient.Builder builder) {
        this.properties = properties;
        this.restClient = builder.build();
    }

    public void provision(PickupSnapshot snapshot) {
        if (!StringUtils.hasText(properties.getIntegrationBaseUrl())
            || !StringUtils.hasText(properties.getInternalServiceKey())) {
            throw new IllegalStateException("Pickup provisioning Integration URL/internal key is not configured");
        }
        String base = properties.getIntegrationBaseUrl().trim();
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        restClient.post()
            .uri(base + "/internal/v1/delivery-pickup-locations/provision")
            .header("X-Craves-Internal-Secret", properties.getInternalServiceKey())
            .body(snapshot)
            .retrieve()
            .toBodilessEntity();
    }

    public record PickupSnapshot(
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
