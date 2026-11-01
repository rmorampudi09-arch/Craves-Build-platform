package in.craves.advanced.platform.clients;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Read-only view of the Catalog service, always through the public gateway (Catalog stays authoritative). */
public interface CatalogGateway {
    /** A menu item as Catalog publishes it. {@code pricePaise} is null when Catalog withholds it. */
    record MenuItem(UUID id, UUID kitchenId, String name, Long pricePaise) { }

    /** Items that can be bought right now (active, available, eligible kitchen). Missing ids are not purchasable. */
    Map<UUID, MenuItem> purchasable(Collection<UUID> menuItemIds);

    /** A published item Catalog shows publicly: active, available today, in an eligible kitchen. Empty otherwise (switched off today included). */
    Optional<MenuItem> menuItem(UUID menuItemId);

    boolean kitchenExists(UUID kitchenId);

    /** The calling chef's own menu items (uses the chef's own token). */
    Map<UUID, MenuItem> chefMenuItems(String chefBearerToken);
}
