package in.craves.integration.delivery.command;

import in.craves.integration.config.WorkerSchedulingConfiguration;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * With CRAVES_DELIVERY_COURIER_CANCEL_ENABLED: cancels the Borzo or Pidge courier booked for an order Craves
 * no longer delivers, whatever the fleet flag. Every 5 s for orders order-service cancelled (delivery_schema.order_cancelled),
 * and for ops (FleetCourierCancel.forOps hands over while the flag is on). The claim is FleetCourierCancel's: one
 * courier_cancel statement stores the intent and the attempt before the courier is called, so two replicas never both call.
 * The courier's own record decides: the booking is fetched before the cancel (one past cancelling is never cancelled) and
 * after it (cancelled only when the courier says so). COURIER_CANCEL_UNCONFIRMED, once, when it is past cancelling or still
 * not cancelled after MAX_ATTEMPTS. Off, this bean does not exist.
 */
@Service
@ConditionalOnProperty(name = "craves.delivery-command.courier-cancel-enabled", havingValue = "true")
public class CourierCancel {
    public static final int MAX_ATTEMPTS = 3;
    /** Longer than an attempt's three courier calls can last (fetch 25 s, cancel up to 50 s, fetch 25 s), so attempts never overlap. */
    public static final int ATTEMPT_SECONDS = 180;
    public static final String ORDER_CANCELLED = "ORDER_CANCELLED";
    public static final String OPS_CANCELLED = "OPS_CANCELLED";
    /** A courier booking still running. */
    public static final String LIVE = "j.provider_id IN ('borzo', 'pidge') AND j.provider_delivery_id IS NOT NULL "
        + "AND j.status NOT IN ('DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED')";
    private static final Logger log = LoggerFactory.getLogger(CourierCancel.class);
    private static final String ROW = " WHERE provider_id = ? AND provider_delivery_id = ?";

    private final JdbcTemplate jdbc;
    private final DeliveryCommandProperties properties;
    private final Map<String, DeliveryProviderAdapter> couriers;
    private final DeliveryStatusUpdateService statusUpdates;
    /** The fleet's push to ops, when the fleet is on (FleetCourierCancel sets it). */
    private volatile BiConsumer<Booking, String> opsPush = (booking, why) -> { };
    private in.craves.integration.delivery.billing.CourierCharges charges;

    /** Courier charge records (V199); written only while CRAVES_DELIVERY_COURIER_CHARGE_ENABLED is on. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setCharges(in.craves.integration.delivery.billing.CourierCharges charges) {
        this.charges = charges;
    }

    public CourierCancel(JdbcTemplate jdbc, DeliveryCommandProperties properties, List<DeliveryProviderAdapter> adapters,
                         DeliveryStatusUpdateService statusUpdates) {
        this.jdbc = jdbc;
        this.properties = properties;
        // Built at start-up whatever the flag: nothing here may stop the service (the router rejects a duplicate courier id).
        this.couriers = adapters.stream().collect(Collectors.toMap(adapter -> adapter.providerId().toLowerCase(Locale.ROOT),
            Function.identity(), (first, second) -> first));
        this.statusUpdates = statusUpdates;
    }

    public boolean enabled() {
        return properties.isCourierCancelEnabled();
    }

    public void opsPush(BiConsumer<Booking, String> push) {
        this.opsPush = push;
    }

    @Scheduled(scheduler = WorkerSchedulingConfiguration.DELIVERY_SCHEDULER,
        fixedDelayString = "${craves.delivery-command.courier-cancel-interval-ms:5000}")
    public void tick() {
        if (!enabled()) {
            return;
        }
        cancelledOrders();
    }

    /**
     * One attempt for each live booking of a cancelled order that is due one, 10 at most; returns how many were cancelled.
     * Orders order-service cancelled only (ORDER_CANCELLED): a refund alone never cancels a courier.
     */
    public int cancelledOrders() {
        List<Booking> due = jdbc.query("SELECT j.id, j.order_id, j.chef_sub_order_id, j.provider_id, j.provider_delivery_id, j.status "
            + "FROM delivery_schema.order_cancelled oc JOIN delivery_schema.delivery_job j ON j.chef_sub_order_id = oc.chef_sub_order_id "
            + "WHERE " + LIVE + " AND NOT EXISTS (SELECT 1 FROM delivery_schema.courier_cancel c WHERE c.provider_id = j.provider_id "
            + "AND c.provider_delivery_id = j.provider_delivery_id AND (c.cancelled_at IS NOT NULL OR c.attempts >= ? "
            + "OR c.last_attempt_at > now() - make_interval(secs => ?))) ORDER BY j.updated_at LIMIT 10",
            (row, n) -> new Booking(row.getObject("id", UUID.class), row.getObject("order_id", UUID.class),
                row.getObject("chef_sub_order_id", UUID.class), row.getString("provider_id"), row.getString("provider_delivery_id"),
                row.getString("status")), MAX_ATTEMPTS, ATTEMPT_SECONDS);
        int cancelled = 0;
        for (Booking booking : due) {
            try {
                cancelled += cancel(booking, ORDER_CANCELLED, null, null) == null ? 1 : 0;
            } catch (RuntimeException exception) {
                log.warn("COURIER_CANCEL provider={} delivery={} failed: {}", booking.provider(), booking.providerDeliveryId(), safe(exception));
            }
        }
        return cancelled;
    }

