package in.craves.order.advanced;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * M24e kitchen load: how busy a kitchen is right now, as extra minutes on top of its usual preparation time, from its open orders.
 * Nobody sees the order count. Off until operations set both numbers (CRAVES_KITCHEN_LOAD_MINUTES_PER_OPEN_ORDER, 1-60, and
 * CRAVES_KITCHEN_LOAD_MAX_EXTRA_MINUTES, 1-240); nothing is invented here, and an unset or invalid value keeps it off.
 */
@Component
public class KitchenLoad {
    public record KitchenLoadResponse(UUID kitchenId, boolean configured, Integer extraMinutes, Boolean busy) { }

    /** Orders the kitchen still has to cook: not yet accepted, accepted or preparing. Ready orders no longer load the kitchen. */
    static final String OPEN_ORDERS = "SELECT count(*) FROM order_schema.customer_order WHERE kitchen_id = ? "
            + "AND status IN ('PAID', 'CHEF_ACCEPTANCE_PENDING', 'CHEF_ACCEPTED', 'PREPARING') "
            // shortcut: scheduled and subscription orders count once due within the hour; make it an operations setting if kitchens plan further ahead.
            + "AND (COALESCE(requested_fulfilment_at, scheduled_service_at) IS NULL OR COALESCE(requested_fulfilment_at, scheduled_service_at) <= ?) "
            // shortcut: an order still open 6 hours after it was due is stuck (OrderAlertMonitor reports those), so it stops counting.
            + "AND COALESCE(requested_fulfilment_at, scheduled_service_at, created_at) > ?";
    static final Duration DUE_SOON = Duration.ofHours(1);
    static final Duration STUCK_AFTER = Duration.ofHours(6);
    /** Every replica asks the database at most once per kitchen in this time. */
    static final Duration FRESH = Duration.ofSeconds(30);
    private static final int MAX_CACHED = 10_000;
    private static final Logger log = LoggerFactory.getLogger(KitchenLoad.class);
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final Integer minutesPerOrder;
    private final Integer maxExtraMinutes;
    private final ConcurrentHashMap<UUID, Cached> cache = new ConcurrentHashMap<>();
    /** One database connection at most for this read on each replica, so a flood of kitchen ids can never starve checkout. */
    private final Semaphore reads = new Semaphore(1);

    private record Cached(Instant at, KitchenLoadResponse value) { }

    @Autowired
    public KitchenLoad(JdbcTemplate jdbc, @Value("${CRAVES_KITCHEN_LOAD_MINUTES_PER_OPEN_ORDER:}") String minutesPerOrder,
                       @Value("${CRAVES_KITCHEN_LOAD_MAX_EXTRA_MINUTES:}") String maxExtraMinutes) {
        this(jdbc, Clock.systemUTC(), minutesPerOrder, maxExtraMinutes);
    }

    KitchenLoad(JdbcTemplate jdbc, Clock clock, String minutesPerOrder, String maxExtraMinutes) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.minutesPerOrder = setting("CRAVES_KITCHEN_LOAD_MINUTES_PER_OPEN_ORDER", minutesPerOrder, 60);
        this.maxExtraMinutes = setting("CRAVES_KITCHEN_LOAD_MAX_EXTRA_MINUTES", maxExtraMinutes, 240);
    }

    public KitchenLoadResponse load(UUID kitchenId) {
        if (minutesPerOrder == null || maxExtraMinutes == null) return new KitchenLoadResponse(kitchenId, false, null, null);
        Instant now = clock.instant();
        Cached hit = cache.get(kitchenId);
        if (hit != null && hit.at().plus(FRESH).isAfter(now)) return hit.value();
        if (!reads.tryAcquire()) {
            // Busy: the last answer if there is one, otherwise "not known right now".
            return hit != null ? hit.value() : new KitchenLoadResponse(kitchenId, true, null, null);
        }
        try {
            Integer open = jdbc.queryForObject(OPEN_ORDERS, Integer.class, kitchenId, Timestamp.from(now.plus(DUE_SOON)),
                    Timestamp.from(now.minus(STUCK_AFTER)));
            KitchenLoadResponse value = answer(kitchenId, open == null ? 0 : open);
            if (cache.size() >= MAX_CACHED) cache.values().removeIf(old -> !old.at().plus(FRESH).isAfter(now));
            if (cache.size() < MAX_CACHED) cache.put(kitchenId, new Cached(now, value));
            return value;
        } finally {
            reads.release();
        }
    }

    /**
     * Open orders times the minutes per order, rounded up to steps of at least 15 minutes and three orders, then capped: one more
     * order does not change the answer, so the figure does not give away how many orders a kitchen has.
     */
    KitchenLoadResponse answer(UUID kitchenId, int openOrders) {
        long minutes = (long) openOrders * minutesPerOrder;
        long step = ((Math.max(15L, 3L * minutesPerOrder) + 4) / 5) * 5;
        int extra = (int) Math.min(maxExtraMinutes, ((minutes + step - 1) / step) * step);
        return new KitchenLoadResponse(kitchenId, true, extra, extra > 0);
    }

    static Integer setting(String name, String raw, int max) {
        if (raw == null || raw.isBlank()) return null;
        try {
            int value = Integer.parseInt(raw.strip());
            if (value >= 1 && value <= max) return value;
        } catch (NumberFormatException ignored) {
            // reported below
        }
        log.warn("{} must be a whole number from 1 to {}; kitchen load stays off", name, max);
        return null;
    }
}
