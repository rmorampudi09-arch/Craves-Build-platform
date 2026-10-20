package in.craves.integration.fleet.dispatch;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.command.FleetStage;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ShipmentItem;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.pay.FleetPay;
import in.craves.integration.fleet.pay.FleetPay.PayQuote;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.fleet.trip.FleetTripModels.Offer;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The fleet stage of the dispatch chain (PLAN "Dispatch flow", F8a, F9): fleet for at most dispatch_policy's fleet stage
 * seconds, then Borzo, then Pidge, then the ops queue. Each stage is a trip_stage row with a deadline. The fleet stage is
 * closed in the database (a conditional update on that row, the same row an accept closes) before routing moves on, so a
 * late accept is refused and two couriers are never booked. With dispatch_policy off (or no policy in force) nothing here
 * runs for a new order; shadow computes and logs only; live offers to the 3 nearest eligible riders at once.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetDispatcher implements FleetStage {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetDispatcher.class);
    static final int OFFERS_AT_ONCE = 3;
    static final int SEEN_WITHIN_SECONDS = 45;
    static final int BORZO_WINDOW_SECONDS = 120; // DeliveryProviderRouter's Borzo selection window
    // The delivery command looks again at least this often while riders decide (and at the stage deadline).
    static final Duration CHECK_EVERY = Duration.ofSeconds(10);
    static final Set<String> TAKEN = Set.of("ASSIGNED", "AT_PICKUP", "PICKED_UP", "AT_DROP", "DELIVERED", "FAILED", "CANCELLED");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final FleetPolicyStore policies;
    private final FleetTestMode testMode;
    private final RoadDistanceClient roads;
    private final RiderPushClient push;
    private final ObjectMapper json;

    public FleetDispatcher(JdbcTemplate jdbc, PlatformTransactionManager transactions, FleetPolicyStore policies, FleetTestMode testMode,
                           RoadDistanceClient roads, RiderPushClient push, ObjectMapper json) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactions);
        this.policies = policies;
        this.testMode = testMode;
        this.roads = roads;
        this.push = push;
        this.json = json;
    }

    @Override
    public Optional<UUID> run(DeliveryCommandMessage command, Supplier<OptionalLong> courierQuotePaise, boolean borzoNext) {
        Optional<TripState> existing = trip(command.chefSubOrderId());
        if (existing.isPresent()) {
            // Whatever the policy says now: an open fleet stage is always closed before anyone else is booked.
            return carryOn(existing.get(), borzoNext);
        }
        DispatchPolicy policy = policies.currentDispatchPolicy().orElse(null);
        if (policy == null || "off".equals(policy.mode())) {
            return Optional.empty();
        }
        Plan plan = plan(command, policy, courierQuotePaise);
        if (plan == null) {
            return Optional.empty();
        }
        if (!"live".equals(policy.mode())) {
            LOGGER.info("FLEET_SHADOW chefSubOrderId={} offers={} payPaise={} dropDistanceM={} courierQuotePaise={} outcome={}",
                command.chefSubOrderId(), plan.offers().size(), plan.offers().stream().map(offer -> offer.quote().totalPaise()).toList(),
                plan.dropDistanceM(), plan.courierQuotePaise(), plan.offers().isEmpty() ? plan.outcome() : "OFFER");
            return Optional.empty();
        }
        Opened opened = transaction.execute(status -> open(command, policy, plan, borzoNext));
        if (opened == null) {
            // Another worker opened the stage for this order a moment ago; follow it.
            return carryOn(trip(command.chefSubOrderId()).orElseThrow(), borzoNext);
        }
        if (opened.offers().isEmpty()) {
            return Optional.empty();
        }
        opened.offers().forEach(offer -> Thread.ofVirtual().name("fleet-offer-push").start(() -> ring(offer)));
        throw riderDeciding(opened.deadline());
    }

    @Override
    public void chefReady(UUID chefSubOrderId, Instant readyAt) {
        jdbc.update("INSERT INTO fleet_schema.chef_ready (chef_sub_order_id, ready_at) VALUES (?, ?) ON CONFLICT (chef_sub_order_id) DO NOTHING",
            chefSubOrderId, Timestamp.from(readyAt));
        jdbc.update("UPDATE fleet_schema.trip SET chef_ready_at = ? WHERE chef_sub_order_id = ? AND chef_ready_at IS NULL",
            Timestamp.from(readyAt), chefSubOrderId);
    }

    /** A known order: the rider's job once accepted, nothing once the fleet stage is closed, else wait or close the stage. */
    private Optional<UUID> carryOn(TripState trip, boolean borzoNext) {
        if ("CRAVES_FLEET".equals(trip.provider()) && TAKEN.contains(trip.state())) {
            return Optional.of(deliveryJob(trip.chefSubOrderId()));
        }
        if (!"CRAVES_FLEET".equals(trip.provider())) {
            return Optional.empty();
        }
        Instant deadline = jdbc.query("SELECT deadline_at FROM fleet_schema.trip_stage WHERE trip_id = ? AND provider = 'CRAVES_FLEET' "
            + "AND state = 'OPEN'", (row, n) -> row.getTimestamp("deadline_at").toInstant(), trip.id()).stream().findFirst().orElse(null);
        boolean anyOfferOpen = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.trip_offer WHERE trip_id = ? "
            + "AND state = 'ACTIVE' AND expires_at > now())", Boolean.class, trip.id()));
        if (deadline != null && Instant.now().isBefore(deadline) && anyOfferOpen) {
            throw riderDeciding(deadline);
        }
        String outcome = deadline == null || !Instant.now().isBefore(deadline) ? "NO_ACCEPT" : "ALL_DECLINED_OR_EXPIRED";
        if (Boolean.TRUE.equals(transaction.execute(status -> closeFleetStage(trip.id(), outcome, borzoNext, pidgeSeconds())))) {
            return Optional.empty();
        }
        TripState now = trip(trip.chefSubOrderId()).orElseThrow();
        return TAKEN.contains(now.state()) && "CRAVES_FLEET".equals(now.provider()) ? Optional.of(deliveryJob(now.chefSubOrderId()))
            : Optional.empty();
    }

    /**
     * Closes the open fleet stage, if it is still open, and starts the next one: Borzo's window when Borzo comes next, else
     * Pidge. False when the stage was already closed, by an accept or another worker. Runs in the caller's transaction.
     */
    boolean closeFleetStage(UUID tripId, String outcome, boolean borzoNext, int pidgeStageSeconds) {
        if (jdbc.update("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', outcome = ?, closed_at = now() WHERE trip_id = ? "
            + "AND provider = 'CRAVES_FLEET' AND state = 'OPEN'", outcome, tripId) != 1) {
            return false;
        }
        jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'WITHDRAWN', decided_at = now() WHERE trip_id = ? AND state = 'ACTIVE'", tripId);
        String next = borzoNext ? "BORZO" : "PIDGE";
        if (jdbc.update("UPDATE fleet_schema.trip SET provider = ?, version = version + 1, updated_at = now() WHERE id = ? "
            + "AND state = 'SEARCHING' AND provider = 'CRAVES_FLEET'", next, tripId) != 1) {
            throw new IllegalStateException("Trip " + tripId + " changed while its fleet stage closed");
        }
        openStage(tripId, next, borzoNext ? BORZO_WINDOW_SECONDS : pidgeStageSeconds);
        return true;
    }

    /** The next stage of the chain; the previous one must already be closed (one OPEN stage per trip). */
    void openStage(UUID tripId, String provider, int seconds) {
        jdbc.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, deadline_at) SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, "
            + "now() + make_interval(secs => ?) FROM fleet_schema.trip_stage WHERE trip_id = ?", UUID.randomUUID(), tripId, provider,
            seconds, tripId);
    }

    /** Riders who could take an order at this kitchen now (the policy radius, else 5 km); test mode applies. */
    int ridersNear(double lat, double lng) {
        int radius = policies.currentDispatchPolicy().map(DispatchPolicy::radiusM).orElse(5000);
        return (int) nearbyRiders(lat, lng, radius).stream().filter(rider -> testMode.riderAllowed(rider.riderId())).count();
    }

    int pidgeSeconds() {
        return policies.currentDispatchPolicy().map(DispatchPolicy::pidgeStageSeconds).orElse(600);
    }

    private Plan plan(DeliveryCommandMessage command, DispatchPolicy policy, Supplier<OptionalLong> courierQuotePaise) {
        QuoteRequest request = command.deliveryRequest();
        if (request == null || !located(request.pickup()) || !located(request.dropoff())) {
            LOGGER.info("FLEET_SKIPPED chefSubOrderId={} reason=NO_COORDINATES", command.chefSubOrderId());
            return null;
        }
        // Chef identity from the finance quote order-service issued at checkout; the delivery request does not carry it.
        UUID chefId = jdbc.queryForList("SELECT chef_identity_id FROM payment_schema.finance_issued_snapshot WHERE chef_order_id = ?",
            UUID.class, command.chefSubOrderId()).stream().findFirst().orElse(null);
        if (chefId == null) {
            LOGGER.info("FLEET_SKIPPED chefSubOrderId={} reason=CHEF_UNKNOWN", command.chefSubOrderId());
            return null;
        }
        if (!testMode.kitchenAllowed(chefId)) {
            return null;
        }
        RateCard card = policies.currentRateCard().orElse(null);
        if (card == null) {
            LOGGER.info("FLEET_SKIPPED chefSubOrderId={} reason=NO_RATE_CARD", command.chefSubOrderId());
            return null;
        }
        double kitchenLat = request.pickup().latitude().doubleValue();
        double kitchenLng = request.pickup().longitude().doubleValue();
        int dropM = roads.meters(kitchenLat, kitchenLng, request.dropoff().latitude().doubleValue(), request.dropoff().longitude().doubleValue());
        List<Candidate> riders = nearbyRiders(kitchenLat, kitchenLng, policy.radiusM());
        OptionalLong courier = riders.isEmpty() ? OptionalLong.empty() : courierQuotePaise.get();
        List<Planned> offers = new ArrayList<>();
        String outcome = "NO_RIDERS";
        for (Candidate rider : riders) {
            if (offers.size() == OFFERS_AT_ONCE) {
                break;
            }
            if (!testMode.riderAllowed(rider.riderId())) {
                continue;
            }
            PayQuote quote = FleetPay.quote(card, dropM, FleetPay.pickupDistanceM(rider.straightLineM(), policy.pickupDetourPercent()));
            if (!FleetPay.costGuardPasses(quote.totalPaise(), policy.perOrderOverheadPaise(), courier, policy.costGuardPremiumPaise())) {
                outcome = "COST_GUARD";
                continue;
            }
            offers.add(new Planned(UUID.randomUUID(), rider.riderId(), quote));
        }
        return new Plan(chefId, card.version(), dropM, List.copyOf(offers), outcome, courier.isPresent() ? courier.getAsLong() : null);
    }

    /**
     * Eligible riders, nearest first: ACTIVE, on an open shift, idle (no active trip or open offer), a real (non-mock) fix
     * received in the last 45 s, inside the policy radius. Declines play no part.
     */
    private List<Candidate> nearbyRiders(double lat, double lng, int radiusM) {
        double dLat = radiusM / 111_320.0;
        double dLng = radiusM / (111_320.0 * Math.max(0.01, Math.cos(Math.toRadians(lat))));
        return jdbc.query("""
                SELECT r.id, p.lat, p.lng FROM fleet_schema.rider r
                JOIN fleet_schema.rider_shift s ON s.rider_id = r.id AND s.ended_at IS NULL
                JOIN fleet_schema.rider_position_latest p ON p.rider_id = r.id
                WHERE r.status = 'ACTIVE' AND NOT p.mock AND p.received_at > now() - make_interval(secs => ?)
                  AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?
                  AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip t WHERE t.rider_id = r.id
                                  AND t.state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'))
                  AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip_offer o WHERE o.rider_id = r.id AND o.state = 'ACTIVE' AND o.expires_at > now())""",
                (row, n) -> new Candidate(row.getObject("id", UUID.class),
                    RoadDistanceClient.straightLineMetres(lat, lng, row.getDouble("lat"), row.getDouble("lng"))),
                SEEN_WITHIN_SECONDS, lat - dLat, lat + dLat, lng - dLng, lng + dLng)
            .stream().filter(rider -> rider.straightLineM() <= radiusM).sorted(Comparator.comparingDouble(Candidate::straightLineM)).toList();
    }

    /** The trip, its fleet stage and the offers, in one transaction. Null when another worker already opened this order. */
    private Opened open(DeliveryCommandMessage command, DispatchPolicy policy, Plan plan, boolean borzoNext) {
        jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'EXPIRED', decided_at = now() WHERE state = 'ACTIVE' AND expires_at <= now()");
        QuoteRequest request = command.deliveryRequest();
        Stop kitchen = request.pickup();
        Stop drop = request.dropoff();
        UUID tripId = UUID.randomUUID();
        int created = jdbc.update("""
            INSERT INTO fleet_schema.trip (id, chef_sub_order_id, order_id, chef_id, order_code, items_count, kitchen_name, kitchen_area,
              kitchen_address, kitchen_landmark, kitchen_lat, kitchen_lng, chef_phone, customer_first_name, customer_phone, drop_area,
              drop_address, drop_landmark, drop_lat, drop_lng, drop_distance_m, rate_card_version, chef_ready_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    (SELECT ready_at FROM fleet_schema.chef_ready WHERE chef_sub_order_id = ?))
            ON CONFLICT (chef_sub_order_id) DO NOTHING""",
            tripId, command.chefSubOrderId(), command.orderId(), plan.chefId(), orderCode(command.chefSubOrderId()), itemsCount(request),
            text(kitchen.contactName(), 160, "Kitchen"), text(kitchen.area() != null ? kitchen.area() : command.area(), 160, ""),
            text(kitchen.address(), 500, ""), text(kitchen.landmark(), 200, null), kitchen.latitude().doubleValue(),
            kitchen.longitude().doubleValue(), text(kitchen.contactPhone(), 16, ""), firstName(drop.contactName()),
            text(drop.contactPhone(), 16, ""), text(drop.area(), 160, ""), text(drop.address(), 500, ""), text(drop.landmark(), 200, null),
            drop.latitude().doubleValue(), drop.longitude().doubleValue(), plan.dropDistanceM(), plan.rateCardVersion(),
            command.chefSubOrderId());
        if (created != 1) {
            return null;
        }
        Instant deadline = jdbc.queryForObject("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, deadline_at) "
            + "VALUES (?, ?, 1, 'CRAVES_FLEET', now() + make_interval(secs => ?)) RETURNING deadline_at",
            (row, n) -> row.getTimestamp("deadline_at").toInstant(), UUID.randomUUID(), tripId, policy.fleetStageSeconds());
        List<RingingOffer> offers = new ArrayList<>();
        for (Planned planned : plan.offers()) {
            // One ACTIVE offer per rider: a rider another order reached first is skipped, not doubled up.
            offers.addAll(jdbc.query("""
                    INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, pay_paise, pay_lines, rate_card_version, pickup_distance_m,
                      drop_distance_m, expires_at)
                    VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, now() + make_interval(secs => ?))
                    ON CONFLICT (rider_id) WHERE state = 'ACTIVE' DO NOTHING
                    RETURNING id, expires_at, GREATEST(0, ceil(EXTRACT(EPOCH FROM expires_at - now())))::bigint AS seconds_left""",
                    (row, n) -> offer(planned, tripId, row.getTimestamp("expires_at").toInstant(), row.getLong("seconds_left"),
                        text(kitchen.area() != null ? kitchen.area() : command.area(), 160, ""), text(drop.area(), 160, "")),
                    planned.offerId(), tripId, planned.riderId(), planned.quote().totalPaise(), write(planned.quote().lines()),
                    planned.quote().rateCardVersion(), planned.quote().pickupDistanceM(), planned.quote().dropDistanceM(),
                    policy.offerSeconds()));
        }
        if (offers.isEmpty()) {
            closeFleetStage(tripId, plan.offers().isEmpty() ? plan.outcome() : "RIDERS_BUSY", borzoNext, policy.pidgeStageSeconds());
            return new Opened(List.of(), deadline);
        }
        LOGGER.info("FLEET_OFFERED chefSubOrderId={} trip={} offers={} deadline={}", command.chefSubOrderId(), tripId, offers.size(), deadline);
        return new Opened(List.copyOf(offers), deadline);
    }

    /** Rings one offer on the rider's bound phone; the app also gets it on its next /locations call. */
    private void ring(RingingOffer offer) {
        try {
            String token = jdbc.queryForList("SELECT fcm_token FROM fleet_schema.rider_device WHERE rider_id = ? AND state = 'BOUND' "
                + "AND fcm_token IS NOT NULL", String.class, offer.riderId()).stream().findFirst().orElse(null);
            if (token == null) {
                return;
            }
            long secondsLeft = Math.max(0, Duration.between(Instant.now(), offer.offer().expiresAt()).getSeconds());
            String result = push.offer(token, UUID.fromString(offer.offer().offerId()), json.writeValueAsString(offer.offer()),
                "New order: " + FleetRiderService.rupees(offer.offer().payPaise()),
                offer.offer().kitchenArea() + " to " + offer.offer().customerLocality(), (int) Math.min(600, secondsLeft));
            LOGGER.info("FLEET_OFFER_PUSH offer={} rider={} result={}", offer.offer().offerId(), offer.riderId(), result);
        } catch (RuntimeException | JsonProcessingException exception) {
            LOGGER.warn("FLEET_OFFER_PUSH offer={} failed: {}", offer.offer().offerId(), exception.getClass().getSimpleName());
        }
    }

    private RingingOffer offer(Planned planned, UUID tripId, Instant expiresAt, long secondsLeft, String kitchenArea, String customerLocality) {
        PayQuote quote = planned.quote();
        return new RingingOffer(planned.riderId(), new Offer(planned.offerId().toString(), tripId.toString(), expiresAt, secondsLeft,
            quote.totalPaise(), quote.pickupDistanceM(), quote.dropDistanceM(), kitchenArea, customerLocality,
            estMinutes(quote.pickupDistanceM(), quote.dropDistanceM()), quote.lines()));
    }

    /** About 20 km/h on a two-wheeler plus 5 minutes at the kitchen and the door: the rider's own time, not the customer's promise. */
    static int estMinutes(int pickupDistanceM, int dropDistanceM) {
        return (int) Math.ceil((pickupDistanceM + dropDistanceM) / 333.0) + 5;
    }

    /** "#" + the first 8 characters of the chef sub-order id without dashes, uppercase: the number the chef and customer see. */
    public static String orderCode(UUID chefSubOrderId) {
        return "#" + chefSubOrderId.toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
    }

    private UUID deliveryJob(UUID chefSubOrderId) {
        return jdbc.queryForList("SELECT id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?", UUID.class, chefSubOrderId)
            .stream().findFirst().orElseThrow(() -> new IllegalStateException("A rider took the order but its delivery job is missing"));
    }

    private Optional<TripState> trip(UUID chefSubOrderId) {
        return jdbc.query("SELECT id, chef_sub_order_id, state, provider FROM fleet_schema.trip WHERE chef_sub_order_id = ?",
            (row, n) -> new TripState(row.getObject("id", UUID.class), row.getObject("chef_sub_order_id", UUID.class),
                row.getString("state"), row.getString("provider")), chefSubOrderId).stream().findFirst();
    }

    private static DeliveryProviderTemporarilyUnavailableException riderDeciding(Instant deadline) {
        Instant check = Instant.now().plus(CHECK_EVERY);
        return new DeliveryProviderTemporarilyUnavailableException("Craves riders are deciding on the order",
            deadline.isBefore(check) ? deadline : check);
    }

    private static boolean located(Stop stop) {
        return stop != null && stop.latitude() != null && stop.longitude() != null;
    }

    private static int itemsCount(QuoteRequest request) {
        return request.items() == null ? 0 : request.items().stream().mapToInt(ShipmentItem::quantity).map(quantity -> Math.max(0, quantity)).sum();
    }

    private static String firstName(String name) {
        String trimmed = name == null ? "" : name.trim();
        return text(trimmed.isEmpty() ? "Customer" : trimmed.split("\\s+")[0], 80, "Customer");
    }

    private static String text(String value, int max, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Offer pay lines could not be stored", exception);
        }
    }

    record TripState(UUID id, UUID chefSubOrderId, String state, String provider) {
    }

    private record Candidate(UUID riderId, double straightLineM) {
    }

    private record Planned(UUID offerId, UUID riderId, PayQuote quote) {
    }

    private record Plan(UUID chefId, String rateCardVersion, int dropDistanceM, List<Planned> offers, String outcome, Long courierQuotePaise) {
    }

    private record RingingOffer(UUID riderId, Offer offer) {
    }

    private record Opened(List<RingingOffer> offers, Instant deadline) {
    }
}
