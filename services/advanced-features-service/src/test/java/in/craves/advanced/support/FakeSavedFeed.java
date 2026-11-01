package in.craves.advanced.support;

import in.craves.advanced.platform.clients.SavedFeedGateway;
import in.craves.advanced.platform.web.ApiProblem;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Favorites, kitchen states and delivered-order history keyed by the caller's token (without "Bearer "). */
public final class FakeSavedFeed implements SavedFeedGateway {
    public final Map<String, List<SavedItem>> dishes = new ConcurrentHashMap<>();
    public final Map<String, List<SavedItem>> kitchens = new ConcurrentHashMap<>();
    public final Map<String, History> history = new ConcurrentHashMap<>();
    public final Map<UUID, KitchenState> states = new ConcurrentHashMap<>();
    public final List<Collection<UUID>> resolveCalls = new ArrayList<>();
    public volatile boolean down;

    public void reset() {
        dishes.clear();
        kitchens.clear();
        history.clear();
        states.clear();
        resolveCalls.clear();
        down = false;
    }

    private void check() {
        if (down) throw ApiProblem.unavailable("FAVORITES_UNAVAILABLE", "down");
    }

    @Override
    public List<SavedItem> favoriteDishes(String token) {
        check();
        return dishes.getOrDefault(token, List.of());
    }

    @Override
    public List<SavedItem> favoriteKitchens(String token) {
        check();
        return kitchens.getOrDefault(token, List.of());
    }

    @Override
    public synchronized Map<UUID, KitchenState> kitchenStates(Collection<UUID> kitchenIds) {
        check();
        resolveCalls.add(List.copyOf(kitchenIds));
        Map<UUID, KitchenState> out = new LinkedHashMap<>();
        for (UUID id : kitchenIds) {
            out.put(id, states.getOrDefault(id, new KitchenState(id, false, null, "MISSING", null, false, 0, List.of())));
        }
        return out;
    }

    @Override
    public History deliveredOrders(String token) {
        check();
        return history.getOrDefault(token, new History(List.of(), true));
    }
}
