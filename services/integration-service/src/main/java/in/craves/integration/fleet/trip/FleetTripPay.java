package in.craves.integration.fleet.trip;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.pay.FleetPay;
import in.craves.integration.fleet.pay.FleetPay.Ending;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ends a trip's pay: computes the final lines from the locked rate card and distances (PLAN trip-state pay table), stores
 * them on the trip once, and publishes FleetTripPayFinalized. Runs inside the caller's transaction, which holds the trip
 * row; no ledger writes here.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetTripPay {
    private final JdbcTemplate jdbc;
    private final FleetPolicyStore policies;
    private final ObjectMapper json;
    private final ApplicationEventPublisher events;

    public FleetTripPay(JdbcTemplate jdbc, FleetPolicyStore policies, ObjectMapper json, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.policies = policies;
        this.json = json;
        this.events = events;
    }

    /** The final lines; a second call for the same trip changes nothing and publishes nothing. */
    public List<PayLine> finalizePay(UUID tripId, Ending ending, boolean held, String holdReason) {
        // The rain top-up is locked on the accepted offer (rain mode, FleetRain): the rate card can't say whether it rained.
        Map<String, Object> trip = jdbc.queryForMap("SELECT rider_id, rate_card_version, drop_distance_m, pickup_distance_m, "
            + "arrived_kitchen_at, chef_ready_at, picked_up_at, finished_at, (SELECT COALESCE(SUM((l ->> 'amountPaise')::bigint), 0) "
            + "FROM fleet_schema.trip_offer o, jsonb_array_elements(o.pay_lines) l WHERE o.trip_id = t.id AND o.state = 'ACCEPTED' "
            + "AND l ->> 'component' = 'rain') AS rain_paise FROM fleet_schema.trip t WHERE t.id = ?", tripId);
        String version = (String) trip.get("rate_card_version");
        RateCard card = policies.rateCard(version)
            .orElseThrow(() -> new IllegalStateException("Trip " + tripId + " has no locked rate card"));
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Instant handover = instant(trip.get("picked_up_at")) != null ? instant(trip.get("picked_up_at"))
            : instant(trip.get("finished_at")) != null ? instant(trip.get("finished_at")) : now;
        long waited = FleetPay.waitSeconds(instant(trip.get("arrived_kitchen_at")), instant(trip.get("chef_ready_at")), handover);
        List<PayLine> lines = FleetPay.finalLines(card, ending, number(trip.get("drop_distance_m")), number(trip.get("pickup_distance_m")),
            waited, ((Number) trip.get("rain_paise")).longValue());
        int stored = jdbc.update("UPDATE fleet_schema.trip SET final_pay_lines = CAST(? AS jsonb), final_pay_paise = ?, pay_held = ?, "
            + "hold_reason = ?, pay_finalized_at = ? WHERE id = ? AND pay_finalized_at IS NULL", write(lines), FleetPay.total(lines), held,
            held ? holdReason : null, Timestamp.from(now), tripId);
        if (stored == 1) {
            events.publishEvent(new FleetTripPayFinalized(tripId, (UUID) trip.get("rider_id"), version, lines, held, held ? holdReason : null,
                now));
        }
        return lines;
    }

    private String write(List<PayLine> lines) {
        try {
            return json.writeValueAsString(lines);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Pay lines could not be stored", exception);
        }
    }

    private static Instant instant(Object value) {
        return value == null ? null : ((Timestamp) value).toInstant();
    }

    private static int number(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }
}
