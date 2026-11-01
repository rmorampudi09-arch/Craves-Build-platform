package in.craves.advanced.platform.clients;

import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.clients.OrderGateway.OrderPage;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Component;

/**
 * Reads a chef's own orders back to a point in time, newest first, with the chef's token (M15 insights, M16 forecasts).
 * Bounded per replica so these reads never use up the Order-service connections other modules share.
 */
@Component
public class ChefOrderHistory {
    /** shortcut: at most 30 pages (3,000 orders), about 10 s and 4 reads at a time per replica; store daily rollups if kitchens outgrow it. */
    static final int MAX_PAGES = 30;
    static final int MAX_CONCURRENT = 4;
    static final long DEADLINE_NANOS = 10_000_000_000L;
    private final Semaphore running = new Semaphore(MAX_CONCURRENT);
    private final OrderGateway orders;

    public ChefOrderHistory(OrderGateway orders) {
        this.orders = orders;
    }

    /** complete is false when a bound stopped the read before it reached {@code since}; the orders are then the newest ones. */
    public record History(List<Order> orders, boolean complete) { }

    public History since(String chefToken, Instant since) {
        if (!running.tryAcquire()) throw new ApiProblem(503, "ORDER_HISTORY_BUSY", "This is busy right now; try again in a minute");
        try {
            long deadline = System.nanoTime() + DEADLINE_NANOS;
            List<Order> collected = new ArrayList<>();
            String cursor = null;
            for (int page = 0; page < MAX_PAGES && (page == 0 || System.nanoTime() < deadline); page++) {
                OrderPage result = orders.chefOrderPage(chefToken, cursor);
                collected.addAll(result.orders());
                Order oldest = result.orders().isEmpty() ? null : result.orders().get(result.orders().size() - 1);
                if (result.nextCursor() == null || oldest == null || (oldest.createdAt() != null && oldest.createdAt().isBefore(since))) {
                    return new History(List.copyOf(collected), true);
                }
                cursor = result.nextCursor();
            }
            return new History(List.copyOf(collected), false);
        } finally {
            running.release();
        }
    }
}
