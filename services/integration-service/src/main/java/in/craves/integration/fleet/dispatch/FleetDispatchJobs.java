package in.craves.integration.fleet.dispatch;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.BorzoPidgeHandoffWorker;
import in.craves.integration.delivery.command.DeliveryCommandModels;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryStatusChangedData;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryCreateReconciliationPendingException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.fleet.FleetConfiguration;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.pay.FleetPay.Ending;
import in.craves.integration.fleet.trip.FleetTripPay;
import in.craves.integration.fleet.trip.FleetTripService;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The dispatch chain's clock, every 5 s on the fleet pool (only with CRAVES_FLEET_ENABLED; with dispatch_policy off there
 * are no trips and nothing to do):
 * - offers expire on the server after their 40 s;
 * - a cancelled order's trip ends (cancelledOrders);
 * - the watchdog: a rider who accepted but whose locations stopped for 90 s before pickup loses the trip (pickup-leg pay,
 *   held for ops), ops is alerted and the order goes to the next stage; CANCELLED is never published for it;
 * - Borzo and Pidge stages close when a courier is assigned, move on at their deadline, and end in the ops queue with an
 *   ops alert; a queued order closes there too once a courier is assigned after all. A watchdog order is booked with Borzo or Pidge here, through the router, and its delivery job is handed
 *   over with handoffFromProviderId craves_fleet.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetDispatchJobs {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetDispatchJobs.class);
    static final int WATCHDOG_SECONDS = 90;
    static final int OPS_QUEUE_SECONDS = 24 * 3600; // nominal: ops closes a queued order by hand
    static final String RIDER_LOST = "Your location stopped before pickup, so the order went to another courier.";
    static final String RIDER_LOST_HOLD = "Your location stopped before pickup. Ops checks this trip before paying it.";
    private static final Set<String> COURIER_GAVE_UP = Set.of("CANCELLED", "FAILED", "RETURNED");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final FleetDispatcher dispatcher;
    private final FleetTripPay tripPay;
    private final FleetTripService trips;
    private final RiderPushClient alerts;
    private final DeliveryProviderRouter router;
    private final DeliveryCommandRepository commands;
    private final DeliveryAssignmentRepository assignments;
    private final BorzoPidgeHandoffRepository handoffs;
    private final DeliveryOutboxRepository outbox;
    private final ObjectMapper json;

    public FleetDispatchJobs(JdbcTemplate jdbc, PlatformTransactionManager transactions, FleetDispatcher dispatcher, FleetTripPay tripPay,
                             FleetTripService trips, RiderPushClient alerts, DeliveryProviderRouter router, DeliveryCommandRepository commands,
                             DeliveryAssignmentRepository assignments, BorzoPidgeHandoffRepository handoffs, DeliveryOutboxRepository outbox,
                             ObjectMapper json) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactions);
        this.dispatcher = dispatcher;
        this.tripPay = tripPay;
        this.trips = trips;
        this.alerts = alerts;
        this.router = router;
        this.commands = commands;
        this.assignments = assignments;
        this.handoffs = handoffs;
        this.outbox = outbox;
        this.json = json;
    }

    @Scheduled(scheduler = FleetConfiguration.FLEET_SCHEDULER, fixedDelayString = "${craves.fleet.dispatch-tick-ms:5000}")
    public void tick() {
        expireOffers();
        cancelledOrders();
        watchdog();
        courierStages();
    }

    /**
     * Orders the customer or the chef cancelled: the trip ends through the craves_fleet adapter's cancel path (offers
     * withdrawn, stages closed, the rider paid for the state reached). Unfinished trips and those with an open stage only.
     */
    int cancelledOrders() {
        List<UUID> cancelled = jdbc.queryForList("SELECT t.id FROM fleet_schema.trip t WHERE t.state NOT IN ('DELIVERED', 'FAILED', 'CANCELLED') "
            + "AND " + FleetTripService.ORDER_REFUNDED + " UNION SELECT s.trip_id FROM fleet_schema.trip_stage s "
            + "JOIN fleet_schema.trip t ON t.id = s.trip_id WHERE s.state = 'OPEN' AND " + FleetTripService.ORDER_REFUNDED + " LIMIT 20",
            UUID.class);
        for (UUID tripId : cancelled) {
            try {
                trips.cancel(tripId, FleetTripService.ORDER_CANCELLED);
                LOGGER.info("FLEET_ORDER_CANCELLED trip={}", tripId);
            } catch (RuntimeException exception) {
                LOGGER.warn("FLEET_ORDER_CANCELLED trip={} failed: {}", tripId, exception.getMessage());
            }
        }
        return cancelled.size();
    }

    int expireOffers() {
        return jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'EXPIRED', decided_at = now() WHERE state = 'ACTIVE' AND expires_at <= now()");
    }

    /** Hands back every accepted trip whose rider sent no location for 90 s before pickup. */
    int watchdog() {
        List<UUID> silent = jdbc.queryForList("""
            SELECT t.id FROM fleet_schema.trip t LEFT JOIN fleet_schema.rider_position_latest p ON p.rider_id = t.rider_id
            WHERE t.provider = 'CRAVES_FLEET' AND t.state IN ('ASSIGNED', 'AT_PICKUP') AND t.accepted_at < now() - make_interval(secs => ?)
              AND (p.received_at IS NULL OR p.received_at < now() - make_interval(secs => ?))
            ORDER BY t.accepted_at LIMIT 20""", UUID.class, WATCHDOG_SECONDS, WATCHDOG_SECONDS);
        int handedBack = 0;
        for (UUID tripId : silent) {
            Map<String, Object> lost = transaction.execute(status -> handBack(tripId));
            if (lost != null) {
                handedBack++;
                alerts.opsAlert("FLEET_RIDER_LOST", "Rider location stopped before pickup, order " + lost.get("order_code"),
                    "The rider's app sent no location for 90 seconds after accepting. The order goes to the next courier; the rider's pay "
                        + "for this trip is held for your check. Call the rider.",
                    Map.of("tripId", tripId.toString(), "orderCode", String.valueOf(lost.get("order_code")),
                        "riderId", String.valueOf(lost.get("rider_id"))));
            }
        }
        return handedBack;
    }

    /** One silent rider's trip ends (pay per its state, held) and the next stage opens. Null if it changed meanwhile. */
    private Map<String, Object> handBack(UUID tripId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
            SELECT t.state, t.order_code, t.rider_id FROM fleet_schema.trip t
            WHERE t.id = ? AND t.provider = 'CRAVES_FLEET' AND t.state IN ('ASSIGNED', 'AT_PICKUP')
              AND t.accepted_at < now() - make_interval(secs => ?)
              AND NOT EXISTS (SELECT 1 FROM fleet_schema.rider_position_latest p WHERE p.rider_id = t.rider_id
                              AND p.received_at >= now() - make_interval(secs => ?))
            FOR UPDATE OF t""", tripId, WATCHDOG_SECONDS, WATCHDOG_SECONDS);
        if (rows.isEmpty()) {
            return null;
        }
        Map<String, Object> trip = rows.get(0);
        jdbc.update("UPDATE fleet_schema.trip SET state = 'CANCELLED', cancel_reason = ?, finished_at = now(), version = version + 1, "
            + "updated_at = now() WHERE id = ?", RIDER_LOST, tripId);
        jdbc.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, detail) VALUES (?, ?, 'WATCHDOG_HANDED_BACK', 'SYSTEM', "
            + "CAST(? AS jsonb))", UUID.randomUUID(), tripId, "{\"stateBefore\":\"" + trip.get("state") + "\"}");
        tripPay.finalizePay(tripId, "AT_PICKUP".equals(trip.get("state")) ? Ending.CANCELLED_AT_KITCHEN : Ending.CANCELLED_TO_KITCHEN,
            true, RIDER_LOST_HOLD);
        boolean borzoNext = router.borzoTimedPolicyReady();
        dispatcher.openStage(tripId, borzoNext ? "BORZO" : "PIDGE",
            borzoNext ? FleetDispatcher.BORZO_WINDOW_SECONDS : dispatcher.pidgeSeconds());
        LOGGER.warn("FLEET_WATCHDOG trip={} stateBefore={} next={}", tripId, trip.get("state"), borzoNext ? "BORZO" : "PIDGE");
        return trip;
    }

    /** Borzo and Pidge stages: book a handed-back order, close on a courier, move on at the deadline, end in the ops queue. */
    int courierStages() {
        List<CourierStage> open = jdbc.query("""
            SELECT s.id, s.trip_id, s.provider, s.opened_at, s.deadline_at <= now() AS due, t.chef_sub_order_id, t.order_id,
                   t.order_code, j.id AS job_id, j.provider_id AS job_provider, j.status AS job_status
            FROM fleet_schema.trip_stage s JOIN fleet_schema.trip t ON t.id = s.trip_id
            LEFT JOIN delivery_schema.delivery_job j ON j.chef_sub_order_id = t.chef_sub_order_id
            WHERE s.state = 'OPEN' AND s.provider IN ('BORZO', 'PIDGE', 'OPS_QUEUE') ORDER BY s.deadline_at LIMIT 50""", (row, n) -> courierStage(row));
        int moved = 0;
        for (CourierStage stage : open) {
            try {
                moved += advance(stage) ? 1 : 0;
            } catch (RuntimeException exception) {
                LOGGER.warn("FLEET_STAGE_ADVANCE stage={} trip={} failed: {}", stage.id(), stage.tripId(), exception.getMessage());
            }
        }
        return moved;
    }

    private boolean advance(CourierStage stage) {
        boolean assigned = stage.jobStatus() != null && !"craves_fleet".equals(stage.jobProvider())
            && BorzoPidgeHandoffWorker.isAccepted(status(stage.jobStatus()));
        if ("OPS_QUEUE".equals(stage.provider())) {
            // A courier the delivery command booked after all still clears the queue, so ops does not book a second one.
            return assigned && Boolean.TRUE.equals(transaction.execute(status -> close(stage, "ASSIGNED")));
        }
        if ("craves_fleet".equals(stage.jobProvider())) {
            return book(stage);
        }
        if (assigned) {
            return Boolean.TRUE.equals(transaction.execute(status -> close(stage, "ASSIGNED")));
        }
        if (stage.jobStatus() != null && COURIER_GAVE_UP.contains(stage.jobStatus())) {
            return toOpsQueue(stage, "COURIER_" + stage.jobStatus());
        }
        return stage.due() && advanceAfterDeadline(stage);
    }

    /**
     * Books the order a silent rider handed back. Borzo's window is the stage's own (opened when the rider was lost), so
     * a Pidge stage books Pidge. An uncertain create is never retried: the order goes to the ops queue instead.
     */
    private boolean book(CourierStage stage) {
        CommandRecord command = commands.findByChefSubOrderId(stage.chefSubOrderId()).orElse(null);
        if (command == null) {
            return toOpsQueue(stage, "NO_DELIVERY_COMMAND");
        }
        RoutingResult routed;
        try {
            routed = router.borzoTimedPolicyReady()
                ? router.route(command.message(), "BORZO".equals(stage.provider()) ? stage.openedAt()
                    : stage.openedAt().minusSeconds(FleetDispatcher.BORZO_WINDOW_SECONDS))
                : router.route(command.message());
        } catch (DeliveryCreateReconciliationPendingException uncertain) {
            return toOpsQueue(stage, "UNCERTAIN_CREATE_" + uncertain.providerId().toUpperCase(java.util.Locale.ROOT));
        } catch (RuntimeException notNow) {
            LOGGER.info("FLEET_HANDBACK_WAITING trip={} stage={} reason={}", stage.tripId(), stage.provider(), notNow.getMessage());
            if (stage.due()) {
                return advanceAfterDeadline(stage);
            }
            return false;
        }
        Boolean switched = transaction.execute(status -> switchJob(stage, routed));
        if (!Boolean.TRUE.equals(switched)) {
            alerts.opsAlert("FLEET_COURIER_UNRECORDED", "Courier booked but not recorded, order " + stage.orderCode(),
                "A " + routed.providerId() + " courier was booked for this order but its delivery changed meanwhile. Cancel "
                    + routed.providerId() + " delivery " + routed.delivery().providerDeliveryId() + " if it is not needed.",
                Map.of("tripId", stage.tripId().toString(), "provider", routed.providerId(),
                    "providerDeliveryId", String.valueOf(routed.delivery().providerDeliveryId())));
            return false;
        }
        LOGGER.info("FLEET_HANDBACK_BOOKED trip={} provider={}", stage.tripId(), routed.providerId());
        return true;
    }

    private boolean advanceAfterDeadline(CourierStage stage) {
        if (!"BORZO".equals(stage.provider())) {
            return toOpsQueue(stage, "NO_COURIER");
        }
        return Boolean.TRUE.equals(transaction.execute(status -> {
            if (!close(stage, "NO_COURIER")) {
                return false;
            }
            jdbc.update("UPDATE fleet_schema.trip SET provider = 'PIDGE', updated_at = now() WHERE id = ? AND rider_id IS NULL", stage.tripId());
            dispatcher.openStage(stage.tripId(), "PIDGE", dispatcher.pidgeSeconds());
            return true;
        }));
    }

    /** The rider's delivery job now points at the booked courier; the status event names craves_fleet as the handoff source. */
    private boolean switchJob(CourierStage stage, RoutingResult routed) {
        List<Map<String, Object>> jobs = jdbc.queryForList("SELECT id, last_status_observed_at FROM delivery_schema.delivery_job "
            + "WHERE id = ? AND provider_id = 'craves_fleet' AND provider_delivery_id = ? FOR UPDATE", stage.jobId(), stage.tripId().toString());
        if (jobs.isEmpty()) {
            return false;
        }
        Instant observedAt = Instant.now();
        Object last = jobs.get(0).get("last_status_observed_at");
        if (last instanceof Timestamp lastAt && !observedAt.isAfter(lastAt.toInstant())) {
            observedAt = lastAt.toInstant().plusMillis(1);
        }
        var delivery = routed.delivery();
        jdbc.update("""
            UPDATE delivery_schema.delivery_job
            SET provider_id = ?, provider_delivery_id = ?, assignment_id = ?, status = ?, provider_status = ?, tracking_url = ?,
                booked_at = now(), provider_quote_id = NULL, assigned_agent_id = NULL,
                quote_snapshot = jsonb_build_object('selectedProviderId', CAST(? AS text), 'handoffFromProviderId', 'craves_fleet',
                    'handoffFromProviderDeliveryId', CAST(? AS text), 'previousRouting', quote_snapshot),
                last_status_observed_at = ?, last_status_source = 'RECONCILIATION', next_tracking_at = now(),
                tracking_attempt_count = 0, tracking_processing_started_at = NULL, updated_at = now()
            WHERE id = ?""", routed.providerId(), delivery.providerDeliveryId(), routed.intelligenceAssignment().assignmentId(),
            delivery.status().name(), delivery.providerStatus(), delivery.trackingUrl(), routed.providerId(), stage.tripId().toString(),
            Timestamp.from(observedAt), stage.jobId());
        List<String> failed = routed.createAudit().stream().filter(audit -> !audit.successful())
            .map(DeliveryCommandModels.CreateAudit::providerId).distinct().toList();
        assignments.markAssigned(routed.intelligenceAssignment().assignmentId(), routed.executedCandidateId(), failed);
        if ("borzo".equals(routed.providerId()) && "BORZO".equals(stage.provider()) && router.borzoTimedPolicyReady()
            && (delivery.status() == DeliveryStatus.PENDING || delivery.status() == DeliveryStatus.SEARCHING
                || delivery.status() == DeliveryStatus.DELAYED)) {
            handoffs.enroll(stage.jobId(), delivery.providerDeliveryId(), stage.openedAt());
        }
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(stage.jobId(), stage.orderId(), stage.chefSubOrderId(),
            routed.providerId(), delivery.providerDeliveryId(), delivery.status().name(), delivery.trackingUrl(), observedAt,
            "craves_fleet", stage.tripId().toString());
        outbox.enqueue(DeliveryCommandModels.DELIVERY_STATUS_CHANGED, stage.jobId(), stage.orderId(), json.valueToTree(new EventEnvelope<>(
            UUID.randomUUID(), DeliveryCommandModels.DELIVERY_STATUS_CHANGED, "1.0", Instant.now(), stage.orderId(), null,
            "integration-service", "delivery-job/" + stage.jobId(), data)));
        jdbc.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, detail) VALUES (?, ?, 'HANDED_TO_COURIER', 'SYSTEM', "
            + "jsonb_build_object('provider', CAST(? AS text), 'providerDeliveryId', CAST(? AS text)))", UUID.randomUUID(), stage.tripId(),
            routed.providerId(), delivery.providerDeliveryId());
        return true;
    }

    /** The last stage: ops dispatches by hand, alerted once. */
    private boolean toOpsQueue(CourierStage stage, String outcome) {
        Boolean queued = transaction.execute(status -> {
            if (!close(stage, outcome)) {
                return false;
            }
            jdbc.update("UPDATE fleet_schema.trip SET provider = 'OPS_QUEUE', updated_at = now() WHERE id = ? AND rider_id IS NULL", stage.tripId());
            dispatcher.openStage(stage.tripId(), "OPS_QUEUE", OPS_QUEUE_SECONDS);
            return true;
        });
        if (Boolean.TRUE.equals(queued)) {
            LOGGER.warn("FLEET_OPS_QUEUE trip={} order={} outcome={}", stage.tripId(), stage.orderCode(), outcome);
            alerts.opsAlert("FLEET_DISPATCH_QUEUE", "No courier for order " + stage.orderCode(),
                "Riders, Borzo and Pidge did not take order " + stage.orderCode() + " (" + outcome + "). Book a courier by hand.",
                Map.of("tripId", stage.tripId().toString(), "orderCode", stage.orderCode(), "chefSubOrderId", stage.chefSubOrderId().toString(),
                    "lastStage", stage.provider(), "outcome", outcome));
        }
        return Boolean.TRUE.equals(queued);
    }

    private boolean close(CourierStage stage, String outcome) {
        return jdbc.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', outcome = ?, closed_at = now() WHERE id = ? AND state = 'OPEN'",
            outcome, stage.id()) == 1;
    }

    private static DeliveryStatus status(String value) {
        try {
            return DeliveryStatus.valueOf(value);
        } catch (RuntimeException ignored) {
            return DeliveryStatus.UNKNOWN;
        }
    }

    private static CourierStage courierStage(ResultSet row) throws SQLException {
        return new CourierStage(row.getObject("id", UUID.class), row.getObject("trip_id", UUID.class), row.getString("provider"),
            row.getTimestamp("opened_at").toInstant(), row.getBoolean("due"), row.getObject("chef_sub_order_id", UUID.class),
            row.getObject("order_id", UUID.class), row.getString("order_code"), row.getObject("job_id", UUID.class),
            row.getString("job_provider"), row.getString("job_status"));
    }

    record CourierStage(UUID id, UUID tripId, String provider, Instant openedAt, boolean due, UUID chefSubOrderId, UUID orderId,
                        String orderCode, UUID jobId, String jobProvider, String jobStatus) {
    }
}
