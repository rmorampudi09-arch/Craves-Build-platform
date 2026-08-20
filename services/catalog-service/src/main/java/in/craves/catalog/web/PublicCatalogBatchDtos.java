package in.craves.catalog.web;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public final class PublicCatalogBatchDtos {
    private PublicCatalogBatchDtos() {
    }

    public record ResolveMenuItemsRequest(
        @NotEmpty @Size(max = 100) List<@NotNull UUID> menuItemIds
    ) {
    }

    public record ResolvedMenuItemResponse(
        UUID id,
        UUID kitchenId,
        String itemName,
        BigDecimal price,
        String currency,
        Integer unitPackageWeightGrams,
        Boolean thermoboxRequired
    ) {
    }
}
