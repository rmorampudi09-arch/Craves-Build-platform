package in.craves.advanced.support;

import com.nimbusds.jwt.SignedJWT;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderGateway;
import in.craves.advanced.platform.web.ApiProblem;
import java.text.ParseException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Order service as the caller sees it: customers read their own orders, chefs (FakeCatalog.chefKitchens) their kitchen's. */
public final class FakeOrders implements OrderGateway {
    public final Map<UUID, Order> orders = new ConcurrentHashMap<>();
    private final FakeCatalog catalog;
    private final Clock clock;
    public volatile boolean down;

    public FakeOrders(FakeCatalog catalog, Clock clock) {
        this.catalog = catalog;
        this.clock = clock;
    }

    /** A placed order; each line is (menu item, quantity) at the item's Catalog price. */
    public Order place(UUID customer, UUID kitchen, String status, Object... itemsAndQuantities) {
        List<OrderLine> lines = new ArrayList<>();
        for (int i = 0; i < itemsAndQuantities.length; i += 2) {
            MenuItem item = (MenuItem) itemsAndQuantities[i];
            lines.add(new OrderLine(UUID.randomUUID(), item.id(), item.name(), item.pricePaise(), (Integer) itemsAndQuantities[i + 1]));
        }
        long total = lines.stream().mapToLong(line -> line.unitPricePaise() * line.quantity()).sum();
        Order order = new Order(UUID.randomUUID(), customer, kitchen, status, List.copyOf(lines), total, clock.instant(), clock.instant());
        orders.put(order.id(), order);
        return order;
    }

    public void status(UUID orderId, String status) {
        orders.computeIfPresent(orderId, (id, order) -> new Order(id, order.customerId(), order.kitchenId(), status, order.lines(),
                order.grandTotalPaise(), order.createdAt(), clock.instant()));
    }

    public void reset() {
        orders.clear();
        down = false;
    }

    @Override
    public Optional<Order> customerOrder(String customerBearerToken, UUID orderId) {
        check();
        UUID caller = subject(customerBearerToken);
        return Optional.ofNullable(orders.get(orderId)).filter(order -> order.customerId().equals(caller));
    }

    @Override
    public Optional<Order> chefOrder(String chefBearerToken, UUID orderId) {
        check();
        UUID kitchen = catalog.chefKitchens.get(chefBearerToken);
        return Optional.ofNullable(orders.get(orderId)).filter(order -> order.kitchenId().equals(kitchen));
    }

    private void check() {
        if (down) throw ApiProblem.unavailable("ORDERS_UNAVAILABLE", "down");
    }

    private static UUID subject(String token) {
        try {
            return UUID.fromString(SignedJWT.parse(token).getJWTClaimsSet().getSubject());
        } catch (ParseException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
