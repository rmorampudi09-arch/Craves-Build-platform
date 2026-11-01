package in.craves.integration.fleet.dispatch;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.admin.FleetAdminService.Done;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.pay.FleetPay;
import in.craves.integration.fleet.pay.FleetPay.Ending;
import in.craves.integration.fleet.pay.FleetPay.PayQuote;
import in.craves.integration.fleet.trip.FleetStatusBridge;
import in.craves.integration.fleet.trip.FleetTripPay;
import in.craves.integration.fleet.trip.FleetTripService;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The ops console's trips (admin-fleet-v1 /trips): the list, and reassign or cancel through the dispatch chain so an order
 * never has two couriers. The stage that is open is closed in the database (the same rows an accept and the dispatch tick
 * use) before anything else happens, and the delivery command is taken over only when no booking is in progress; a cancel
 * tells Borzo or Pidge first when they hold the order (FleetCourierCancel). A trip
 * row belongs to one rider and one pay record, so a rider's trip before pickup goes to Borzo or Pidge on the same row, or
 * to a second rider on a new trip that replaces it (craves.fleet.rider-handover-enabled). Also the queue of delivery
 * codes typed offline that were refused (decision E4). Every mutation is audited and idempotent (FleetAdminService.once).
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetOpsService {
    static final Set<String> RIDER_ON_TRIP = Set.of("ASSIGNED", "AT_PICKUP", "PICKED_UP", "AT_DROP");
    static final Set<String> COMMAND_IDLE = Set.of("SCHEDULED", "WAITING_FOR_PROVIDER", "FAILED", "DEAD_LETTER");
    static final int QUEUE_CRITICAL_MINUTES = 5;
    static final String RELEASED = "Craves ops gave this order to another courier. You're paid for the trip so far.";
    static final String CANCELLED = "Craves ops cancelled this delivery. You're paid for the trip so far.";
    static final String HANDED_TO_RIDER = "Craves ops gave this order to another rider. You're paid for the trip so far.";
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetOpsService.class);
    private static final String TRIPS = """
        SELECT t.id, t.order_code, t.kitchen_name, t.drop_area, t.state, t.provider, t.rider_id, r.name AS rider_name, t.created_at,
               GREATEST(t.updated_at, j.updated_at, s.opened_at) AS updated_at, s.provider AS open_stage, j.provider_id AS job_provider,
               j.status AS job_status
        FROM fleet_schema.trip t
        LEFT JOIN fleet_schema.rider r ON r.id = t.rider_id
        LEFT JOIN fleet_schema.trip_stage s ON s.trip_id = t.id AND s.state = 'OPEN'
        LEFT JOIN delivery_schema.delivery_job j ON j.chef_sub_order_id = t.chef_sub_order_id
        """;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final FleetPolicyStore policies;
    private final FleetTestMode testMode;
    private final FleetDispatcher dispatcher;
    private final FleetTripService trips;
    private final FleetTripPay pay;
    private final FleetStatusBridge bridge;
    private final FleetAdminService admin;
    private final FleetCourierCancel couriers;
    private final boolean riderHandover;
    private final ObjectMapper json = new ObjectMapper();

    /**
     * riderHandover (craves.fleet.rider-handover-enabled, off by default): a rider's trip before pickup may go to another
     * rider. Switch it on only once order-service accepts a Craves rider to Craves rider handoff (the same release).
     */
    public FleetOpsService(JdbcTemplate jdbc, PlatformTransactionManager transactions, FleetPolicyStore policies, FleetTestMode testMode,
                           FleetDispatcher dispatcher, FleetTripService trips, FleetTripPay pay, FleetStatusBridge bridge,
                           FleetAdminService admin, FleetCourierCancel couriers,
                           @Value("${craves.fleet.rider-handover-enabled:false}") boolean riderHandover) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactions);
        this.policies = policies;
        this.testMode = testMode;
        this.dispatcher = dispatcher;
        this.trips = trips;
        this.pay = pay;
        this.bridge = bridge;
        this.admin = admin;
        this.couriers = couriers;
        this.riderHandover = riderHandover;
    }

    /** Orders not yet delivered, failed or cancelled, oldest first, with the courier they have now. */
    public TripList trips() {
        return new TripList(jdbc.query(TRIPS + """
            WHERE (t.state NOT IN ('DELIVERED', 'FAILED', 'CANCELLED') OR s.id IS NOT NULL)
              AND NOT (s.id IS NULL AND j.provider_id IS NOT NULL AND j.provider_id <> 'craves_fleet'
                       AND j.status IN ('DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'))
            ORDER BY t.created_at, t.id LIMIT 500""", (row, n) -> trip(row)));
    }

    /**
     * Orders that went through fleet, Borzo and Pidge without a courier (an open OPS_QUEUE stage), oldest first, with each
     * earlier stage's outcome. CRITICAL once queued QUEUE_CRITICAL_MINUTES or when a booking may exist (an uncertain create);
     * INFO when a courier took it after all (the dispatch tick clears it within seconds); else WARNING.
     */
    public QueueList dispatchQueue() {
        Map<UUID, List<Attempt>> attempts = new java.util.HashMap<>();
        jdbc.query("""
            SELECT a.trip_id, a.provider, COALESCE(a.outcome, 'CLOSED') AS outcome, a.closed_at FROM fleet_schema.trip_stage a
            WHERE a.state = 'CLOSED' AND a.trip_id IN (SELECT trip_id FROM fleet_schema.trip_stage WHERE state = 'OPEN' AND provider = 'OPS_QUEUE')
            ORDER BY a.trip_id, a.seq""", row -> {
            attempts.computeIfAbsent(row.getObject("trip_id", UUID.class), id -> new java.util.ArrayList<>()).add(new Attempt(
                row.getString("provider"), row.getString("outcome"), row.getTimestamp("closed_at").toInstant()));
        });
        return new QueueList(jdbc.query("""
            SELECT t.id, t.order_code, t.kitchen_name, t.drop_area, s.opened_at, EXTRACT(EPOCH FROM now() - s.opened_at)::bigint AS age_seconds,
                   j.provider_id AS job_provider, j.status AS job_status
            FROM fleet_schema.trip_stage s JOIN fleet_schema.trip t ON t.id = s.trip_id
            LEFT JOIN delivery_schema.delivery_job j ON j.chef_sub_order_id = t.chef_sub_order_id
            WHERE s.state = 'OPEN' AND s.provider = 'OPS_QUEUE'
            ORDER BY s.opened_at, t.id LIMIT 500""", (row, n) -> {
            UUID tripId = row.getObject("id", UUID.class);
            List<Attempt> tried = attempts.getOrDefault(tripId, List.of());
            String[] alert = alert(tried.isEmpty() ? "" : tried.get(tried.size() - 1).outcome(), row.getLong("age_seconds"),
                row.getString("job_provider"), row.getString("job_status"));
            return new QueueItem(tripId, row.getString("order_code"), row.getString("kitchen_name"), row.getString("drop_area"),
                row.getTimestamp("opened_at").toInstant(), alert[0], alert[1], tried.subList(Math.max(0, tried.size() - 10), tried.size()));
        }));
    }

    /** {alertLevel, alertMessage} for a queued order; the message says what ops should do. */
    static String[] alert(String lastOutcome, long ageSeconds, String jobProvider, String jobStatus) {
        String waited = " Waiting " + Math.max(0, ageSeconds / 60) + " min.";
        String courier = jobProvider == null ? "" : "borzo".equals(jobProvider) ? "Borzo" : "pidge".equals(jobProvider) ? "Pidge" : jobProvider;
        if (jobProvider != null && !FleetStatusBridge.PROVIDER_ID.equals(jobProvider)
            && !Set.of("PENDING", "SEARCHING", "DELAYED", "CANCELLED", "FAILED", "RETURNING", "RETURNED", "UNKNOWN").contains(jobStatus)) {
            return new String[] {"INFO", "A " + courier + " courier took this order after all. It leaves the queue in a few seconds."};
        }
        if (lastOutcome.startsWith("UNCERTAIN_CREATE_")) {
            String provider = lastOutcome.endsWith("BORZO") ? "Borzo" : lastOutcome.endsWith("PIDGE") ? "Pidge" : "the courier company";
            return new String[] {"CRITICAL", "A " + provider + " booking may exist for this order. Check " + provider
                + " before booking anyone else." + waited};
        }
        String why = lastOutcome.startsWith("COURIER_") ? "The " + (courier.isEmpty() ? "courier company's" : courier) + " courier gave up."
            : "NO_DELIVERY_COMMAND".equals(lastOutcome) ? "The delivery request is missing."
            : "Riders, Borzo and Pidge did not take this order.";
        return new String[] {ageSeconds >= QUEUE_CRITICAL_MINUTES * 60L ? "CRITICAL" : "WARNING",
            why + " Hand it to a rider, or book a courier by hand." + waited};
    }

    /**
     * The latest fix of each rider who is on shift or on a trip now (blueprint E6: location only while working): where,
     * how old, on shift, on a trip (which), and whether the phone said it was a mock location. Riders only; nothing about
     * customers.
     */
    public PositionList positions() {
        return new PositionList(jdbc.query("""
            SELECT * FROM (
              SELECT p.rider_id, r.name, p.lat, p.lng, p.recorded_at, p.mock,
                     GREATEST(0, EXTRACT(EPOCH FROM now() - p.recorded_at))::bigint AS age_seconds,
                     EXISTS (SELECT 1 FROM fleet_schema.rider_shift s WHERE s.rider_id = p.rider_id AND s.ended_at IS NULL) AS on_shift,
                     (SELECT t.id FROM fleet_schema.trip t WHERE t.rider_id = p.rider_id AND t.state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP')
                       LIMIT 1) AS trip_id
              FROM fleet_schema.rider_position_latest p JOIN fleet_schema.rider r ON r.id = p.rider_id) working
            WHERE on_shift OR trip_id IS NOT NULL
            ORDER BY name, rider_id LIMIT 1000""", (row, n) -> {
            UUID tripId = row.getObject("trip_id", UUID.class);
            return new Position(row.getObject("rider_id", UUID.class), row.getString("name"), row.getDouble("lat"), row.getDouble("lng"),
                row.getTimestamp("recorded_at").toInstant(), row.getLong("age_seconds"), row.getBoolean("on_shift"), tripId != null, tripId,
                row.getBoolean("mock"));
        }));
    }

    /**
     * To one on-shift idle rider (an order no rider holds yet, or, with riderHandover, a rider's trip before pickup, on a
     * new trip) or to Borzo or Pidge (an order still searching, or a rider's trip before pickup). A released rider is paid
     * for the trip so far, not held. The answer is the trip that carries the order now. 409 TRIP_NOT_REASSIGNABLE,
     * RIDER_NOT_AVAILABLE, or RATE_CARD_REQUIRED (no published rate card has started) otherwise.
     */
    public Object reassign(Admin by, UUID key, UUID tripId, ReassignInput input) {
        String reason = FleetAdminService.reason(input == null ? null : input.reason());
        if ((input.riderId() == null) == (input.provider() == null)
            || (input.provider() != null && !Set.of("BORZO", "PIDGE").contains(input.provider()))) {
            throw FleetApiException.invalid("Choose one rider, or Borzo or Pidge.");
        }
        String target = input.riderId() != null ? "rider " + input.riderId() : input.provider();
        return transaction.execute(status -> admin.once(by, key, "TRIP_REASSIGNED", tripId + "\n" + target + "\n" + reason, () -> {
            Current trip = current(tripId);
            UUID released = trip.riderOnTrip() ? trip.riderId() : null;
            UUID now = input.riderId() != null ? toRider(trip, input.riderId(), by) : toCourier(trip, input.provider(), by);
            return new Done(view(now), input.riderId() != null ? input.riderId() : released, tripId.toString(),
                "Gave order " + trip.orderCode() + " to " + target + (released != null && input.riderId() != null ? " from rider " + released : "")
                    + ": " + reason);
        }));
    }

    /**
     * Cancels the delivery. A rider's trip ends with the trip-state pay rule (not held) and CANCELLED reaches the order; an
     * order still searching stops: the open stage closes, offers are withdrawn and the delivery command books nobody. A
     * Borzo or Pidge booking is cancelled with them first, outside the transaction (FleetCourierCancel.forOps): 409
     * TRIP_NOT_CANCELLABLE with their reason when they refuse, and the delivery stays as it was.
     */
    public Object cancel(Admin by, UUID key, UUID tripId, String reason) {
        String text = FleetAdminService.reason(reason);
        couriers.forOps(tripId);
        return transaction.execute(status -> admin.once(by, key, "TRIP_CANCELLED", tripId + "\n" + text, () -> {
            Current trip = current(tripId);
            if (trip.riderOnTrip()) {
                lock(trip);
                trips.cancel(tripId, CANCELLED);
                event(tripId, "OPS_CANCELLED", by);
                bridge.publish(tripId);
            } else {
                // Borzo or Pidge cancelled by Craves (forOps) still read as running until their callback arrives.
                boolean courierCancelled = trip.courierJob() && couriers.cancelled(trip.chefSubOrderId());
                if (trip.courierJob() && !trip.courierFinished() && !courierCancelled) {
                    throw changed(); // booked after forOps looked
                }
                // That cancel ends the delivery here, once, even with no stage open (the courier's closed when they took it).
                boolean endsCourier = courierCancelled && !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 "
                    + "FROM fleet_schema.trip_event WHERE trip_id = ? AND kind = 'OPS_CANCELLED')", Boolean.class, tripId));
                if (trip.openStage() == null && !endsCourier) {
                    throw FleetApiException.conflict("TRIP_ALREADY_FINISHED", "This delivery has already ended.");
                }
                // A released rider's job being rebooked: the dispatch tick records a booked courier only under this lock, and
                // never after an OPS_CANCELLED stage (FleetDispatchJobs.switchJob).
                if (trip.fleetJob() && jdbc.queryForList("SELECT id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ? "
                    + "AND provider_id = 'craves_fleet' FOR UPDATE", UUID.class, trip.chefSubOrderId()).isEmpty()) {
                    throw changed();
                }
                if (trip.openStage() != null) {
                    closeOpenStage(trip, "OPS_CANCELLED");
                }
                if (trip.jobProvider() == null) {
                    takeOverCommand(trip, "DEAD_LETTER", "Delivery cancelled by Craves ops");
                }
                lock(trip);
                if (trip.fleetJob()) {
                    closedFleetStage(tripId, "OPS_CANCELLED"); // the latest stage is the fleet's again, so CANCELLED reaches the order
                }
                jdbc.update("UPDATE fleet_schema.trip SET state = 'CANCELLED', cancel_reason = COALESCE(cancel_reason, 'Cancelled by Craves ops.'), "
                    + "finished_at = COALESCE(finished_at, now()), version = version + 1, updated_at = now() WHERE id = ?", tripId);
                event(tripId, "OPS_CANCELLED", by);
                if (trip.fleetJob()) {
                    bridge.publish(tripId);
                }
            }
            return new Done(view(tripId), trip.riderOnTrip() ? trip.riderId() : null, tripId.toString(),
                "Cancelled the delivery of order " + trip.orderCode() + ": " + text);
        }));
    }

    /**
     * Delivery codes typed offline that order-service refused (decision E4), oldest first: the rider was told they could go,
     * so the trip waits at the drop, and the rider gets no new offers, until ops has called the customer.
     */
    public CodeCheckList codeChecks() {
        return new CodeCheckList(jdbc.query("""
            SELECT t.id, t.order_code, t.kitchen_name, t.drop_area, t.rider_id, r.name AS rider_name, a.created_at AS alerted_at,
                   (SELECT count(*) FROM fleet_schema.trip_event w WHERE w.trip_id = t.id AND w.kind IN ('OTP_INVALID', 'OTP_LOCKED')) AS wrong_codes
            FROM fleet_schema.trip_event a
            JOIN fleet_schema.trip t ON t.id = a.trip_id
            JOIN fleet_schema.rider r ON r.id = t.rider_id
            WHERE a.kind = 'OFFLINE_OTP_ALERTED' AND t.state = 'AT_DROP'
            ORDER BY a.created_at, t.id LIMIT 200""", (row, n) -> new CodeCheck(row.getObject("id", UUID.class), row.getString("order_code"),
                row.getString("kitchen_name"), row.getString("drop_area"), row.getObject("rider_id", UUID.class), row.getString("rider_name"),
                row.getTimestamp("alerted_at").toInstant(), row.getInt("wrong_codes"))));
    }

    /**
     * Ops called the customer about a refused code typed offline: DELIVERED (they have the food: full pay, not held) or
     * NOT_DELIVERED (they don't: the trip fails with the same pay held while ops checks with the rider). Either reaches the
     * order (FleetTripService.checkedByOps). Only for a trip still waiting at the drop with that alert: 409 NO_CODE_CHECK.
     */
    public Object checkCode(Admin by, UUID key, UUID tripId, CodeCheckInput input) {
        String reason = FleetAdminService.reason(input == null ? null : input.reason());
        if (!Set.of("DELIVERED", "NOT_DELIVERED").contains(String.valueOf(input.outcome()))) {
            throw FleetApiException.invalid("Choose whether the customer has the food.");
        }
        boolean delivered = "DELIVERED".equals(input.outcome());
        return transaction.execute(status -> admin.once(by, key, "OFFLINE_CODE_CHECKED", tripId + "\n" + input.outcome() + "\n" + reason, () -> {
            Map<String, Object> trip = jdbc.queryForList("""
                SELECT t.order_code, t.rider_id FROM fleet_schema.trip t
                WHERE t.id = ? AND t.state = 'AT_DROP'
                  AND EXISTS (SELECT 1 FROM fleet_schema.trip_event a WHERE a.trip_id = t.id AND a.kind = 'OFFLINE_OTP_ALERTED')
                FOR UPDATE OF t""", tripId).stream().findFirst().orElseThrow(() -> FleetApiException.conflict("NO_CODE_CHECK",
                    "This delivery has no code to check now: it ended or the right code arrived. Reload the page."));
            trips.checkedByOps(tripId, delivered);
            event(tripId, "OPS_CODE_CHECKED", by);
            return new Done(view(tripId), (UUID) trip.get("rider_id"), tripId.toString(), (delivered ? "Customer has" : "Customer didn't get")
                + " order " + trip.get("order_code") + ": " + reason);
        }));
    }

    /** The trip that carries the order afterwards: this one, or a new trip when a rider's trip goes to another rider. */
    private UUID toRider(Current trip, UUID riderId, Admin by) {
        // The rider row before the stage and the trip, the order accept takes them in (FleetTripService.accept), so ops
        // giving an order to a rider who is accepting it waits instead of deadlocking.
        jdbc.queryForList("SELECT id FROM fleet_schema.rider WHERE id = ? FOR NO KEY UPDATE", riderId);
        if (riderHandover && trip.riderOnTrip()) {
            return handOver(trip, riderId, by);
        }
        if (trip.riderId() != null || trip.courierJob() || trip.fleetJob() || trip.openStage() == null) {
            throw notReassignable(trip.riderId() != null
                ? "This order's trip already belongs to a rider. Give it to Borzo or Pidge, or cancel it."
                : "This order already has a courier or has ended.");
        }
        closeOpenStage(trip, "OPS_ASSIGNED");
        if (!"CRAVES_FLEET".equals(trip.openStage())) {
            // Borzo, Pidge or the ops queue: the delivery command must not be booking anyone right now.
            takeOverCommand(trip, "COMPLETED", null);
            closedFleetStage(trip.id(), "OPS_ASSIGNED");
        }
        PayQuote quote = quoteFor(riderId, lock(trip));
        acceptedOffer(trip.id(), riderId, quote);
        try {
            jdbc.update("""
                UPDATE fleet_schema.trip SET state = 'ASSIGNED', provider = 'CRAVES_FLEET', rider_id = ?, pickup_distance_m = ?,
                  drop_distance_m = ?, rate_card_version = ?, pay_paise = ?, accepted_at = now(), version = version + 1, updated_at = now()
                WHERE id = ?""", riderId, quote.pickupDistanceM(), quote.dropDistanceM(), quote.rateCardVersion(), quote.totalPaise(), trip.id());
        } catch (DuplicateKeyException busy) {
            throw FleetApiException.conflict("RIDER_NOT_AVAILABLE", "This rider took another order just now.");
        }
        event(trip.id(), "OPS_ASSIGNED", by);
        if (!bridge.assigned(trip.id())) {
            throw notReassignable("This order got a courier just now. Reload the page.");
        }
        return trip.id();
    }

    /**
     * A rider's trip before pickup goes to another rider (WORKPLAN P2-06 f). A trip row is one rider's pay record, so the
     * first trip ends as a release (pay for the trip so far, not held) and is marked replaced, and the order carries on in a
     * new trip for the second rider with their own locked pay; the delivery job follows it (FleetStatusBridge.handedOver).
     * The second rider is checked before anything changes. Returns the new trip's id.
     */
    private UUID handOver(Current trip, UUID riderId, Admin by) {
        if (!Set.of("ASSIGNED", "AT_PICKUP").contains(trip.state())) {
            throw notReassignable("The rider has the food. Cancel the trip instead, or let them finish.");
        }
        if (trip.openStage() != null || trip.courierJob()) {
            throw changed();
        }
        // V166 only expanded the schema; until the contract migration drops it, this constraint allows one trip per order.
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'fleet_schema.trip'::regclass "
            + "AND conname = 'trip_chef_sub_order_id_key')", Boolean.class))) {
            LOGGER.warn("FLEET_HANDOVER_WAITS_FOR_MIGRATION trip={} (trip_chef_sub_order_id_key still exists)", trip.id());
            throw notReassignable("Moving a trip to another rider isn't switched on yet. Give it to Borzo or Pidge, or cancel it.");
        }
        Map<String, Object> locked = lock(trip);
        foodNotHandedOver(locked);
        PayQuote quote = quoteFor(riderId, locked);
        jdbc.update("UPDATE fleet_schema.trip SET state = 'CANCELLED', cancel_reason = ?, finished_at = now(), replaced_at = now(), "
            + "version = version + 1, updated_at = now() WHERE id = ?", HANDED_TO_RIDER, trip.id());
        event(trip.id(), "OPS_REASSIGNED", by);
        trips.tellRider(trip.id(), "HANDED_TO_RIDER");
        pay.finalizePay(trip.id(), "AT_PICKUP".equals(trip.state()) ? Ending.CANCELLED_AT_KITCHEN : Ending.CANCELLED_TO_KITCHEN, false, null);
        UUID next = UUID.randomUUID();
        try {
            jdbc.update("""
                INSERT INTO fleet_schema.trip (id, chef_sub_order_id, order_id, chef_id, order_code, state, provider, rider_id, items_count,
                  sealed, kitchen_name, kitchen_area, kitchen_address, kitchen_landmark, kitchen_lat, kitchen_lng, chef_phone,
                  customer_first_name, customer_phone, drop_area, drop_address, drop_landmark, drop_lat, drop_lng, pickup_distance_m,
                  drop_distance_m, rate_card_version, pay_paise, chef_ready_at, accepted_at, replaces, created_at)
                SELECT ?, chef_sub_order_id, order_id, chef_id, order_code, 'ASSIGNED', 'CRAVES_FLEET', ?, items_count, sealed, kitchen_name,
                  kitchen_area, kitchen_address, kitchen_landmark, kitchen_lat, kitchen_lng, chef_phone, customer_first_name, customer_phone,
                  drop_area, drop_address, drop_landmark, drop_lat, drop_lng, ?, ?, ?, ?, chef_ready_at, now(), id, created_at
                FROM fleet_schema.trip WHERE id = ?""", next, riderId, quote.pickupDistanceM(), quote.dropDistanceM(), quote.rateCardVersion(),
                quote.totalPaise(), trip.id());
        } catch (DuplicateKeyException busy) {
            throw FleetApiException.conflict("RIDER_NOT_AVAILABLE", "This rider took another order just now.");
        }
        acceptedOffer(next, riderId, quote);
        closedFleetStage(next, "OPS_ASSIGNED"); // the new trip's latest stage is the fleet's, so its steps reach the order
        event(next, "OPS_ASSIGNED", by);
        if (!bridge.handedOver(trip.id(), next)) {
            throw changed();
        }
        return next;
    }

    /**
     * The rider's locked pay for this trip, if they can take it now (active, online, free and heard from, as for dispatch,
     * and allowed by test mode), on a published rate card that has started. 409 RIDER_NOT_AVAILABLE or RATE_CARD_REQUIRED.
     */
    private PayQuote quoteFor(UUID riderId, Map<String, Object> locked) {
        Map<String, Object> rider = jdbc.queryForList("""
            SELECT p.lat, p.lng FROM fleet_schema.rider r
            JOIN fleet_schema.rider_shift s ON s.rider_id = r.id AND s.ended_at IS NULL AND s.credential_revoked_at IS NULL
              AND s.credential_expires_at > now()
            JOIN fleet_schema.rider_position_latest p ON p.rider_id = r.id
            WHERE r.id = ? AND r.status = 'ACTIVE' AND\s""" + FleetDispatcher.HEARD_FROM + """

              AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip t WHERE t.rider_id = r.id AND t.state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'))
              AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip_offer o WHERE o.rider_id = r.id AND o.state = 'ACTIVE' AND o.expires_at > now())
            FOR UPDATE OF r""", riderId).stream().findFirst().orElse(null);
        if (rider == null || !testMode.riderAllowed(riderId) || !testMode.kitchenAllowed((UUID) locked.get("chef_id"))) {
            throw FleetApiException.conflict("RIDER_NOT_AVAILABLE",
                "This rider can't take it now: they must be active, online, free and sending their location.");
        }
        // Riders are paid only on a published rate card that has started: the trip's own if it is one, else the one in force.
        Instant now = policies.databaseNow();
        RateCard card = policies.rateCard((String) locked.get("rate_card_version"))
            .filter(own -> !own.draft() && !own.effectiveFrom().isAfter(now)).or(() -> policies.rateCardInForce(now))
            .orElseThrow(() -> FleetApiException.conflict("RATE_CARD_REQUIRED", "Publish a rate card before giving trips to riders."));
        int detour = policies.currentDispatchPolicy().map(DispatchPolicy::pickupDetourPercent).orElse(130);
        int dropM = locked.get("drop_distance_m") == null ? 0 : ((Number) locked.get("drop_distance_m")).intValue();
        return FleetPay.quote(card, dropM, FleetPay.pickupDistanceM(RoadDistanceClient.straightLineMetres(
            ((Number) rider.get("lat")).doubleValue(), ((Number) rider.get("lng")).doubleValue(),
            ((Number) locked.get("kitchen_lat")).doubleValue(), ((Number) locked.get("kitchen_lng")).doubleValue()), detour),
            dispatcher.raining());
    }

    /** The offer ops accepted for the rider: the pay they see is locked like any accepted offer's. */
    private void acceptedOffer(UUID tripId, UUID riderId, PayQuote quote) {
        jdbc.update("""
            INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, state, pay_paise, pay_lines, rate_card_version, pickup_distance_m,
              drop_distance_m, expires_at, decided_at)
            VALUES (?, ?, ?, 'ACCEPTED', ?, CAST(? AS jsonb), ?, ?, ?, now() + INTERVAL '40 seconds', now())""",
            UUID.randomUUID(), tripId, riderId, quote.totalPaise(), write(quote.lines()), quote.rateCardVersion(), quote.pickupDistanceM(),
            quote.dropDistanceM());
    }

    private UUID toCourier(Current trip, String provider, Admin by) {
        if (trip.riderOnTrip()) {
            if (!Set.of("ASSIGNED", "AT_PICKUP").contains(trip.state())) {
                throw notReassignable("The rider has the food. Cancel the trip instead, or let them finish.");
            }
            foodNotHandedOver(lock(trip));
            jdbc.update("UPDATE fleet_schema.trip SET state = 'CANCELLED', cancel_reason = ?, finished_at = now(), version = version + 1, "
                + "updated_at = now() WHERE id = ?", RELEASED, trip.id());
            event(trip.id(), "OPS_REASSIGNED", by);
            trips.tellRider(trip.id(), "RELEASED");
            pay.finalizePay(trip.id(), "AT_PICKUP".equals(trip.state()) ? Ending.CANCELLED_AT_KITCHEN : Ending.CANCELLED_TO_KITCHEN, false, null);
            // The rider's delivery job stays; the dispatch tick books this stage's courier and hands the job over.
            dispatcher.openStage(trip.id(), provider, stageSeconds(provider));
            return trip.id();
        }
        if (trip.openStage() == null || trip.courierJob() || provider.equals(trip.openStage())) {
            throw notReassignable(trip.openStage() == null ? "This delivery has ended."
                : trip.courierJob() ? "Borzo or Pidge has this order already." : "This order is already with " + provider + ".");
        }
        if (!trip.fleetJob()) {
            // The delivery command books the next courier; it must still be running to do so.
            String command = jdbc.queryForList("SELECT status FROM delivery_schema.delivery_command WHERE chef_sub_order_id = ? FOR UPDATE",
                String.class, trip.chefSubOrderId()).stream().findFirst().orElse("");
            if (!Set.of("SCHEDULED", "WAITING_FOR_PROVIDER", "PROCESSING").contains(command)) {
                throw notReassignable("No booking is running for this order any more. Give it to a rider, or book a courier by hand.");
            }
            // Borzo gets a fresh 120-second window; Pidge means Borzo's window is over (DeliveryProviderRouter).
            jdbc.update("UPDATE delivery_schema.delivery_command SET borzo_window_started_at = now() - make_interval(secs => ?), "
                + "updated_at = now() WHERE chef_sub_order_id = ?", "BORZO".equals(provider) ? 0 : FleetDispatcher.BORZO_WINDOW_SECONDS + 1,
                trip.chefSubOrderId());
        }
        closeOpenStage(trip, "OPS_REASSIGNED");
        lock(trip);
        if (trip.riderId() == null) {
            jdbc.update("UPDATE fleet_schema.trip SET provider = ?, version = version + 1, updated_at = now() WHERE id = ?", provider, trip.id());
        }
        event(trip.id(), "OPS_REASSIGNED", by);
        dispatcher.openStage(trip.id(), provider, stageSeconds(provider));
        return trip.id();
    }

    /** The open stage closes first (the row an accept or the dispatch tick would close), so neither can book after this. */
    private void closeOpenStage(Current trip, String outcome) {
        if (jdbc.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', outcome = ?, closed_at = now() WHERE id = ? AND state = 'OPEN'",
            outcome, trip.openStageId()) != 1) {
            throw changed();
        }
        if ("CRAVES_FLEET".equals(trip.openStage())) {
            jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'WITHDRAWN', decided_at = now() WHERE trip_id = ? AND state = 'ACTIVE'", trip.id());
        }
    }

    /** A closed fleet stage after the last one: the rider's steps (or CANCELLED) reach the order again (FleetStatusBridge). */
    private void closedFleetStage(UUID tripId, String outcome) {
        jdbc.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, state, outcome, deadline_at, closed_at) "
            + "SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, 'CRAVES_FLEET', 'CLOSED', ?, now() + INTERVAL '1 second', now() "
            + "FROM fleet_schema.trip_stage WHERE trip_id = ?", UUID.randomUUID(), tripId, outcome, tripId);
    }

    /** Only when the delivery command is not booking right now: a claim waits on this row and then finds it done. */
    private void takeOverCommand(Current trip, String status, String note) {
        if (jdbc.update("UPDATE delivery_schema.delivery_command SET status = ?, last_error = COALESCE(?, last_error), processing_started_at = NULL, "
            + "next_provider_retry_at = NULL, updated_at = now() WHERE chef_sub_order_id = ? AND status IN ('SCHEDULED', 'WAITING_FOR_PROVIDER', "
            + "'FAILED', 'DEAD_LETTER')", status, note, trip.chefSubOrderId()) != 1) {
            throw new FleetApiException(409, "COMPLETED".equals(status) ? "TRIP_NOT_REASSIGNABLE" : "TRIP_NOT_CANCELLABLE",
                "A Borzo or Pidge booking for this order is in progress. Try again in a minute.");
        }
    }

    /** The chef handed this rider the food (P2-05): another rider or a courier would find an empty kitchen. */
    private static void foodNotHandedOver(Map<String, Object> locked) {
        if (locked.get("chef_handed_over_at") != null) {
            throw notReassignable("The chef already handed this rider the food. Call the rider, or cancel the trip.");
        }
    }

    /** The trip row, locked, unchanged since it was read. */
    private Map<String, Object> lock(Current trip) {
        Map<String, Object> row = jdbc.queryForList("SELECT state, rider_id, chef_id, rate_card_version, drop_distance_m, kitchen_lat, kitchen_lng, "
            + "chef_handed_over_at FROM fleet_schema.trip WHERE id = ? FOR UPDATE", trip.id()).stream().findFirst().orElseThrow(FleetOpsService::changed);
        if (!trip.state().equals(row.get("state")) || !java.util.Objects.equals(trip.riderId(), row.get("rider_id"))) {
            throw changed();
        }
        return row;
    }

    /** The trip, which must still carry its order: one given to another rider (replaced) is refused as changed. */
    private Current current(UUID tripId) {
        Current trip = jdbc.query("""
            SELECT t.id, t.chef_sub_order_id, t.order_code, t.state, t.rider_id, s.id AS stage_id, s.provider AS open_stage,
                   j.provider_id AS job_provider, j.status AS job_status, t.replaced_at IS NOT NULL AS replaced
            FROM fleet_schema.trip t
            LEFT JOIN fleet_schema.trip_stage s ON s.trip_id = t.id AND s.state = 'OPEN'
            LEFT JOIN delivery_schema.delivery_job j ON j.chef_sub_order_id = t.chef_sub_order_id
            WHERE t.id = ?""", (row, n) -> new Current(row.getObject("id", UUID.class), row.getObject("chef_sub_order_id", UUID.class),
                row.getString("order_code"), row.getString("state"), row.getObject("rider_id", UUID.class), row.getObject("stage_id", UUID.class),
                row.getString("open_stage"), row.getString("job_provider"), row.getString("job_status"), row.getBoolean("replaced")), tripId)
            .stream().findFirst().orElseThrow(() -> FleetApiException.notFound("TRIP_NOT_FOUND", "No such trip."));
        if (trip.replaced()) {
            throw changed();
        }
        return trip;
    }

    private void event(UUID tripId, String kind, Admin by) {
        jdbc.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, actor_id, trip_version) "
            + "SELECT ?, id, ?, 'OPS', ?, version FROM fleet_schema.trip WHERE id = ?", UUID.randomUUID(), kind, by.id(), tripId);
    }

    private int stageSeconds(String provider) {
        return "BORZO".equals(provider) ? FleetDispatcher.BORZO_WINDOW_SECONDS : dispatcher.pidgeSeconds();
    }

    OpsTrip view(UUID tripId) {
        return jdbc.queryForObject(TRIPS + "WHERE t.id = ?", (row, n) -> trip(row), tripId);
    }

    /**
     * The courier the order has now: the ops queue or a stage that is booking (no rider), Borzo or Pidge once they hold
     * the delivery job (state from their status), else the rider's trip. riderId only for CRAVES_FLEET.
     */
    static OpsTrip trip(ResultSet row) throws SQLException {
        String state = row.getString("state");
        String provider = row.getString("provider");
        UUID riderId = row.getObject("rider_id", UUID.class);
        String openStage = row.getString("open_stage");
        String jobProvider = row.getString("job_provider");
        if ("OPS_QUEUE".equals(openStage)) {
            provider = "OPS_QUEUE";
            state = "SEARCHING";
        } else if (jobProvider != null && !FleetStatusBridge.PROVIDER_ID.equals(jobProvider)) {
            provider = "borzo".equals(jobProvider) ? "BORZO" : "pidge".equals(jobProvider) ? "PIDGE" : openStage != null ? openStage : provider;
            state = courierState(row.getString("job_status"));
        } else if (openStage != null && (riderId == null || "CANCELLED".equals(state))) {
            provider = openStage;
            state = "SEARCHING";
        }
        boolean rider = "CRAVES_FLEET".equals(provider) && riderId != null;
        return new OpsTrip(row.getObject("id", UUID.class), row.getString("order_code"), row.getString("kitchen_name"), row.getString("drop_area"),
            state, provider, rider ? riderId : null, rider ? row.getString("rider_name") : null, row.getTimestamp("created_at").toInstant(),
            row.getTimestamp("updated_at").toInstant());
    }

    /** A Borzo or Pidge delivery status as the console's trip state. */
    static String courierState(String status) {
        return switch (status == null ? "" : status) {
            case "COURIER_ASSIGNED", "COURIER_TO_PICKUP" -> "ASSIGNED";
            case "AT_PICKUP" -> "AT_PICKUP";
            case "PICKED_UP", "IN_TRANSIT" -> "PICKED_UP";
            case "AT_DROPOFF" -> "AT_DROP";
            case "DELIVERED" -> "DELIVERED";
            case "CANCELLED" -> "CANCELLED";
            case "FAILED", "RETURNING", "RETURNED" -> "FAILED";
            default -> "SEARCHING";
        };
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Pay lines could not be stored", exception);
        }
    }

    private static FleetApiException notReassignable(String message) {
        return FleetApiException.conflict("TRIP_NOT_REASSIGNABLE", message);
    }

    private static FleetApiException changed() {
        return FleetApiException.conflict("TRIP_CHANGED", "This order changed just now. Reload the page and try again.");
    }

    /** The trip as read before locking: its open stage and its delivery job, if any. */
    record Current(UUID id, UUID chefSubOrderId, String orderCode, String state, UUID riderId, UUID openStageId, String openStage,
                   String jobProvider, String jobStatus, boolean replaced) {
        boolean riderOnTrip() {
            return riderId != null && RIDER_ON_TRIP.contains(state);
        }

        boolean fleetJob() {
            return FleetStatusBridge.PROVIDER_ID.equals(jobProvider);
        }

        /** Borzo or Pidge holds the delivery job. */
        boolean courierJob() {
            return jobProvider != null && !fleetJob();
        }

        boolean courierFinished() {
            return courierJob() && Set.of("DELIVERED", "CANCELLED", "FAILED", "RETURNED").contains(jobStatus);
        }
    }

    /** admin-fleet-v1 DispatchQueueItem. */
    public record QueueItem(UUID tripId, String orderCode, String kitchenName, String dropArea, Instant queuedAt, String alertLevel,
                            String alertMessage, List<Attempt> attempts) {
    }

    public record Attempt(String provider, String outcome, Instant at) {
    }

    public record QueueList(List<QueueItem> items) {
    }

    /** admin-fleet-v1 RiderPosition. */
    public record Position(UUID riderId, String riderName, double lat, double lng, Instant recordedAt, long ageSeconds, boolean onShift,
                           boolean onTrip, UUID tripId, boolean mock) {
    }

    public record PositionList(List<Position> positions) {
    }

    public record ReassignInput(UUID riderId, String provider, String reason) {
    }

    /** admin-fleet-v1 CodeCheck: a refused code typed offline, waiting for ops to call the customer. */
    public record CodeCheck(UUID tripId, String orderCode, String kitchenName, String dropArea, UUID riderId, String riderName,
                            Instant alertedAt, int wrongCodes) {
    }

    public record CodeCheckList(List<CodeCheck> items) {
    }

    /** outcome DELIVERED or NOT_DELIVERED: what the customer told ops. */
    public record CodeCheckInput(String outcome, String reason) {
    }

    /** admin-fleet-v1 Trip. riderId and riderName only for CRAVES_FLEET. */
    public record OpsTrip(UUID tripId, String orderCode, String kitchenName, String dropArea, String state, String provider, UUID riderId,
                          String riderName, Instant createdAt, Instant updatedAt) {
    }

    public record TripList(List<OpsTrip> trips) {
    }
}
