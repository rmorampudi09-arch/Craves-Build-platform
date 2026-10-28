package in.craves.integration.fleet.trip;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;

/** Offer and Trip of contracts/openapi/rider-v1.yaml. Optional fields are left out when absent. */
public final class FleetTripModels {
    /**
     * The columns offer(...) reads: a trip_offer o joined to its trip t. expires_in_sec is counted by the database clock,
     * so the app never counts down from the phone's clock.
     */
    public static final String OFFER_COLUMNS = """
        o.id, o.trip_id, o.rider_id, o.expires_at, GREATEST(0, ceil(EXTRACT(EPOCH FROM o.expires_at - now())))::bigint AS expires_in_sec,
        o.pay_paise, o.pay_lines::text AS pay_lines, o.pickup_distance_m, o.drop_distance_m, t.kitchen_area, t.drop_area, t.items_count,
        o.reason::text AS reason""";
    private static final TypeReference<List<PayLine>> LINES = new TypeReference<>() { };

    private FleetTripModels() {
    }

    /**
     * expiresInSec is what the app counts down from, never the phone clock; pay and both distances are locked. reason: why
     * this rider got it (Phase 4), absent on offers from before it and on ops-assigned trips.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Offer(String offerId, String tripId, Instant expiresAt, long expiresInSec, long payPaise, int pickupDistanceM,
                        int dropDistanceM, String kitchenArea, String customerLocality, int estMinutes, Integer itemsCount,
                        List<PayLine> payLines, OfferReason reason) {
    }

    /**
     * Why an offer went to its rider (Phase 4, docs/riders/DISPATCH.md), the rider's own numbers only. rule NEAREST: the
     * place-th nearest of riders free riders; FAIR: within bandM of the nearest (bandRiders riders), the rider's earnings per
     * online hour today and minutes free decided the order. atOnce riders saw it together, in round round.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record OfferReason(String rule, int place, int riders, int atOnce, int round, Integer bandM, Integer bandRiders,
                              Long earnedPerHourPaise, Integer freeMinutes) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Kitchen(String area, String address, String landmark, double lat, double lng, String kitchenName, String chefPhone) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Customer(String area, String address, String landmark, double lat, double lng, String firstName, String phone) {
    }

    /** Never carries the customer's promised time. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Trip(String tripId, int version, String step, String orderCode, int itemsCount, long payPaise, Kitchen kitchen,
                       Customer customer, Instant arrivedKitchenAt, long waitFreeSeconds, long unreachableWaitSeconds,
                       Long waitPayPerMinutePaise, String cancelReason, List<PayLine> payLines, boolean sealed, Instant chefReadyAt) {
    }

    /**
     * The one mapping of an offer for the rider: /locations, the offer push and anything else that shows one read a row
     * with OFFER_COLUMNS. trip_offer.pay_lines holds the locked lines; itemsCount is left out while the count is unknown.
     */
    public static Offer offer(ResultSet row, ObjectMapper json) throws SQLException {
        int pickup = row.getInt("pickup_distance_m");
        int drop = row.getInt("drop_distance_m");
        int items = row.getInt("items_count");
        List<PayLine> lines;
        try {
            lines = json.readValue(row.getString("pay_lines"), LINES);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("trip_offer.pay_lines must be [{component, label, amountPaise}]", exception);
        }
        String reason = row.getString("reason");
        try {
            return new Offer(row.getString("id"), row.getString("trip_id"), row.getTimestamp("expires_at").toInstant(),
                row.getLong("expires_in_sec"), row.getLong("pay_paise"), pickup, drop, row.getString("kitchen_area"),
                row.getString("drop_area"), estMinutes(pickup, drop), items > 0 ? items : null, lines,
                reason == null ? null : json.readValue(reason, OfferReason.class));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("trip_offer.reason must be an OfferReason", exception);
        }
    }

    /** About 20 km/h on a two-wheeler plus 5 minutes at the kitchen and the door: the rider's own time, not the customer's promise. */
    public static int estMinutes(int pickupDistanceM, int dropDistanceM) {
        return (int) Math.ceil((pickupDistanceM + dropDistanceM) / 333.0) + 5;
    }

    /**
     * The rider-v1 TripStep of a trip state. A trip that never reached the rider (SEARCHING, then handed to a courier) reads
     * CANCELLED, so the app always gets one of the seven steps.
     */
    public static String step(String state) {
        return switch (state) {
            case "ASSIGNED" -> "TO_KITCHEN";
            case "AT_PICKUP" -> "AT_KITCHEN";
            case "PICKED_UP", "AT_DROP", "DELIVERED", "FAILED" -> state;
            default -> "CANCELLED";
        };
    }
}