    /** Null once the courier shows the booking cancelled, now or before; otherwise why not, in words for ops. by: the admin, null for the tick. */
    public String cancel(Booking booking, String reason, UUID by, String byName) {
        boolean ops = OPS_CANCELLED.equals(reason);
        String courier = booking.provider().substring(0, 1).toUpperCase(Locale.ROOT) + booking.provider().substring(1);
        if (switchingToPidge(booking)) {
            return "Borzo is handing this order to Pidge right now. Try again in a minute.";
        }
        // The intent and this attempt, committed before any call; only one caller gets the row back. Ops may try past the limit.
        List<Integer> attempt = jdbc.queryForList("""
            INSERT INTO delivery_schema.courier_cancel AS c (provider_id, provider_delivery_id, chef_sub_order_id, reason, requested_by,
              requested_by_name, attempts, last_attempt_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, now())
            ON CONFLICT (provider_id, provider_delivery_id) DO UPDATE SET attempts = c.attempts + 1, last_attempt_at = now(),
              requested_by = COALESCE(EXCLUDED.requested_by, c.requested_by),
              requested_by_name = COALESCE(EXCLUDED.requested_by_name, c.requested_by_name)
            WHERE c.cancelled_at IS NULL AND (? OR c.attempts < ?) AND c.last_attempt_at <= now() - make_interval(secs => ?)
            RETURNING c.attempts""", Integer.class, booking.provider(), booking.providerDeliveryId(), booking.chefSubOrderId(), reason,
            by, byName, ops, MAX_ATTEMPTS, ATTEMPT_SECONDS);
        if (attempt.isEmpty()) {
            return jdbc.queryForList("SELECT cancelled_at IS NOT NULL FROM delivery_schema.courier_cancel" + ROW, Boolean.class,
                booking.provider(), booking.providerDeliveryId()).stream().anyMatch(Boolean.TRUE::equals) ? null
                : "Craves is cancelling this " + courier + " delivery right now. Try again in a minute.";
        }
        TrackingSnapshot seen;
        String refusal = null;
        boolean past;
        // What the courier showed just before this attempt's cancel: no rider then, and the cancel cost nothing.
        boolean beforeRider;
        try {
            DeliveryProviderAdapter adapter = couriers.get(booking.provider());
            if (adapter == null) {
                throw new IllegalStateException("no " + courier + " client in this service");
            }
            seen = adapter.track(booking.providerDeliveryId());
            beforeRider = in.craves.integration.delivery.billing.CourierCharges.beforeRider(seen);
            past = CourierStrayBookings.PAST_CANCELLING.contains(seen.delivery().status());
            if (!past && seen.delivery().status() != DeliveryStatus.CANCELLED) {
                try {
                    adapter.cancel(booking.providerDeliveryId());
                } catch (RuntimeException refused) {
                    refusal = safe(refused);
                }
                // The courier's own record decides, whatever the cancel call said.
                seen = adapter.track(booking.providerDeliveryId());
            }
        } catch (RuntimeException unread) {
            return unconfirmed(booking, courier, reason, attempt.get(0), false, refusal != null ? refusal : safe(unread));
        }
        if (past) {
            // A courier with the food, or a booking that is over, is never cancelled from here.
            return unconfirmed(booking, courier, reason, attempt.get(0), true, courier + " shows it " + seen.delivery().status());
        }
        if (seen.delivery().status() != DeliveryStatus.CANCELLED) {
            return unconfirmed(booking, courier, reason, attempt.get(0), false, refusal != null ? refusal
                : courier + " still shows it " + seen.delivery().status() + " after the cancel");
        }
        jdbc.update("UPDATE delivery_schema.courier_cancel SET cancelled_at = now(), last_error = NULL" + ROW, booking.provider(),
            booking.providerDeliveryId());
        log.info("COURIER_CANCELLED provider={} delivery={} chefSubOrderId={} reason={}", booking.provider(), booking.providerDeliveryId(),
            booking.chefSubOrderId(), reason);
        if (charges != null) {
            charges.cancelled(booking.orderId(), booking.chefSubOrderId(), booking.jobId(), seen.delivery(), beforeRider);
        }
        try {
            // The delivery job and order-service hear it now; the courier's callback or the tracking poll would bring it later.
            statusUpdates.processTracking(new TrackingWorkItem(booking.jobId(), booking.orderId(), booking.chefSubOrderId(),
                booking.provider(), booking.providerDeliveryId(), 0), seen);
        } catch (RuntimeException exception) {
            log.warn("COURIER_CANCEL_NOT_APPLIED delivery={}: {}", booking.providerDeliveryId(), safe(exception));
        }
        return null;
    }

