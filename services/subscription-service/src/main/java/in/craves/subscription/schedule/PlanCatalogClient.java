package in.craves.subscription.schedule;

import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PlanCatalogClient {
    private static final String INTERNAL_HEADER = "X-Craves-Internal-Key";

    private final RestClient restClient;
    private final String internalAccessValue;

    public PlanCatalogClient(
        @Value("${craves.catalog.base-url:https://api.craves.in/api/v1/catalog}") String baseUrl,
        @Value("${craves.catalog.internal-access-value:}") String internalAccessValue,
        RestClient.Builder builder
    ) {
        this.restClient = builder.baseUrl(baseUrl).build();
        this.internalAccessValue = internalAccessValue;
    }

    public MenuItem requireSellableOwnedItem(UUID menuItemId, UUID expectedChefIdentityId) {
        try {
            MenuItem item = restClient.get()
                .uri("/menu-items/{menuItemId}", menuItemId)
                .retrieve()
                .body(MenuItem.class);
            if (item == null || item.id() == null || item.kitchenId() == null || item.itemName() == null
                || item.itemName().isBlank() || item.price() == null || item.currency() == null || item.currency().isBlank()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Catalog returned an incomplete menu item");
            }
            if (!item.available() || !"ACTIVE".equalsIgnoreCase(item.status())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Menu item is not active and available");
            }
            // The public kitchen profile hides the chef's identity, so ownership is read from Catalog's internal route.
            Kitchen kitchen = restClient.get()
                .uri("/internal/kitchens/{kitchenId}", item.kitchenId())
                .header(INTERNAL_HEADER, requireInternalAccess())
                .retrieve()
                .body(Kitchen.class);
            if (kitchen == null || kitchen.identityId() == null
                || !kitchen.identityId().equals(expectedChefIdentityId)
                || !"ACTIVE".equalsIgnoreCase(kitchen.status())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Menu item does not belong to the plan chef");
            }
            return item;
        } catch (HttpClientErrorException.NotFound exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Menu item or kitchen is unavailable");
        }
    }

    private String requireInternalAccess() {
        if (!StringUtils.hasText(internalAccessValue)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Catalog internal access is not configured");
        }
        return internalAccessValue;
    }

    public record MenuItem(
        UUID id,
        UUID kitchenId,
        String itemName,
        String category,
        String foodType,
        BigDecimal price,
        String currency,
        boolean available,
        String status
    ) {
    }

    public record Kitchen(UUID id, UUID identityId, String status) {
    }
}
