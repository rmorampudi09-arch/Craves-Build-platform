package in.craves.integration.fleet.trip;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryStatusChangedData;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Courier;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Fleet trips through the existing delivery-status pipeline (PLAN F10) with providerId craves_fleet, so the customer
 * gets the rider card and the delivery code and the chef sees the partner. An accept creates the delivery job and its
 * COURIER_ASSIGNED event; later steps go through DeliveryStatusUpdateService.processTracking, like a provider's tracking.
 * Nothing is published for a trip a later stage took over (its latest stage is not the fleet's; ops can give an order back to a
 * rider, which ends with a fleet stage again).
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetStatusBridge {
    public static final String PROVIDER_ID = "craves_fleet";
    private static final String TRIP = """
        SELECT t.id, t.chef_sub_order_id, t.order_id, t.state, t.order_code, t.rider_id, t.updated_at, t.picked_up_at, t.pickup_distance_m,
               t.pickup_minutes,
               r.name AS rider_name, r.phone AS rider_phone, p.lat, p.lng, p.mock, p.received_at,
               (SELECT s.provider FROM fleet_schema.trip_stage s WHERE s.trip_id = t.id ORDER BY s.seq DESC LIMIT 1) <> 'CRAVES_FLEET' AS superseded
        FROM fleet_schema.trip t
        LEFT JOIN fleet_schema.rider r ON r.id = t.rider_id
        LEFT JOIN fleet_schema.rider_position_latest p ON p.rider_id = t.rider_id
        WHERE t.id = ?""";

    private final JdbcTemplate jdbc;
    private final DeliveryOutboxRepository outbox;
    private final DeliveryCommandRepository commands;
    private final DeliveryStatusUpdateService statusUpdates;
    private final ObjectMapper json;

    public FleetStatusBridge(JdbcTemplate jdbc, DeliveryOutboxRepository outbox, DeliveryCommandRepository commands,
                             DeliveryStatusUpdateService statusUpdates, ObjectMapper json) {
        this.jdbc = jdbc;
        this.outbox = outbox;
        this.commands = commands;
        this.statusUpdates = statusUpdates;
        this.json = json;
    }

    /**
     * In the accept's transaction: the order's delivery job as craves_fleet with the trip id, its COURIER_ASSIGNED event
     * (rider card), and the delivery command marked done. False if the order already has a delivery job.
     */
    public boolean assigned(UUID tripId) {
        Snapshot trip = trip(tripId);
        UUID job = UUID.randomUUID();
        Instant at = trip.updatedAt();
        if (jdbc.update("""
            INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status,
              provider_status, quote_snapshot, booked_at, last_status_observed_at, last_status_source, next_tracking_at, created_at, updated_at)
            VALUES (?, ?, ?, 'craves_fleet', ?, 'COURIER_ASSIGNED', 'ASSIGNED', '[]'::jsonb, now(), ?, 'CREATE', now(), now(), now())
            ON CONFLICT (chef_sub_order_id) DO NOTHING""", job, trip.chefSubOrderId(), trip.orderId(), tripId.toString(),
            Timestamp.from(at)) != 1) {
            return false;
        }
        jdbc.update("UPDATE fleet_schema.trip SET delivery_job_id = ? WHERE id = ?", job, tripId);
        Courier courier = courier(trip);
        Instant pickupEta = pickupEta(at, trip);
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(job, trip.orderId(), trip.chefSubOrderId(), PROVIDER_ID,
            tripId.toString(), DeliveryStatus.COURIER_ASSIGNED.name(), null, at, null, null, null, courier.name(), courier.phone(),
            courier.photoUrl(), pickupEta);
        outbox.enqueue(DeliveryCommandModels.DELIVERY_STATUS_CHANGED, job, trip.orderId(), json.valueToTree(new EventEnvelope<>(
            UUID.randomUUID(), DeliveryCommandModels.DELIVERY_STATUS_CHANGED, "1.0", Instant.now(), trip.orderId(), null,
            "integration-service", "delivery-job/" + job, data)));
        commands.findByChefSubOrderId(trip.chefSubOrderId()).ifPresent(command -> commands.markCompleted(command.id()));
        return true;
    }

    /**
     * Ops gave a rider's trip before pickup to another rider on a new trip (FleetOpsService), in that transaction: the
     * order's delivery job follows the new trip, and its COURIER_ASSIGNED event names the first trip as the handoff source
     * (order-service accepts a Craves rider to Craves rider handoff before pickup) and carries the new rider's card. False
     * if the job no longer belongs to the first trip.
     */
    public boolean handedOver(UUID fromTripId, UUID toTripId) {
        Snapshot trip = trip(toTripId);
        List<Map<String, Object>> jobs = jdbc.queryForList("SELECT id, last_status_observed_at FROM delivery_schema.delivery_job "
            + "WHERE chef_sub_order_id = ? AND provider_id = 'craves_fleet' AND provider_delivery_id = ? FOR UPDATE",
            trip.chefSubOrderId(), fromTripId.toString());
        if (jobs.isEmpty()) {
            return false;
        }
        UUID job = (UUID) jobs.get(0).get("id");
        // After the job's last observation, so order-service never takes the handoff for a stale report.
        Instant at = Instant.now().truncatedTo(ChronoUnit.MICROS);
        if (jobs.get(0).get("last_status_observed_at") instanceof Timestamp last && !at.isAfter(last.toInstant())) {
            at = last.toInstant().plus(1, ChronoUnit.MILLIS);
        }
        jdbc.update("""
            UPDATE delivery_schema.delivery_job
            SET provider_delivery_id = ?, status = 'COURIER_ASSIGNED', provider_status = 'ASSIGNED', booked_at = now(),
                quote_snapshot = jsonb_build_object('handoffFromProviderId', 'craves_fleet', 'handoffFromProviderDeliveryId', CAST(? AS text),
                    'previousRouting', quote_snapshot),
                last_status_observed_at = ?, last_status_source = 'RECONCILIATION', next_tracking_at = now(),
                tracking_attempt_count = 0, tracking_processing_started_at = NULL, updated_at = now()
            WHERE id = ?""", toTripId.toString(), fromTripId.toString(), Timestamp.from(at), job);
        jdbc.update("UPDATE fleet_schema.trip SET delivery_job_id = ? WHERE id = ?", job, toTripId);
        Courier courier = courier(trip);
        Instant pickupEta = pickupEta(at, trip);
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(job, trip.orderId(), trip.chefSubOrderId(), PROVIDER_ID,
            toTripId.toString(), DeliveryStatus.COURIER_ASSIGNED.name(), null, at, PROVIDER_ID, fromTripId.toString(), null, courier.name(),
            courier.phone(), courier.photoUrl(), pickupEta);
        outbox.enqueue(DeliveryCommandModels.DELIVERY_STATUS_CHANGED, job, trip.orderId(), json.valueToTree(new EventEnvelope<>(
            UUID.randomUUID(), DeliveryCommandModels.DELIVERY_STATUS_CHANGED, "1.0", Instant.now(), trip.orderId(), null,
            "integration-service", "delivery-job/" + job, data)));
        return true;
    }

    /** After a trip step, in the step's transaction: the new status with the rider card, unless another stage took over. */
    public void publish(UUID tripId) {
        Optional<Map<String, Object>> job = jdbc.queryForList("SELECT j.id, j.order_id, j.chef_sub_order_id FROM delivery_schema.delivery_job j "
            + "JOIN fleet_schema.trip t ON t.chef_sub_order_id = j.chef_sub_order_id WHERE t.id = ? AND j.provider_id = 'craves_fleet' "
            + "AND j.provider_delivery_id = ?", tripId, tripId.toString()).stream().findFirst();
        TrackingSnapshot snapshot = snapshot(tripId);
        if (job.isEmpty() || snapshot.delivery().status() == DeliveryStatus.UNKNOWN) {
            return;
        }
        statusUpdates.processTracking(new TrackingWorkItem((UUID) job.get().get("id"), (UUID) job.get().get("order_id"),
            (UUID) job.get().get("chef_sub_order_id"), PROVIDER_ID, tripId.toString(), 0), snapshot);
    }

    /**
     * The trip as a provider tracking answer. Steps map onto the pipeline's statuses: ASSIGNED is COURIER_ASSIGNED,
     * AT_PICKUP, PICKED_UP (IN_TRANSIT once the rider sends a real fix after pickup), AT_DROP is AT_DROPOFF, DELIVERED,
     * FAILED, CANCELLED. A trip another stage took over, or not yet taken, reads UNKNOWN, which the pipeline ignores.
     */
    public TrackingSnapshot snapshot(UUID tripId) {
        Snapshot trip = trip(tripId);
        DeliveryStatus status = trip.superseded() || trip.riderId() == null ? DeliveryStatus.UNKNOWN : switch (trip.state()) {
            case "ASSIGNED" -> DeliveryStatus.COURIER_ASSIGNED;
            case "AT_PICKUP" -> DeliveryStatus.AT_PICKUP;
            case "PICKED_UP" -> trip.movedAfterPickup() ? DeliveryStatus.IN_TRANSIT : DeliveryStatus.PICKED_UP;
            case "AT_DROP" -> DeliveryStatus.AT_DROPOFF;
            case "DELIVERED" -> DeliveryStatus.DELIVERED;
            case "FAILED" -> DeliveryStatus.FAILED;
            case "CANCELLED" -> DeliveryStatus.CANCELLED;
            default -> DeliveryStatus.UNKNOWN;
        };
        Instant observedAt = "PICKED_UP".equals(trip.state()) && trip.movedAfterPickup() ? trip.positionAt() : trip.updatedAt();
        ProviderDelivery delivery = new ProviderDelivery(PROVIDER_ID, tripId.toString(), trip.orderCode(), status, trip.state(), null, null,
            null, null, observedAt);
        return new TrackingSnapshot(delivery, trip.riderId() == null ? null : courier(trip), observedAt);
    }

    /** "Ravi K.": first name and initial. The phone is the rider's own until a relay number exists. */
    static Courier courier(Snapshot trip) {
        String[] words = trip.riderName() == null ? new String[0] : trip.riderName().trim().split("\\s+");
        String name = words.length == 0 ? "Craves rider" : words.length == 1 ? words[0] : words[0] + " " + words[words.length - 1].charAt(0) + ".";
        boolean located = trip.lat() != null && !Boolean.TRUE.equals(trip.mock());
        return new Courier(trip.riderId() == null ? null : trip.riderId().toString(), name, trip.riderPhone(), null,
            located ? BigDecimal.valueOf(trip.lat()) : null, located ? BigDecimal.valueOf(trip.lng()) : null);
    }

    private Snapshot trip(UUID tripId) {
        return jdbc.queryForObject(TRIP, (row, n) -> snapshot(row), tripId);
    }

    private static Snapshot snapshot(ResultSet row) throws SQLException {
        Timestamp pickedUp = row.getTimestamp("picked_up_at");
        Timestamp received = row.getTimestamp("received_at");
        boolean moved = pickedUp != null && received != null && received.after(pickedUp) && !row.getBoolean("mock");
        return new Snapshot(row.getObject("id", UUID.class), row.getObject("chef_sub_order_id", UUID.class), row.getObject("order_id", UUID.class),
            row.getString("state"), row.getString("order_code"), row.getObject("rider_id", UUID.class),
            row.getTimestamp("updated_at").toInstant(), (Integer) row.getObject("pickup_distance_m"), row.getString("rider_name"),
            row.getString("rider_phone"), (Double) row.getObject("lat"), (Double) row.getObject("lng"), (Boolean) row.getObject("mock"),
            moved, received == null ? null : received.toInstant(), row.getBoolean("superseded"),
            row.getObject("pickup_minutes") instanceof Number n ? n.doubleValue() : null);
    }

    /**
     * Roughly when the rider reaches the kitchen, for the chef: the travel-time model's minutes when the offer had them
     * (CRAVES_FLEET_ETA_MODE live), else about 3 minutes a km.
     */
    static Instant pickupEta(Instant at, Snapshot trip) {
        long minutes = trip.pickupMinutes() != null ? (long) Math.ceil(trip.pickupMinutes())
            : (long) Math.ceil((trip.pickupDistanceM() == null ? 0 : trip.pickupDistanceM()) / 333.0);
        return at.plus(minutes, ChronoUnit.MINUTES);
    }

    record Snapshot(UUID id, UUID chefSubOrderId, UUID orderId, String state, String orderCode, UUID riderId, Instant updatedAt,
                    Integer pickupDistanceM, String riderName, String riderPhone, Double lat, Double lng, Boolean mock,
                    boolean movedAfterPickup, Instant positionAt, boolean superseded, Double pickupMinutes) {
    }
}
