package in.craves.integration.fleet.trip;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
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
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    private final JdbcTemplate jdbc;
    private final FleetTripPay pay;
    private final FleetStatusBridge bridge;
    private final ObjectMapper json;

    public FleetTripService(JdbcTemplate jdbc, FleetTripPay pay, FleetStatusBridge bridge, ObjectMapper json) {
        this.jdbc = jdbc;
        this.pay = pay;
        this.bridge = bridge;
        this.json = json;
    }

    /** 200 with the trip for the winner; 409 OFFER_TAKEN for a lost race; 410 OFFER_EXPIRED; a repeat by the winner gets the trip. */
    @Transactional
    public Trip accept(UUID identityId, UUID offerId, String idempotencyKey) {
        Rider rider = activeRider(identityId);
        // The one decisive statement: it closes the order's open fleet stage, only for a live offer of this rider. A second
        // accept waits on the same stage row, then finds it closed. The stage's deadline makes a late accept fail here too.
        List<UUID> won = jdbc.queryForList("""
            UPDATE fleet_schema.trip_stage s SET state = 'CLOSED', outcome = 'ACCEPTED', closed_at = now()
            FROM fleet_schema.trip_offer o
            WHERE o.id = ? AND o.rider_id = ? AND o.state = 'ACTIVE' AND o.expires_at > now()
              AND s.trip_id = o.trip_id AND s.provider = 'CRAVES_FLEET' AND s.state = 'OPEN' AND s.deadline_at > now()
            RETURNING s.trip_id""", UUID.class, offerId, rider.id());
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

    /**
     * Ops or the order cancelled a rider's trip before delivery (the craves_fleet adapter's cancel): the PLAN pay rule
     * for the trip's state. Riding to the kitchen: pickup-leg pay; at the kitchen: cancellation fee plus pickup leg;
     * after pickup: full pay plus the return. Not held: the rider did nothing wrong.
     */
    @Transactional
    public Optional<String> cancel(UUID tripId, String reason) {
        List<String> states = jdbc.queryForList("SELECT state FROM fleet_schema.trip WHERE id = ? AND provider = 'CRAVES_FLEET' FOR UPDATE",
            String.class, tripId);
        if (states.isEmpty()) {
            return Optional.empty();
        }
        String state = states.get(0);
        if (!List.of("ASSIGNED", "AT_PICKUP", "PICKED_UP", "AT_DROP").contains(state)) {
            return Optional.of(state);
        }
        jdbc.update("UPDATE fleet_schema.trip SET state = 'CANCELLED', cancel_reason = ?, finished_at = now(), version = version + 1, "
            + "updated_at = now() WHERE id = ?", reason, tripId);
        event(tripId, "CANCELLED", null, null, Map.of("stateBefore", state));
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
        return new Trip(row.getObject("id", UUID.class).toString(), row.getInt("version"), step(row.getString("state")),
            row.getString("order_code"), row.getInt("items_count"), finalPay != null ? finalPay : lockedPay != null ? lockedPay : 0,
            new Kitchen(row.getString("kitchen_area"), row.getString("kitchen_address"), row.getString("kitchen_landmark"),
                row.getDouble("kitchen_lat"), row.getDouble("kitchen_lng"), row.getString("kitchen_name"), row.getString("chef_phone")),
            new Customer(row.getString("drop_area"), row.getString("drop_address"), row.getString("drop_landmark"), row.getDouble("drop_lat"),
                row.getDouble("drop_lng"), row.getString("customer_first_name"), row.getString("customer_phone")),
            instant(row.getTimestamp("arrived_kitchen_at")), freeMinutes == null ? 0 : freeMinutes * 60L,
            unreachableMinutes == null ? 0 : unreachableMinutes * 60L, (Long) row.getObject("wait_per_minute_paise"),
            row.getString("cancel_reason"), lines, row.getBoolean("sealed"), instant(row.getTimestamp("chef_ready_at")));
    }

    static String step(String state) {
        return switch (state) {
            case "ASSIGNED" -> "TO_KITCHEN";
            case "AT_PICKUP" -> "AT_KITCHEN";
            default -> state; // PICKED_UP, AT_DROP, DELIVERED, FAILED, CANCELLED
        };
    }

    private Trip notWon(UUID offerId, Rider rider) {
        Map<String, Object> offer = jdbc.queryForList("SELECT o.state, o.trip_id, t.rider_id AS trip_rider FROM fleet_schema.trip_offer o "
            + "JOIN fleet_schema.trip t ON t.id = o.trip_id WHERE o.id = ? AND o.rider_id = ?", offerId, rider.id())
            .stream().findFirst().orElseThrow(FleetTripService::offerNotFound);
        if ("ACCEPTED".equals(offer.get("state"))) {
            return view((UUID) offer.get("trip_id")); // the winner's repeat: the first answer again
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
}
