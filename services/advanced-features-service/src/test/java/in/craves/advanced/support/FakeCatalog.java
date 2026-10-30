package in.craves.advanced.support;

import in.craves.advanced.platform.clients.CatalogGateway;
import in.craves.advanced.platform.web.ApiProblem;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

public final class FakeCatalog implements CatalogGateway {
    public final Map<UUID, MenuItem> items = new ConcurrentHashMap<>();
    public final Set<UUID> unavailable = ConcurrentHashMap.newKeySet();
    public final Set<UUID> kitchens = ConcurrentHashMap.newKeySet();
    /** chef token -> kitchen id */
    public final Map<String, UUID> chefKitchens = new ConcurrentHashMap<>();
    public volatile boolean down;

    public MenuItem add(UUID kitchenId, String name, long pricePaise) {
        kitchens.add(kitchenId);
        MenuItem item = new MenuItem(UUID.randomUUID(), kitchenId, name, pricePaise);
        items.put(item.id(), item);
        return item;
    }

    public void reset() {
        items.clear();
        unavailable.clear();
        kitchens.clear();
        chefKitchens.clear();
        down = false;
    }

    private void check() {
        if (down) throw ApiProblem.unavailable("CATALOG_UNAVAILABLE", "down");
    }

    @Override
    public Map<UUID, MenuItem> purchasable(Collection<UUID> menuItemIds) {
        check();
        return menuItemIds.stream().distinct().filter(items::containsKey).filter(id -> !unavailable.contains(id))
                .collect(Collectors.toMap(id -> id, items::get));
    }

    @Override
    public Optional<MenuItem> menuItem(UUID menuItemId) {
        check();
        return Optional.ofNullable(items.get(menuItemId));
    }

    @Override
    public boolean kitchenExists(UUID kitchenId) {
        check();
        return kitchens.contains(kitchenId);
    }

    @Override
    public Map<UUID, MenuItem> chefMenuItems(String chefBearerToken) {
        check();
        UUID kitchen = chefKitchens.get(chefBearerToken);
        if (kitchen == null) throw ApiProblem.forbidden("CHEF_KITCHEN_REQUIRED", "An approved chef kitchen is required");
        return items.values().stream().filter(item -> kitchen.equals(item.kitchenId())).collect(Collectors.toMap(MenuItem::id, item -> item));
    }
}
