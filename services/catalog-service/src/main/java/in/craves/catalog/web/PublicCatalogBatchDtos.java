package in.craves.catalog.web;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public final class PublicCatalogBatchDtos {
    private PublicCatalogBatchDtos() {
    }

    public record ResolveMenuItemsRequest(
        @NotEmpty @Size(max = 100) List<UUID> menuItemIds
    ) {
    }
}
