package in.craves.integration.fleet.trip;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.client.DeliveryCodeClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.pay.FleetPay.Ending;
import in.craves.integration.fleet.trip.FleetTripModels.Customer;
import in.craves.integration.fleet.trip.FleetTripModels.Kitchen;
import in.craves.integration.fleet.trip.FleetTripModels.Trip;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

/**
 * Offers and trips for riders (PLAN F9, F9b; rider-v1 /offers and /trips). An accept is decided by one conditional
 * UPDATE: it closes the trip's open fleet stage for a live offer, so of two accepts exactly one wins and an accept after
 * the stage closed is refused. Declining changes nothing but that offer. Steps are idempotent and in order; every paid
 * end stores the final pay lines and publishes FleetTripPayFinalized.
 */
@Service
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetTripService {
    private static final TypeReference<List<PayLine>> LINES = new TypeReference<>() { };
    static final String ACTIVE_STATES = "('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP')";
    private static final String VIEW = """
        SELECT t.*, o.pay_lines::text AS offer_lines, t.final_pay_lines::text AS final_lines, rc.wait_free_minutes,
               rc.unreachable_wait_minutes, rc.wait_per_minute_paise
        FROM fleet_schema.trip t
        LEFT JOIN fleet_schema.trip_offer o ON o.trip_id = t.id AND o.state = 'ACCEPTED'
        LEFT JOIN fleet_schema.rate_card rc ON rc.version = t.rate_card_version
        """;

    static final int KITCHEN_ZONE_M = 300;
    static final int MAX_PHOTO_BYTES = 10 * 1024 * 1024;
    static final Set<String> FAIL_REASONS = Set.of("CUSTOMER_UNREACHABLE", "WRONG_ADDRESS", "CUSTOMER_REFUSED", "UNSAFE");
    static final String PHOTO_HOLD = "Delivered with a photo. Ops checks the photo before this pay is released.";
    /** The cancel reason riders see when the customer or the chef cancelled the order. */
    public static final String ORDER_CANCELLED = "The order was cancelled.";
    // shortcut: integration-service hears of a cancelled order only as the refund order-service requests for it, so that
    // is the signal; switch to an order-cancelled event if order-service ever cancels without a refund (meal-plan orders).
    public static final String ORDER_REFUNDED = "EXISTS (SELECT 1 FROM payment_schema.refund r WHERE r.chef_sub_order_id = t.chef_sub_order_id)";
    static final String FAILED_HOLD = "Ops checks failed deliveries before this pay is released.";
    /** Step: the state it needs, the state it leaves the trip in. */
    private static final Map<String, String[]> STEPS = Map.of("arrived-pickup", new String[] {"ASSIGNED", "AT_PICKUP"},
        "food-not-ready", new String[] {"AT_PICKUP", "AT_PICKUP"}, "picked-up", new String[] {"AT_PICKUP", "PICKED_UP"},
        "arrived-drop", new String[] {"PICKED_UP", "AT_DROP"});

    private final JdbcTemplate jdbc;
    private final FleetTripPay pay;
    private final FleetStatusBridge bridge;
    private final ObjectMapper json;
    private final DeliveryCodeClient codes;
    private final FleetStorage storage;
    private final TransactionTemplate transaction;

    public FleetTripService(JdbcTemplate jdbc, FleetTripPay pay, FleetStatusBridge bridge, ObjectMapper json, DeliveryCodeClient codes,
                            FleetStorage storage, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.pay = pay;
        this.bridge = bridge;
        this.json = json;
        this.codes = codes;
        this.storage = storage;
        this.transaction = new TransactionTemplate(transactions);
    }

    /**
     * 200 with the trip for the winner; 409 OFFER_TAKEN for a lost race; 409 ORDER_CANCELLED once the order is cancelled;
     * 410 OFFER_EXPIRED; a repeat by the winner gets the trip.
     */
    @Transactional
    public Trip accept(UUID identityId, UUID offerId, String idempotencyKey) {
        Rider rider = activeRider(identityId);
        // The one decisive statement: it closes the order's open fleet stage, only for a live offer of this rider and an
        // order still going. A second accept waits on the same stage row, then finds it closed. The stage's deadline makes a
        // late accept fail here too.
        List<UUID> won = jdbc.queryForList("""
            UPDATE fleet_schema.trip_stage s SET state = 'CLOSED', outcome = 'ACCEPTED', closed_at = now()
            FROM fleet_schema.trip_offer o JOIN fleet_schema.trip t ON t.id = o.trip_id
            WHERE o.id = ? AND o.rider_id = ? AND o.state = 'ACTIVE' AND o.expires_at > now()
              AND s.trip_id = o.trip_id AND s.provider = 'CRAVES_FLEET' AND s.state = 'OPEN' AND s.deadline_at > now()
              AND NOT\s""" + ORDER_REFUNDED + " RETURNING s.trip_id", UUID.class, offerId, rider.id());
        if (won.isEmpty()) {
            return notWon(offerId, rider);
        }
        UUID tripId = won.get(0);
        if (jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'ACCEPTED', decided_at = now() WHERE id = ? AND state = 'ACTIVE'", offerId) != 1) {
            throw expired(); // rolls the stage back open
        }
        jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'LOST', decided_at = now() WHERE trip_id = ? AND id <> ? AND state = 'ACTIVE'",
            tripId, offerId);
        try {
            if (jdbc.update("""
                UPDATE fleet_schema.trip t SET state = 'ASSIGNED', rider_id = o.rider_id, pickup_distance_m = o.pickup_distance_m,
                  drop_distance_m = o.drop_distance_m, rate_card_version = o.rate_card_version, pay_paise = o.pay_paise, accepted_at = now(),
                  version = t.version + 1, updated_at = now()
                FROM fleet_schema.trip_offer o
                WHERE o.id = ? AND t.id = o.trip_id AND t.state = 'SEARCHING' AND t.provider = 'CRAVES_FLEET'""", offerId) != 1) {
                throw taken();
            }
        } catch (DuplicateKeyException activeTrip) {
            throw FleetApiException.conflict("TRIP_IN_PROGRESS", "Finish your current trip before you take another order.");
        }
        event(tripId, "ACCEPTED", rider.id(), idempotencyKey, Map.of("offerId", offerId.toString()));
        if (!bridge.assigned(tripId)) {
            throw taken();
        }
        return view(tripId);
    }

    /** Free, no reason needed, and nothing but this offer changes; repeating it is harmless. */
    @Transactional
    public void decline(UUID identityId, UUID offerId) {
        Rider rider = rider(identityId);
        if (jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now() WHERE id = ? AND rider_id = ? "
            + "AND state = 'ACTIVE'", offerId, rider.id()) == 0
            && !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.trip_offer WHERE id = ? AND rider_id = ?)",
                Boolean.class, offerId, rider.id()))) {
            throw offerNotFound();
        }
    }

    /** The rider's trip in progress, if any (GET /trips/active). */
    @Transactional(readOnly = true)
    public Optional<Trip> active(UUID identityId) {
        Rider rider = rider(identityId);
        return jdbc.query(VIEW + "WHERE t.rider_id = ? AND t.state IN " + ACTIVE_STATES, (row, n) -> trip(row), rider.id()).stream().findFirst();
    }

    /**
     * arrived-pickup, food-not-ready, picked-up, arrived-drop. Idempotent: a repeated key, or a step the trip already took,
     * returns the trip. Out of order is 409 STEP_CONFLICT. The free wait starts at the later of a real arrival inside the
     * kitchen zone (a fresh non-mock fix within 300 m) and the chef's ready time, and stops at pickup.
     */
    @Transactional
    public Trip step(UUID identityId, UUID tripId, String action, String key) {
        String[] move = STEPS.get(action);
        if (move == null) {
            throw FleetApiException.invalid("Unknown trip step.");
        }
        Rider rider = rider(identityId);
        Locked trip = lock(tripId, rider);
        if (replayed(tripId, key).isPresent() || (trip.state().equals(move[1]) && !"food-not-ready".equals(action))) {
            return view(tripId);
        }
        requireState(trip, move[0], "This trip has moved on. Refreshing it now.");
        Double fromKitchen = "arrived-pickup".equals(action) || "food-not-ready".equals(action) ? metresFromKitchen(rider.id(), trip) : null;
        boolean inZone = fromKitchen != null && fromKitchen <= KITCHEN_ZONE_M;
        jdbc.update("UPDATE fleet_schema.trip SET state = ?, version = version + 1, updated_at = now(), "
            + "arrived_kitchen_at = CASE WHEN ? THEN COALESCE(arrived_kitchen_at, now()) ELSE arrived_kitchen_at END, "
            + "picked_up_at = CASE WHEN ? THEN now() ELSE picked_up_at END, arrived_drop_at = CASE WHEN ? THEN now() ELSE arrived_drop_at END "
            + "WHERE id = ?", move[1], inZone, "picked-up".equals(action), "arrived-drop".equals(action), tripId);
        Map<String, Object> detail = new java.util.HashMap<>();
        if (fromKitchen != null) {
            detail.put("metresFromKitchen", Math.round(fromKitchen));
            detail.put("insideKitchenZone", inZone);
        }
        event(tripId, action.toUpperCase(java.util.Locale.ROOT).replace('-', '_'), rider.id(), key, detail);
        if (!"food-not-ready".equals(action)) {
            bridge.publish(tripId);
        }
        return view(tripId);
    }

    /**
     * Delivered with the customer's code, checked by order-service (never retried; the code is never stored or logged).
     * Wrong: 422 OTP_INVALID with attemptsLeft (4 to 1). The fifth wrong code and every code after it: 423 OTP_LOCKED, and
     * the photo route opens. A repeated Idempotency-Key gets the first answer without asking order-service again.
     */
    public Trip deliveredByOtp(UUID identityId, UUID tripId, String otp, String key) {
        if (otp == null || !otp.matches("[0-9]{4}")) {
            throw FleetApiException.invalid("Enter the 4-digit OTP the customer reads out.");
        }
        Rider rider = rider(identityId);
        Locked trip = transaction.execute(status -> {
            Locked locked = lock(tripId, rider);
            replay(tripId, key);
            return locked;
        });
        if ("DELIVERED".equals(trip.state())) {
            return view(tripId);
        }
        requireState(trip, "AT_DROP", "Tap \"I've reached the customer\" first.");
        if (otpLocked(tripId)) {
            throw otpLockedError();
        }
        DeliveryCodeClient.Result result = codes.verify(trip.chefSubOrderId(), otp);
        if (result.outcome() == DeliveryCodeClient.Outcome.NOT_FOUND || result.outcome() == DeliveryCodeClient.Outcome.UNAVAILABLE) {
            throw new FleetApiException(503, "OTP_UNAVAILABLE", "We couldn't check the OTP just now. Try again, or call rider support.");
        }
        Optional<FleetApiException> refusal = transaction.execute(status -> {
            Locked now = lock(tripId, rider);
            if ("DELIVERED".equals(now.state())) {
                return Optional.<FleetApiException>empty();
            }
            requireState(now, "AT_DROP", "Tap \"I've reached the customer\" first.");
            if (result.outcome() == DeliveryCodeClient.Outcome.VERIFIED) {
                deliver(tripId, rider.id(), key, Map.of("method", "OTP"), false, null);
                return Optional.<FleetApiException>empty();
            }
            boolean lockedNow = result.outcome() == DeliveryCodeClient.Outcome.LOCKED || result.attemptsLeft() < 1;
            event(tripId, lockedNow ? "OTP_LOCKED" : "OTP_INVALID", rider.id(), key,
                lockedNow ? Map.of() : Map.of("attemptsLeft", result.attemptsLeft()));
            return Optional.of(lockedNow ? otpLockedError() : otpInvalid(result.attemptsLeft()));
        });
        if (refusal.isPresent()) {
            throw refusal.get(); // after the attempt is stored, so a retried key gets the same answer
        }
        return view(tripId);
    }

    /**
     * Delivered with a photo, for a customer who did not answer: only after two logged calls and the unreachable wait since
     * arriving at the drop, or once the OTP is locked. The photo goes to private storage and the trip's pay is held for ops.
     */
    public Trip deliveredByPhoto(UUID identityId, UUID tripId, Integer callsMade, MultipartFile photo, String key) {
        byte[] bytes = photoBytes(photo);
        Rider rider = rider(identityId);
        Locked trip = transaction.execute(status -> {
            Locked locked = lock(tripId, rider);
            replay(tripId, key);
            return locked;
        });
        if ("DELIVERED".equals(trip.state())) {
            return view(tripId);
        }
        requireState(trip, "AT_DROP", "Tap \"I've reached the customer\" first.");
        if (!otpLocked(tripId)) {
            if (callsMade == null || callsMade < 2) {
                throw FleetApiException.unprocessable("CALLS_REQUIRED", "Call the customer twice before leaving the order.");
            }
            requireUnreachableWaitOver(tripId);
        }
        String blob = "riders/" + rider.id() + "/trips/" + tripId + "/delivery-" + UUID.randomUUID()
            + ("image/png".equals(photo.getContentType()) ? ".png" : ".jpg");
        // shortcut: a trip that changes between upload and save leaves an unreferenced photo; sweep if it ever shows up.
        storage.upload(blob, bytes, photo.getContentType(), false);
        transaction.executeWithoutResult(status -> {
            Locked now = lock(tripId, rider);
            if (!"DELIVERED".equals(now.state())) {
                requireState(now, "AT_DROP", "Tap \"I've reached the customer\" first.");
                deliver(tripId, rider.id(), key, Map.of("method", "PHOTO", "photoBlob", blob, "callsMade", callsMade == null ? 0 : callsMade),
                    true, PHOTO_HOLD);
            }
        });
        return view(tripId);
    }

    /**
     * failed {reason, note}, only after pickup. CUSTOMER_UNREACHABLE needs the drop and the unreachable wait: full pay.
     * WRONG_ADDRESS, CUSTOMER_REFUSED, UNSAFE: full pay plus the return to the kitchen. Either way held for ops to check.
     */
    @Transactional
    public Trip failed(UUID identityId, UUID tripId, String reason, String note, String key) {
        if (reason == null || !FAIL_REASONS.contains(reason)) {
            throw FleetApiException.invalid("Choose why the delivery failed.");
        }
        Rider rider = rider(identityId);
        Locked trip = lock(tripId, rider);
        if (replayed(tripId, key).isPresent() || "FAILED".equals(trip.state())) {
            return view(tripId);
        }
        if (!"PICKED_UP".equals(trip.state()) && !"AT_DROP".equals(trip.state())) {
            requireState(trip, "PICKED_UP", "You can only mark a trip failed after pickup.");
        }
        boolean unreachable = "CUSTOMER_UNREACHABLE".equals(reason);
        if (unreachable) {
            requireState(trip, "AT_DROP", "Tap \"I've reached the customer\" first.");
            requireUnreachableWaitOver(tripId);
        }
        jdbc.update("UPDATE fleet_schema.trip SET state = 'FAILED', cancel_reason = ?, finished_at = now(), version = version + 1, "
            + "updated_at = now() WHERE id = ?", reason, tripId);
        Map<String, Object> detail = new java.util.HashMap<>();
        detail.put("reason", reason);
        if (note != null && !note.isBlank()) {
            detail.put("note", note.length() > 500 ? note.substring(0, 500) : note);
        }
        event(tripId, "FAILED", rider.id(), key, detail);
        pay.finalizePay(tripId, unreachable ? Ending.CUSTOMER_UNREACHABLE : Ending.FAILED_AFTER_PICKUP, true, FAILED_HOLD);
        bridge.publish(tripId);
        return view(tripId);
    }

    private void deliver(UUID tripId, UUID riderId, String key, Map<String, ?> detail, boolean held, String holdReason) {
        jdbc.update("UPDATE fleet_schema.trip SET state = 'DELIVERED', finished_at = now(), version = version + 1, updated_at = now() "
            + "WHERE id = ?", tripId);
        event(tripId, "DELIVERED", riderId, key, detail);
        pay.finalizePay(tripId, Ending.DELIVERED, held, holdReason);
        bridge.publish(tripId);
    }

    /**
     * Ends the order's fleet trip: the customer or chef cancelled the order, or ops cancelled the trip (the craves_fleet
     * adapter's cancel). Open offers are withdrawn and every open stage is closed, so no rider can accept and the dispatch
     * tick books no courier after this. A rider on the trip gets the PLAN pay for its state: riding to the kitchen, the
     * pickup leg; at the kitchen, the cancellation fee plus the pickup leg; after pickup, full pay plus the return. Not
     * held: the rider did nothing wrong. Empty for an unknown trip; else the trip's state after this.
     */
    @Transactional
    public Optional<String> cancel(UUID tripId, String reason) {
        List<String> states = jdbc.queryForList("SELECT state FROM fleet_schema.trip WHERE id = ? FOR UPDATE", String.class, tripId);
        if (states.isEmpty()) {
            return Optional.empty();
        }
        String state = states.get(0);
        jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'WITHDRAWN', decided_at = now() WHERE trip_id = ? AND state = 'ACTIVE'", tripId);
        jdbc.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', outcome = 'CANCELLED', closed_at = now() WHERE trip_id = ? "
            + "AND state = 'OPEN'", tripId);
        if (!"SEARCHING".equals(state) && !List.of("ASSIGNED", "AT_PICKUP", "PICKED_UP", "AT_DROP").contains(state)) {
            return Optional.of(state);
        }
        jdbc.update("UPDATE fleet_schema.trip SET state = 'CANCELLED', cancel_reason = ?, finished_at = now(), version = version + 1, "
            + "updated_at = now() WHERE id = ?", reason, tripId);
        event(tripId, "CANCELLED", null, null, Map.of("stateBefore", state));
        if ("SEARCHING".equals(state)) {
            return Optional.of("CANCELLED"); // no rider took it: nothing to pay
        }
        pay.finalizePay(tripId, switch (state) {
            case "ASSIGNED" -> Ending.CANCELLED_TO_KITCHEN;
            case "AT_PICKUP" -> Ending.CANCELLED_AT_KITCHEN;
            default -> Ending.FAILED_AFTER_PICKUP;
        }, false, null);
        return Optional.of("CANCELLED");
    }

    /** The rider-v1 Trip; payLines are the final ones once the trip ended with pay, else the locked offer lines. */
    public Trip view(UUID tripId) {
        return jdbc.queryForObject(VIEW + "WHERE t.id = ?", (row, n) -> trip(row), tripId);
    }

    private Trip trip(ResultSet row) throws SQLException {
        String finalLines = row.getString("final_lines");
        List<PayLine> lines = read(finalLines != null ? finalLines : row.getString("offer_lines"));
        Long finalPay = (Long) row.getObject("final_pay_paise");
        Long lockedPay = (Long) row.getObject("pay_paise");
        Integer freeMinutes = (Integer) row.getObject("wait_free_minutes");
        Integer unreachableMinutes = (Integer) row.getObject("unreachable_wait_minutes");
        return new Trip(row.getObject("id", UUID.class).toString(), row.getInt("version"), FleetTripModels.step(row.getString("state")),
            row.getString("order_code"), row.getInt("items_count"), finalPay != null ? finalPay : lockedPay != null ? lockedPay : 0,
            new Kitchen(row.getString("kitchen_area"), row.getString("kitchen_address"), row.getString("kitchen_landmark"),
                row.getDouble("kitchen_lat"), row.getDouble("kitchen_lng"), row.getString("kitchen_name"), row.getString("chef_phone")),
            new Customer(row.getString("drop_area"), row.getString("drop_address"), row.getString("drop_landmark"), row.getDouble("drop_lat"),
                row.getDouble("drop_lng"), row.getString("customer_first_name"), row.getString("customer_phone")),
            instant(row.getTimestamp("arrived_kitchen_at")), freeMinutes == null ? 0 : freeMinutes * 60L,
            unreachableMinutes == null ? 0 : unreachableMinutes * 60L, (Long) row.getObject("wait_per_minute_paise"),
            row.getString("cancel_reason"), lines, row.getBoolean("sealed"), instant(row.getTimestamp("chef_ready_at")));
    }

    /** The rider's own trip, row-locked for the step. A trip that ended or went to another courier is 409 TRIP_NOT_ACTIVE. */
    private Locked lock(UUID tripId, Rider rider) {
        return jdbc.query("SELECT state, chef_sub_order_id, kitchen_lat, kitchen_lng FROM fleet_schema.trip WHERE id = ? AND rider_id = ? "
                + "AND provider = 'CRAVES_FLEET' FOR UPDATE", (row, n) -> new Locked(row.getString("state"),
                row.getObject("chef_sub_order_id", UUID.class), row.getDouble("kitchen_lat"), row.getDouble("kitchen_lng")), tripId, rider.id())
            .stream().findFirst().orElseThrow(() -> FleetApiException.notFound("TRIP_NOT_FOUND", "This trip is not yours."));
    }

    private static void requireState(Locked trip, String needed, String message) {
        if (List.of("DELIVERED", "FAILED", "CANCELLED").contains(trip.state())) {
            throw FleetApiException.conflict("TRIP_NOT_ACTIVE", "This trip has ended. Check Home for your next order.");
        }
        if (!needed.equals(trip.state())) {
            throw FleetApiException.conflict("STEP_CONFLICT", message);
        }
    }

    /** The first answer for a repeated Idempotency-Key: a stored wrong-OTP refusal is thrown again. */
    private void replay(UUID tripId, String key) {
        Optional<Map<String, Object>> earlier = replayed(tripId, key);
        if (earlier.isPresent() && "OTP_INVALID".equals(earlier.get().get("kind"))) {
            throw otpInvalid(((Number) earlier.get().get("attempts_left")).intValue());
        }
        if (earlier.isPresent() && "OTP_LOCKED".equals(earlier.get().get("kind"))) {
            throw otpLockedError();
        }
    }

    private Optional<Map<String, Object>> replayed(UUID tripId, String key) {
        return key == null ? Optional.empty() : jdbc.queryForList("SELECT kind, (detail ->> 'attemptsLeft')::int AS attempts_left "
            + "FROM fleet_schema.trip_event WHERE trip_id = ? AND idempotency_key = ?", tripId, key).stream().findFirst();
    }

    private boolean otpLocked(UUID tripId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.trip_event WHERE trip_id = ? "
            + "AND kind = 'OTP_LOCKED')", Boolean.class, tripId));
    }

    private void requireUnreachableWaitOver(UUID tripId) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT t.arrived_drop_at + make_interval(mins => rc.unreachable_wait_minutes) <= now() "
            + "FROM fleet_schema.trip t JOIN fleet_schema.rate_card rc ON rc.version = t.rate_card_version WHERE t.id = ?", Boolean.class,
            tripId))) {
            throw FleetApiException.unprocessable("WAIT_NOT_OVER", "Wait at the door until the timer ends, then try again.");
        }
    }

    /** Metres from the kitchen by the rider's latest fix, if it is real (not mock) and under 2 minutes old; else null. */
    private Double metresFromKitchen(UUID riderId, Locked trip) {
        return jdbc.query("SELECT lat, lng FROM fleet_schema.rider_position_latest WHERE rider_id = ? AND NOT mock "
                + "AND received_at > now() - INTERVAL '2 minutes'", (row, n) -> RoadDistanceClient.straightLineMetres(row.getDouble("lat"),
                row.getDouble("lng"), trip.kitchenLat(), trip.kitchenLng()), riderId)
            .stream().findFirst().orElse(null);
    }

    private static byte[] photoBytes(MultipartFile photo) {
        if (photo == null || photo.isEmpty() || photo.getSize() > MAX_PHOTO_BYTES
            || !List.of("image/jpeg", "image/png").contains(photo.getContentType())) {
            throw FleetApiException.unprocessable("PHOTO_REQUIRED", "Take a clear photo of the order at the door, under 10 MB.");
        }
        try (java.io.InputStream input = photo.getInputStream()) {
            byte[] bytes = input.readNBytes(MAX_PHOTO_BYTES + 1);
            if (bytes.length != photo.getSize() || !FleetStorage.signatureMatches(photo.getContentType(), bytes)) {
                throw FleetApiException.unprocessable("PHOTO_REQUIRED", "Take a clear photo of the order at the door, under 10 MB.");
            }
            return bytes;
        } catch (java.io.IOException exception) {
            throw FleetApiException.unprocessable("PHOTO_REQUIRED", "Take a clear photo of the order at the door, under 10 MB.");
        }
    }

    static FleetApiException otpInvalid(int attemptsLeft) {
        return new FleetApiException(422, "OTP_INVALID", "That OTP didn't match. Ask the customer to read it again.", attemptsLeft);
    }

    static FleetApiException otpLockedError() {
        return new FleetApiException(423, "OTP_LOCKED", "Too many wrong OTPs. Use the photo option; ops will check it.");
    }

    private Trip notWon(UUID offerId, Rider rider) {
        Map<String, Object> offer = jdbc.queryForList("SELECT o.state, o.trip_id, t.rider_id AS trip_rider, t.state AS trip_state, "
            + ORDER_REFUNDED + " AS order_cancelled FROM fleet_schema.trip_offer o JOIN fleet_schema.trip t ON t.id = o.trip_id "
            + "WHERE o.id = ? AND o.rider_id = ?", offerId, rider.id())
            .stream().findFirst().orElseThrow(FleetTripService::offerNotFound);
        if ("ACCEPTED".equals(offer.get("state"))) {
            return view((UUID) offer.get("trip_id")); // the winner's repeat: the first answer again
        }
        if (Boolean.TRUE.equals(offer.get("order_cancelled"))
            || ("CANCELLED".equals(offer.get("trip_state")) && offer.get("trip_rider") == null)) {
            throw FleetApiException.conflict("ORDER_CANCELLED", "This order was cancelled. Watch for the next one.");
        }
        if ("LOST".equals(offer.get("state")) || (offer.get("trip_rider") != null && !rider.id().equals(offer.get("trip_rider")))) {
            throw taken();
        }
        throw expired();
    }

    void event(UUID tripId, String kind, UUID riderId, String idempotencyKey, Map<String, ?> detail) {
        try {
            jdbc.update("INSERT INTO fleet_schema.trip_event (id, trip_id, kind, actor_type, actor_id, idempotency_key, trip_version, detail) "
                + "SELECT ?, id, ?, ?, ?, ?, version, CAST(? AS jsonb) FROM fleet_schema.trip WHERE id = ? "
                + "ON CONFLICT (trip_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING", UUID.randomUUID(), kind,
                riderId == null ? "SYSTEM" : "RIDER", riderId, idempotencyKey, json.writeValueAsString(detail), tripId);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Trip event could not be stored", exception);
        }
    }

    Rider rider(UUID identityId) {
        return jdbc.query("SELECT id, status FROM fleet_schema.rider WHERE identity_id = ?",
            (row, n) -> new Rider(row.getObject("id", UUID.class), row.getString("status")), identityId).stream().findFirst()
            .orElseThrow(() -> new FleetApiException(403, "NOT_A_RIDER", "This account is not a Craves rider."));
    }

    private Rider activeRider(UUID identityId) {
        Rider rider = rider(identityId);
        if (!"ACTIVE".equals(rider.status())) {
            throw new FleetApiException(403, "RIDER_NOT_ACTIVE", "Your account can't take orders right now. Check Home for why.");
        }
        return rider;
    }

    List<PayLine> read(String lines) {
        if (lines == null) {
            return List.of();
        }
        try {
            return json.readValue(lines, LINES);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored pay lines are unreadable", exception);
        }
    }

    static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    static FleetApiException taken() {
        return FleetApiException.conflict("OFFER_TAKEN", "Another rider took this order.");
    }

    static FleetApiException expired() {
        return new FleetApiException(410, "OFFER_EXPIRED", "This offer has ended. Watch for the next one.");
    }

    static FleetApiException offerNotFound() {
        return FleetApiException.notFound("OFFER_NOT_FOUND", "This offer is not available.");
    }

    record Rider(UUID id, String status) {
    }

    private record Locked(String state, UUID chefSubOrderId, double kitchenLat, double kitchenLng) {
    }
}