    /** This attempt did not end in a cancelled booking. stop: no further tick attempt. Ops is told once, at the last attempt or on stop. */
    private String unconfirmed(Booking booking, String courier, String reason, int attempt, boolean stop, String why) {
        jdbc.update("UPDATE delivery_schema.courier_cancel SET last_error = ?, attempts = GREATEST(attempts, ?)" + ROW, why,
            stop ? MAX_ATTEMPTS : 0, booking.provider(), booking.providerDeliveryId());
        log.warn("COURIER_CANCEL_REFUSED provider={} delivery={} chefSubOrderId={} reason={} attempt={} status={}: {}", booking.provider(),
            booking.providerDeliveryId(), booking.chefSubOrderId(), reason, attempt, booking.status(), why);
        if ((stop || (!OPS_CANCELLED.equals(reason) && attempt >= MAX_ATTEMPTS))
            && jdbc.update("UPDATE delivery_schema.courier_cancel SET alerted_at = now()" + ROW + " AND alerted_at IS NULL",
                booking.provider(), booking.providerDeliveryId()) == 1) {
            log.error("CRAVES_ALERT alert=COURIER_CANCEL_UNCONFIRMED provider={} chefSubOrderId={} delivery={} status={} attempts={} "
                + "cancelReason={} reason={}", booking.provider(), booking.chefSubOrderId(), booking.providerDeliveryId(), booking.status(),
                attempt, reason, why);
            try {
                opsPush.accept(booking, why);
            } catch (RuntimeException exception) {
                log.warn("COURIER_CANCEL ops push failed delivery={}: {}", booking.providerDeliveryId(), safe(exception));
            }
        }
        return courier + " didn't cancel delivery " + booking.providerDeliveryId() + ": " + why + ". If their courier has the food "
            + "already, call " + courier + ".";
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

    private static String safe(RuntimeException error) {
        String message = error.getMessage() == null || error.getMessage().isBlank() ? error.getClass().getSimpleName()
            : error.getMessage().replace('\n', ' ').replace('\r', ' ');
        return message.length() <= 300 ? message : message.substring(0, 300);
    }

    /** A delivery job booked with a courier. */
    public record Booking(UUID jobId, UUID orderId, UUID chefSubOrderId, String provider, String providerDeliveryId, String status) {
    }
}
