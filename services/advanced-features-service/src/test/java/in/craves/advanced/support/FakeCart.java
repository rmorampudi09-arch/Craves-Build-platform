package in.craves.advanced.support;

import in.craves.advanced.platform.clients.OrderCartGateway;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class FakeCart implements OrderCartGateway {
    /** token -> (menu item -> quantity) */
    public final Map<String, Map<UUID, Integer>> carts = new ConcurrentHashMap<>();

    @Override
    public int itemCount(String bearerToken) {
        return carts.getOrDefault(bearerToken, Map.of()).size();
    }

    @Override
    public void clear(String bearerToken) {
        carts.remove(bearerToken);
    }

    @Override
    public void add(String bearerToken, UUID menuItemId, int quantity) {
        carts.computeIfAbsent(bearerToken, t -> new ConcurrentHashMap<>()).merge(menuItemId, quantity, Integer::sum);
    }
}
