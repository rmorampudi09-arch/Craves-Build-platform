package in.craves.integration.fleet.dispatch;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetConfiguration;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.client.RiderPushClient;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Cancels the Borzo or Pidge courier booked for an order Craves no longer delivers (R16 item 11): every 5 s for orders
 * order-service cancelled (ORDER_CANCELLED, delivery_schema.order_cancelled), and when ops cancels a delivery
 * (FleetOpsService.cancel, before its transaction). Each booking's cancel is a delivery_schema.courier_cancel row: one
 * statement stores the intent and claims the attempt before the courier is called, so two replicas never both call, and
 * the call runs outside any transaction. A failed attempt is tried again a minute later, MAX_ATTEMPTS times in all; then ops
 * gets FLEET_COURIER_CANCEL_FAILED to cancel by hand. A confirmed cancel goes through the delivery-status pipeline at once,
 * as the courier's own callback would.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetCourierCancel {
    static final int MAX_ATTEMPTS = 3;
    /** Longer than a courier call can last (5 s to connect and 20 s to read, twice for Pidge), so attempts never overlap. */
    static final int ATTEMPT_SECONDS = 60;
    static final String ORDER_CANCELLED = "ORDER_CANCELLED";
    static final String OPS_CANCELLED = "OPS_CANCELLED";
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetCourierCancel.class);
    /** A Borzo or Pidge booking still running (the statuses FleetOpsService.Current.courierFinished calls finished end it). */
    private static final String LIVE = "j.provider_id IN ('borzo', 'pidge') AND j.provider_delivery_id IS NOT NULL "
        + "AND j.status NOT IN ('DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED')";
    private static final String BOOKING = "SELECT j.id, j.order_id, j.chef_sub_order_id, j.provider_id, j.provider_delivery_id, j.status ";
    private static final String ROW = " WHERE provider_id = ? AND provider_delivery_id = ?";

    private final JdbcTemplate jdbc;
    private final Map<String, DeliveryProviderAdapter> couriers;
    private final DeliveryStatusUpdateService statusUpdates;
    private final RiderPushClient alerts;

    public FleetCourierCancel(JdbcTemplate jdbc, List<DeliveryProviderAdapter> adapters, DeliveryStatusUpdateService statusUpdates,
                              RiderPushClient alerts) {
        this.jdbc = jdbc;
        this.couriers = adapters.stream().collect(Collectors.toMap(adapter -> adapter.providerId().toLowerCase(Locale.ROOT),
            Function.identity()));
        this.statusUpdates = statusUpdates;
        this.alerts = alerts;
    }

    // Its own job on the fleet pool: a courier slow to answer never holds up the dispatch tick.
    @Scheduled(scheduler = FleetConfiguration.FLEET_SCHEDULER, fixedDelayString = "${craves.fleet.dispatch-tick-ms:5000}")
    public void tick() {
        cancelledOrders();
    }

    /**
     * One attempt for each live booking of a cancelled order that is due one, 10 at most; returns how many were cancelled.
     * Orders order-service cancelled (ORDER_CANCELLED) only, read from that small table: a refund comes before the chef
     * accepts, so before any courier is booked, and a partial refund must never cancel one.
     */
    int cancelledOrders() {
        List<Booking> due = jdbc.query(BOOKING + "FROM delivery_schema.order_cancelled oc JOIN delivery_schema.delivery_job j "
            + "ON j.chef_sub_order_id = oc.chef_sub_order_id WHERE " + LIVE
            + " AND NOT EXISTS (SELECT 1 FROM delivery_schema.courier_cancel c WHERE c.provider_id = j.provider_id "
            + "AND c.provider_delivery_id = j.provider_delivery_id AND (c.cancelled_at IS NOT NULL OR c.attempts >= ? "
            + "OR c.last_attempt_at > now() - make_interval(secs => ?))) ORDER BY j.updated_at LIMIT 10",
            FleetCourierCancel::booking, MAX_ATTEMPTS, ATTEMPT_SECONDS);
        int cancelled = 0;
        for (Booking booking : due) {
            try {
                cancelled += cancel(booking, ORDER_CANCELLED, null) == null ? 1 : 0;
            } catch (RuntimeException exception) {
                LOGGER.warn("FLEET_COURIER_CANCEL provider={} delivery={} failed: {}", booking.provider(), booking.providerDeliveryId(),
                    exception.getMessage());
            }
        }
        return cancelled;
    }

    /**
     * Ops cancelling the delivery of this trip's order, before FleetOpsService.cancel's transaction: its live Borzo or Pidge
     * booking, if any, is cancelled with them first. 409 TRIP_NOT_CANCELLABLE, saying why, when they refuse (their courier
     * may have the food already), or while another attempt or Borzo's switch to Pidge is running. The courier is called
     * before ops's audited transaction, so courier_cancel records who asked (by).
     */
    public void forOps(UUID tripId, Admin by) {
        Booking booking = jdbc.query(BOOKING + "FROM fleet_schema.trip t JOIN delivery_schema.delivery_job j ON j.chef_sub_order_id = "
            + "t.chef_sub_order_id WHERE t.id = ? AND " + LIVE, FleetCourierCancel::booking, tripId).stream().findFirst().orElse(null);
        String refused = booking == null ? null : cancel(booking, OPS_CANCELLED, by);
        if (refused != null) {
            throw FleetApiException.conflict("TRIP_NOT_CANCELLABLE", refused);
        }
    }

    /** Whether Craves cancelled the order's current Borzo or Pidge booking; its status says running until their callback. */
    public boolean cancelled(UUID chefSubOrderId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM delivery_schema.delivery_job j "
            + "JOIN delivery_schema.courier_cancel c ON c.provider_id = j.provider_id AND c.provider_delivery_id = j.provider_delivery_id "
            + "WHERE j.chef_sub_order_id = ? AND c.cancelled_at IS NOT NULL)", Boolean.class, chefSubOrderId));
    }

    /** Null once the booking is cancelled, now or before; otherwise why not, in words for ops. by: the admin, null for the tick. */
    private String cancel(Booking booking, String reason, Admin by) {
        boolean ops = OPS_CANCELLED.equals(reason);
        String courier = "borzo".equals(booking.provider()) ? "Borzo" : "Pidge";
        if (switchingToPidge(booking)) {
            return "Borzo is handing this order to Pidge right now. Try again in a minute.";
        }
        // The intent and this attempt, committed before the call; only one caller gets the row back. Ops may try past the limit,
        // and an ops attempt records its admin (the tick keeps whoever asked before).
        List<Integer> attempt = jdbc.queryForList("""
            INSERT INTO delivery_schema.courier_cancel AS c (provider_id, provider_delivery_id, chef_sub_order_id, reason, requested_by,
              requested_by_name, attempts, last_attempt_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, now())
            ON CONFLICT (provider_id, provider_delivery_id) DO UPDATE SET attempts = c.attempts + 1, last_attempt_at = now(),
              requested_by = COALESCE(EXCLUDED.requested_by, c.requested_by),
              requested_by_name = COALESCE(EXCLUDED.requested_by_name, c.requested_by_name)
            WHERE c.cancelled_at IS NULL AND (? OR c.attempts < ?) AND c.last_attempt_at <= now() - make_interval(secs => ?)
            RETURNING c.attempts""", Integer.class, booking.provider(), booking.providerDeliveryId(), booking.chefSubOrderId(), reason,
            by == null ? null : by.id(), by == null ? null : by.name(), ops, MAX_ATTEMPTS, ATTEMPT_SECONDS);
        if (attempt.isEmpty()) {
            return done(booking) ? null : "Craves is cancelling this " + courier + " delivery right now. Try again in a minute.";
        }
        ProviderDelivery answer;
        try {
            DeliveryProviderAdapter adapter = couriers.get(booking.provider());
            if (adapter == null) {
                throw new IllegalStateException("no " + courier + " client in this service");
            }
            answer = adapter.cancel(booking.providerDeliveryId());
            if (answer == null || answer.status() != DeliveryStatus.CANCELLED) {
                throw new IllegalStateException(courier + " did not confirm the cancel (" + (answer == null ? "no answer" : answer.status()) + ")");
            }
        } catch (RuntimeException refused) {
            String why = safe(refused);
            jdbc.update("UPDATE delivery_schema.courier_cancel SET last_error = ?" + ROW, why, booking.provider(), booking.providerDeliveryId());
            LOGGER.warn("FLEET_COURIER_CANCEL_REFUSED provider={} delivery={} chefSubOrderId={} reason={} attempt={} status={}: {}",
                booking.provider(), booking.providerDeliveryId(), booking.chefSubOrderId(), reason, attempt.get(0), booking.status(), why);
            if (!ops && attempt.get(0) >= MAX_ATTEMPTS) {
                alertOnce(booking, courier, why);
            }
            return courier + " didn't cancel delivery " + booking.providerDeliveryId() + ": " + why + ". If their courier has the food "
                + "already, call " + courier + ".";
        }
        jdbc.update("UPDATE delivery_schema.courier_cancel SET cancelled_at = now(), last_error = NULL" + ROW, booking.provider(),
            booking.providerDeliveryId());
        LOGGER.info("FLEET_COURIER_CANCELLED provider={} delivery={} chefSubOrderId={} reason={}", booking.provider(),
            booking.providerDeliveryId(), booking.chefSubOrderId(), reason);
        try {
            // The delivery job and order-service hear it now; the courier's callback or the tracking poll would bring it later.
            statusUpdates.processTracking(new TrackingWorkItem(booking.jobId(), booking.orderId(), booking.chefSubOrderId(),
                booking.provider(), booking.providerDeliveryId(), 0), new TrackingSnapshot(answer, null, Instant.now()));
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_COURIER_CANCEL_NOT_APPLIED delivery={}: {}", booking.providerDeliveryId(), exception.getMessage());
        }
        return null;
    }

    /**
     * Borzo's switch to Pidge (BorzoPidgeHandoffWorker) must not book Pidge for an order Craves is cancelling: one still
     * waiting stops (MANUAL_REVIEW, saying why); true while one is mid-switch, whose outcome is the courier to cancel next.
     */
    private boolean switchingToPidge(Booking booking) {
        jdbc.update("UPDATE delivery_schema.delivery_borzo_pidge_handoff SET state = 'MANUAL_REVIEW', lease_until = NULL, "
            + "last_error = 'Craves cancelled this delivery', updated_at = now() WHERE delivery_job_id = ? AND state = 'WAITING'", booking.jobId());
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM delivery_schema.delivery_borzo_pidge_handoff "
            + "WHERE delivery_job_id = ? AND state IN ('PROCESSING_BORZO', 'BORZO_CANCELLED', 'PROCESSING_PIDGE', "
            + "'PIDGE_RECONCILIATION_PENDING'))", Boolean.class, booking.jobId()));
    }

    private boolean done(Booking booking) {
        return jdbc.queryForList("SELECT cancelled_at IS NOT NULL FROM delivery_schema.courier_cancel" + ROW, Boolean.class,
            booking.provider(), booking.providerDeliveryId()).stream().anyMatch(Boolean.TRUE::equals);
    }

    /** The last tick attempt failed: ops is told once (two replicas can't both claim alerted_at) to cancel by hand. */
    private void alertOnce(Booking booking, String courier, String why) {
        if (jdbc.update("UPDATE delivery_schema.courier_cancel SET alerted_at = now()" + ROW + " AND alerted_at IS NULL", booking.provider(),
            booking.providerDeliveryId()) != 1) {
            return;
        }
        String order = FleetDispatcher.orderCode(booking.chefSubOrderId());
        LOGGER.error("CRAVES_ALERT alert=FLEET_COURIER_CANCEL_FAILED order={} chefSubOrderId={} provider={} delivery={} status={} attempts={} "
            + "reason={}", order, booking.chefSubOrderId(), booking.provider(), booking.providerDeliveryId(), booking.status(), MAX_ATTEMPTS, why);
        alerts.opsAlert("FLEET_COURIER_CANCEL_FAILED", "Cancel " + courier + " by hand, order " + order,
            "Order " + order + " was cancelled, but " + courier + " didn't cancel delivery " + booking.providerDeliveryId() + " after "
                + MAX_ATTEMPTS + " tries (" + why + "). Cancel it with " + courier + " now. If their courier has the food already, call them.",
            Map.of("chefSubOrderId", booking.chefSubOrderId().toString(), "orderCode", order, "provider", booking.provider(),
                "providerDeliveryId", booking.providerDeliveryId(), "status", booking.status()));
    }

    private static String safe(RuntimeException error) {
        String message = error.getMessage() == null || error.getMessage().isBlank() ? error.getClass().getSimpleName()
            : error.getMessage().replace('\n', ' ').replace('\r', ' ');
        return message.length() <= 300 ? message : message.substring(0, 300);
    }

    private static Booking booking(ResultSet row, int n) throws SQLException {
        return new Booking(row.getObject("id", UUID.class), row.getObject("order_id", UUID.class), row.getObject("chef_sub_order_id", UUID.class),
            row.getString("provider_id"), row.getString("provider_delivery_id"), row.getString("status"));
    }

    /** A delivery job booked with Borzo or Pidge. */
    record Booking(UUID jobId, UUID orderId, UUID chefSubOrderId, String provider, String providerDeliveryId, String status) {
    }
}
