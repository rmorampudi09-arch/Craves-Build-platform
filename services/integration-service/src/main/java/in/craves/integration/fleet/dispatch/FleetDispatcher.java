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
import in.craves.integration.fleet.engine.FleetEngineClient;
import in.craves.integration.fleet.engine.FleetEngineFeed;
import in.craves.integration.fleet.engine.FleetEngineWire;
import in.craves.integration.fleet.money.FleetEarnings;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.pay.FleetPay;
import in.craves.integration.fleet.pay.FleetPay.PayQuote;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.fleet.rider.FleetShiftService;
import in.craves.integration.fleet.trip.FleetTripModels;
import in.craves.integration.fleet.trip.FleetTripModels.Offer;
import in.craves.integration.fleet.trip.FleetTripModels.OfferReason;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
 * runs for a new order; shadow computes and logs only; live offers it as the policy's rules say (Phase 4,
 * docs/riders/DISPATCH.md): offersAtOnce riders at a time (3 before Phase 4), up to offerRounds rounds while the stage
 * lasts, nearest first or, with a fair band, fair turns. Each offer records why its rider got it (trip_offer.reason).
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetDispatcher implements FleetStage {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetDispatcher.class);
    // At most one "no rate card" line per dispatch tick (5 s), however many orders arrive.
    private static final long TICK_MS = 5_000;
    /** Fair turns (Phase 4): earnings per online hour (FleetEarnings.perOnlineHourPaise) compare in ₹10 steps. */
    static final long FAIR_STEP_PAISE = 1_000;
    /** Riders ranked by road with CRAVES_FLEET_ROAD_RANKING_ENABLED (P3-06): one road-distance call each per order. */
    static final int ROAD_RANKED = 5;
    static final int SEEN_WITHIN_SECONDS = 45;
    static final int FIX_WITHIN_SECONDS = 180;
    /** Heading home (Phase 5): the drop must leave the rider at least this much nearer home (straight lines, metres). */
    static final int HOME_PROGRESS_M = 500;
    /** Heading home: the trip may add to the ride home at most this, or a quarter of the way home if that is more. */
    static final int HOME_DETOUR_M = 2_000;
    /**
     * A phone dispatch can reach, on the shift row s and the position row p (BACKEND.md "Dispatch chain"): the shift's last
     * /locations call within 45 s, with or without new fixes, a real (non-mock) fix under 3 minutes old for the distance,
     * and a phone that can ring (can_ring: notifications on and the offers channel high; unknown counts as yes).
     */
    static final String HEARD_FROM = "s.last_seen_at > now() - make_interval(secs => " + SEEN_WITHIN_SECONDS + ") AND NOT p.mock "
        + "AND p.recorded_at > now() - make_interval(secs => " + FIX_WITHIN_SECONDS + ") AND s.can_ring IS NOT FALSE";
    /**
     * The rider r may get an offer this moment: ACTIVE, on a working shift, not on a break, not on a trip. Checked as each
     * offer is inserted, and on the fleet engine's riders before they are planned (its state can be seconds behind).
     */
    private static final String FREE_NOW = "r.status = 'ACTIVE' AND " + FleetShiftService.ON_SHIFT.formatted("r.id")
        + " AND NOT EXISTS (SELECT 1 FROM fleet_schema.rider_shift h WHERE h.rider_id = r.id AND h.ended_at IS NULL AND "
        + FleetShiftService.BREAK_ENDS.formatted("h.id") + " IS NOT NULL)"
        + " AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip t WHERE t.rider_id = r.id AND t.state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'))";
    static final int BORZO_WINDOW_SECONDS = 120; // DeliveryProviderRouter's Borzo selection window
    // The delivery command looks again at least this often while riders decide (and at the stage deadline); more often
    // when a policy runs rounds, so the next rider hears of the order soon after a decline.
    static final Duration CHECK_EVERY = Duration.ofSeconds(10);
    static final Duration ROUND_CHECK_EVERY = Duration.ofSeconds(5);
    static final Set<String> TAKEN = Set.of("ASSIGNED", "AT_PICKUP", "PICKED_UP", "AT_DROP", "DELIVERED", "FAILED", "CANCELLED");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final FleetPolicyStore policies;
    private final FleetTestMode testMode;
    private final RoadDistanceClient roads;
    private final RiderPushClient push;
    private final ObjectMapper json;
    private final boolean roadRanking;
    private final boolean riderChoices;
    private final AtomicLong noRateCardLoggedAt = new AtomicLong();
    /** Phase 5, the fleet engine (craves.fleet.engine.*): the feed while shadow or live, the client while live; else null. */
    private FleetEngineFeed engineFeed;
    private FleetEngineClient engineClient;
    private boolean engineJoint;

    public FleetDispatcher(JdbcTemplate jdbc, PlatformTransactionManager transactions, FleetPolicyStore policies, FleetTestMode testMode,
                           RoadDistanceClient roads, RiderPushClient push, ObjectMapper json) {
        this(jdbc, transactions, policies, testMode, roads, push, json, false);
    }

    public FleetDispatcher(JdbcTemplate jdbc, PlatformTransactionManager transactions, FleetPolicyStore policies, FleetTestMode testMode,
                           RoadDistanceClient roads, RiderPushClient push, ObjectMapper json, boolean roadRanking) {
        this(jdbc, transactions, policies, testMode, roads, push, json, roadRanking, false);
    }

    /** riderChoices (Phase 4, CRAVES_FLEET_RIDER_CHOICES_ENABLED): honour each rider's farthest pickup and drop. */
    @Autowired
    public FleetDispatcher(JdbcTemplate jdbc, PlatformTransactionManager transactions, FleetPolicyStore policies, FleetTestMode testMode,
                           RoadDistanceClient roads, RiderPushClient push, ObjectMapper json,
                           @Value("${craves.fleet.road-ranking-enabled:false}") boolean roadRanking,
                           @Value("${craves.fleet.rider-choices-enabled:false}") boolean riderChoices) {
        this.jdbc = jdbc;
        this.transaction = new TransactionTemplate(transactions);
        this.policies = policies;
        this.testMode = testMode;
        this.roads = roads;
        this.push = push;
        this.json = json;
        this.roadRanking = roadRanking;
        this.riderChoices = riderChoices;
    }

    @Autowired(required = false)
    public void setEngine(FleetEngineFeed feed, FleetEngineClient client) {
        this.engineFeed = feed.on() ? feed : null;
        this.engineClient = client.live() ? client : null;
        this.engineJoint = client.joint();
    }

    @Override
    public Optional<UUID> run(DeliveryCommandMessage command, Supplier<OptionalLong> courierQuotePaise, boolean borzoNext) {
        Optional<TripState> existing = trip(command.chefSubOrderId());
        if (existing.isPresent()) {
            // Whatever the policy says now: an open fleet stage is always closed before anyone else is booked.
            return carryOn(existing.get(), borzoNext, courierQuotePaise);
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
            return carryOn(trip(command.chefSubOrderId()).orElseThrow(), borzoNext, courierQuotePaise);
        }
        if (opened.offers().isEmpty()) {
            if (opened.waiting()) {
                throw riderDeciding(opened.deadline(), policy);
            }
            return Optional.empty();
        }
        refreshEngine(opened.offers());
        opened.offers().forEach(offer -> Thread.ofVirtual().name("fleet-offer-push").start(() -> ring(offer)));
        throw riderDeciding(opened.deadline(), policy);
    }

    @Override
    public void chefReady(UUID chefSubOrderId, Instant readyAt) {
        jdbc.update("INSERT INTO fleet_schema.chef_ready (chef_sub_order_id, ready_at) VALUES (?, ?) ON CONFLICT (chef_sub_order_id) DO NOTHING",
            chefSubOrderId, Timestamp.from(readyAt));
        jdbc.update("UPDATE fleet_schema.trip SET chef_ready_at = ? WHERE chef_sub_order_id = ? AND chef_ready_at IS NULL",
            Timestamp.from(readyAt), chefSubOrderId);
    }

    /** Only a trip still before pickup needs it: the watchdog watches no other (FleetDispatchJobs.HANDS_BACK). */
    @Override
    public void chefHandedOver(UUID chefSubOrderId, Instant handedOverAt) {
        jdbc.update("UPDATE fleet_schema.trip SET chef_handed_over_at = ? WHERE chef_sub_order_id = ? AND provider = 'CRAVES_FLEET' "
            + "AND state IN ('ASSIGNED', 'AT_PICKUP') AND chef_handed_over_at IS NULL", Timestamp.from(handedOverAt), chefSubOrderId);
    }

    /**
     * A known order: the rider's job once accepted, nothing once the fleet stage is closed, else wait, send the next round
     * (a policy with rounds, while the stage lasts) or close the stage.
     */
    private Optional<UUID> carryOn(TripState trip, boolean borzoNext, Supplier<OptionalLong> courierQuotePaise) {
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
        DispatchPolicy policy = policies.currentDispatchPolicy().orElse(null);
        if (deadline != null && Instant.now().isBefore(deadline) && anyOfferOpen) {
            throw riderDeciding(deadline, policy);
        }
        if (deadline != null && Instant.now().isBefore(deadline) && policy != null && "live".equals(policy.mode()) && policy.offerRounds() > 1) {
            List<RingingOffer> round = nextRound(trip.id(), policy, courierQuotePaise);
            if (round == null || !round.isEmpty()) {
                // Sent now, or another worker sent this round a moment ago: either way riders are deciding.
                (round == null ? List.<RingingOffer>of() : round).forEach(offer -> Thread.ofVirtual().name("fleet-offer-push")
                    .start(() -> ring(offer)));
                throw riderDeciding(deadline, policy);
            }
        }
        String outcome = deadline == null || !Instant.now().isBefore(deadline) ? "NO_ACCEPT" : "ALL_DECLINED_OR_EXPIRED";
        if (Boolean.TRUE.equals(transaction.execute(status -> closeUnlessDeciding(trip.id(), outcome, borzoNext, policy)))) {
            return Optional.empty();
        }
        TripState now = trip(trip.chefSubOrderId()).orElseThrow();
        return TAKEN.contains(now.state()) && "CRAVES_FLEET".equals(now.provider()) ? Optional.of(deliveryJob(now.chefSubOrderId()))
            : Optional.empty();
    }

    /**
     * closeFleetStage, unless riders are deciding on a round another worker sent after this one looked: the stage row is
     * locked first, as nextRound locks it to send a round, so a round is never withdrawn as it rings. Before the deadline, an
     * open offer means riders are deciding (thrown, as run() does). Runs in the caller's transaction.
     */
    boolean closeUnlessDeciding(UUID tripId, String outcome, boolean borzoNext, DispatchPolicy policy) {
        List<Instant> open = jdbc.query("SELECT deadline_at FROM fleet_schema.trip_stage WHERE trip_id = ? AND provider = 'CRAVES_FLEET' "
            + "AND state = 'OPEN' AND deadline_at > now() FOR UPDATE", (row, n) -> row.getTimestamp("deadline_at").toInstant(), tripId);
        // A statement of its own, so it sees the offers a worker committed while this one waited for the lock.
        if (!open.isEmpty() && Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.trip_offer WHERE trip_id = ? "
            + "AND state = 'ACTIVE' AND expires_at > now())", Boolean.class, tripId))) {
            throw riderDeciding(open.get(0), policy);
        }
        return closeFleetStage(tripId, outcome, borzoNext, pidgeSeconds());
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
        return (int) nearbyRiders(lat, lng, radius, -1, 100, null, null).stream().filter(rider -> testMode.riderAllowed(rider.riderId()))
            .count();
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
        // Live pays riders, so only a published rate card in force will do (behind RATE_CARD_REQUIRED); shadow may price a draft.
        RateCard card = ("live".equals(policy.mode()) ? policies.rateCardInForce(null) : policies.currentRateCard()).orElse(null);
        if (card == null) {
            long now = System.currentTimeMillis();
            long last = noRateCardLoggedAt.get();
            if (now - last >= TICK_MS && noRateCardLoggedAt.compareAndSet(last, now)) {
                LOGGER.warn("FLEET_SKIPPED chefSubOrderId={} reason=NO_RATE_CARD_IN_FORCE mode={}", command.chefSubOrderId(), policy.mode());
            }
            return null;
        }
        double kitchenLat = request.pickup().latitude().doubleValue();
        double kitchenLng = request.pickup().longitude().doubleValue();
        double dropLat = request.dropoff().latitude().doubleValue();
        double dropLng = request.dropoff().longitude().doubleValue();
        int dropM = roads.meters(kitchenLat, kitchenLng, dropLat, dropLng);
        List<Candidate> riders = riders(command.chefSubOrderId(), kitchenLat, kitchenLng, dropLat, dropLng, dropM, policy, Set.of(), 1);
        OptionalLong courier = riders.isEmpty() ? OptionalLong.empty() : courierQuotePaise.get();
        Choice choice = choose(riders, policy, card, dropM, courier, 1);
        return new Plan(chefId, card.version(), dropM, choice.offers(), choice.outcome(), courier.isPresent() ? courier.getAsLong() : null);
    }

    /**
     * The riders who may hear of an order, in the order they would; exclude: riders already offered it. With the fleet
     * engine live (Phase 5, docs/riders/SCALE.md), this policy live and road ranking off, the engine ranks them by the same
     * rules and holds them for this order for a few seconds; test mode is still checked here. When it doesn't answer in
     * time, or finds nobody, dispatch ranks riders itself, as it does with the engine off, and in shadow the engine is told
     * how, to compare.
     */
    private List<Candidate> riders(UUID chefSubOrderId, double kitchenLat, double kitchenLng, double dropLat, double dropLng, int dropM,
                                   DispatchPolicy policy, Set<UUID> exclude, int round) {
        boolean engineLive = engineClient != null && !roadRanking && "live".equals(policy.mode());
        Optional<List<FleetEngineWire.Candidate>> answer = engineLive ? engineClient.rank(chefSubOrderId, kitchenLat, kitchenLng, dropLat,
            dropLng, dropM, enginePolicy(policy), exclude, round) : Optional.empty();
        if (answer.isPresent() && !answer.get().isEmpty()) {
            List<Candidate> engineRiders = answer.get().stream().filter(rider -> testMode.riderAllowed(rider.riderId()))
                .map(FleetDispatcher::candidate).toList();
            List<Candidate> free = stillFree(engineRiders);
            if (free.size() < engineRiders.size()) {
                LOGGER.info("FLEET_ENGINE_STALE chefSubOrderId={} round={} engineRiders={} stillFree={}", chefSubOrderId, round,
                    engineRiders.size(), free.size());
            }
            if (!free.isEmpty()) {
                return free;
            }
        }
        List<Candidate> riders = ranked(nearbyRiders(kitchenLat, kitchenLng, policy.radiusM(), dropM, policy.pickupDetourPercent(), dropLat,
            dropLng).stream().filter(rider -> !exclude.contains(rider.riderId())).toList(), policy, kitchenLat, kitchenLng, chefSubOrderId);
        if (answer.isPresent() && !riders.isEmpty()) {
            LOGGER.warn("FLEET_ENGINE_FOUND_NOBODY chefSubOrderId={} round={} javaRiders={}", chefSubOrderId, round, riders.size());
        }
        if (engineFeed != null && !engineLive && !roadRanking) {
            engineFeed.shadow(chefSubOrderId, kitchenLat, kitchenLng, dropLat, dropLng, dropM, enginePolicy(policy), exclude,
                riders.stream().map(FleetDispatcher::engineCandidate).toList(), round);
        }
        return riders;
    }

    /**
     * The engine's riders whom Postgres still lets hear of an order, in the engine's order. Its state can be seconds behind
     * (a trip just accepted, a break, a suspension); Postgres has the last word, so a stale rider is passed over here rather
     * than planned and then refused at the insert, which would leave the order without offers this round. One query.
     */
    private List<Candidate> stillFree(List<Candidate> riders) {
        if (riders.isEmpty()) {
            return riders;
        }
        Set<UUID> free = Set.copyOf(jdbc.queryForList("SELECT r.id FROM fleet_schema.rider r WHERE r.id = ANY(CAST(? AS uuid[])) AND "
                + FREE_NOW + " AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip_offer o WHERE o.rider_id = r.id AND o.state = 'ACTIVE' "
                + "AND o.expires_at > now())", UUID.class,
            riders.stream().map(rider -> rider.riderId().toString()).collect(Collectors.joining(",", "{", "}"))));
        return riders.stream().filter(rider -> free.contains(rider.riderId())).toList();
    }

    /** The policy as the engine applies it. */
    private FleetEngineWire.Policy enginePolicy(DispatchPolicy policy) {
        return new FleetEngineWire.Policy(policy.radiusM(), policy.pickupDetourPercent(), policy.offersAtOnce(), policy.fairBandM(),
            policy.offerSeconds(), riderChoices, engineJoint);
    }

    /** An engine rider as dispatch's own; one in the fair band carries its pay per hour as Standing(perHour, 1 hour) and its time free. */
    static Candidate candidate(FleetEngineWire.Candidate rider) {
        Standing standing = rider.inBand() ? new Standing(rider.perHourPaise(), 3_600, Instant.ofEpochMilli(rider.freeSinceMs())) : null;
        return new Candidate(rider.riderId(), rider.straightLineM(), rider.lat(), rider.lng(), rider.straightLineM(), standing,
            rider.homeNearerM() == 0 ? null : rider.homeNearerM());
    }

    static FleetEngineWire.Candidate engineCandidate(Candidate rider) {
        Standing standing = rider.standing();
        return new FleetEngineWire.Candidate(rider.riderId(), rider.straightLineM(), rider.lat(), rider.lng(), standing != null,
            standing == null ? 0 : standing.perHourPaise(), standing == null ? 0 : standing.freeSince().toEpochMilli(),
            rider.homeNearerM() == null ? 0 : rider.homeNearerM(), false);
    }

    /** The engine reads riders who were just offered an order again, so no other order is ranked as if they were free. */
    private void refreshEngine(List<RingingOffer> offers) {
        if (engineFeed != null && !offers.isEmpty()) {
            engineFeed.refresh(offers.stream().map(RingingOffer::riderId).toList());
        }
    }

    /**
     * The riders test mode allows, in the order they hear of the order: nearest first (by road with road ranking), then,
     * with a fair band, fair turns within it.
     */
    List<Candidate> ranked(List<Candidate> nearby, DispatchPolicy policy, double kitchenLat, double kitchenLng, UUID chefSubOrderId) {
        List<Candidate> riders = nearby.stream().filter(rider -> testMode.riderAllowed(rider.riderId())).toList();
        if (roadRanking) {
            riders = byRoad(riders, kitchenLat, kitchenLng, chefSubOrderId);
        }
        return policy.fairBandM() > 0 ? fair(riders, policy.fairBandM()) : riders;
    }

    /**
     * Fair turns (Phase 4, FairFoody's rule in its simplest form): among the riders within bandM metres of the nearest, the
     * one who has earned the least per online hour today goes first, in ₹10 steps, then the one free the longest; the rest
     * follow, nearest first. Declines and ratings play no part (Telangana Act s.13(3)).
     */
    List<Candidate> fair(List<Candidate> riders, int bandM) {
        if (riders.isEmpty()) {
            return riders;
        }
        double limit = riders.get(0).rankM() + bandM;
        List<Candidate> band = riders.stream().filter(rider -> rider.rankM() <= limit).toList();
        Map<UUID, Standing> standings = standings(band.stream().map(Candidate::riderId).toList());
        List<Candidate> ordered = new ArrayList<>(band.stream().map(rider -> rider.with(standings.get(rider.riderId())))
            .sorted(Comparator.comparingLong((Candidate rider) -> rider.standing().perHourPaise() / FAIR_STEP_PAISE)
                .thenComparing(rider -> rider.standing().freeSince()))
            .toList());
        riders.stream().filter(rider -> rider.rankM() > limit).forEach(ordered::add);
        return ordered;
    }

    /**
     * Each rider's day so far (IST): pay credited today (as Home shows it), available minutes online today (shifts less
     * breaks), and when they last became free to take an order: the latest of their shift's start, their last trip's end
     * and the end of a break on this shift (a break is not time spent waiting for an order).
     */
    private Map<UUID, Standing> standings(List<UUID> riderIds) {
        FleetEarnings.Window today = FleetEarnings.window("today", Instant.now());
        Timestamp from = Timestamp.from(today.from());
        Timestamp to = Timestamp.from(today.to());
        Map<UUID, Standing> standings = new HashMap<>();
        // shortcut: 3 queries per rider in the band, fine for the tens a band holds; one batched query past ~50 riders a band.
        for (UUID riderId : riderIds) {
            long earned = jdbc.queryForObject(FleetEarnings.RANGE_TOTAL_SQL, (row, n) -> row.getLong("paise"), riderId, from, to);
            long online = jdbc.queryForObject(FleetEarnings.ONLINE_SECONDS_SQL, Long.class, from, to, riderId);
            Timestamp freeSince = jdbc.queryForObject("""
                SELECT GREATEST((SELECT MAX(s.started_at) FROM fleet_schema.rider_shift s WHERE s.rider_id = ? AND s.ended_at IS NULL),
                                (SELECT MAX(t.finished_at) FROM fleet_schema.trip t WHERE t.rider_id = ?),
                                (SELECT MAX(b.ends_at) FROM fleet_schema.rider_break b JOIN fleet_schema.rider_shift s ON s.id = b.shift_id
                                 WHERE s.rider_id = ? AND s.ended_at IS NULL AND b.ends_at <= now()))""",
                Timestamp.class, riderId, riderId, riderId);
            standings.put(riderId, new Standing(earned, online, freeSince == null ? Instant.EPOCH : freeSince.toInstant()));
        }
        return standings;
    }

    /** The first offersAtOnce riders, in order, whose locked pay passes the cost guard; each with why it went to them. */
    private Choice choose(List<Candidate> riders, DispatchPolicy policy, RateCard card, int dropM, OptionalLong courier, int round) {
        List<Planned> offers = new ArrayList<>();
        String outcome = "NO_RIDERS";
        int band = (int) riders.stream().filter(rider -> rider.standing() != null).count();
        for (int place = 1; place <= riders.size() && offers.size() < policy.offersAtOnce(); place++) {
            Candidate rider = riders.get(place - 1);
            PayQuote quote = FleetPay.quote(card, dropM, FleetPay.pickupDistanceM(rider.straightLineM(), policy.pickupDetourPercent()));
            if (!FleetPay.costGuardPasses(quote.totalPaise(), policy.perOrderOverheadPaise(), courier, policy.costGuardPremiumPaise())) {
                outcome = "COST_GUARD";
                continue;
            }
            Standing standing = rider.standing();
            OfferReason reason = standing == null
                ? new OfferReason("NEAREST", place, riders.size(), policy.offersAtOnce(), round, null, null, null, null, rider.homeNearerM())
                : new OfferReason("FAIR", place, riders.size(), policy.offersAtOnce(), round, policy.fairBandM(), band,
                    standing.perHourPaise(), (int) Math.max(0, Duration.between(standing.freeSince(), Instant.now()).toMinutes()),
                    rider.homeNearerM());
            offers.add(new Planned(UUID.randomUUID(), rider.riderId(), quote, reason));
        }
        // The cost guard can leave out riders: each reason counts only the riders asked together.
        int together = offers.size();
        return new Choice(offers.stream().map(offer -> new Planned(offer.offerId(), offer.riderId(), offer.quote(),
            offer.reason().together(together))).toList(), outcome);
    }

    /**
     * The next round while the fleet stage lasts (Phase 4): the next riders in today's order who haven't been offered this
     * trip. Ranked outside the transaction (the cost guard may ask Borzo for a quote); then the stage row is locked and the
     * round checked, so two workers never send the same one. Empty when nobody is left; null when another worker just sent it
     * or the riders chosen became busy meanwhile (look again shortly, while the stage lasts).
     */
    private List<RingingOffer> nextRound(UUID tripId, DispatchPolicy policy, Supplier<OptionalLong> courierQuotePaise) {
        Map<String, Object> trip = jdbc.queryForMap("""
            SELECT t.chef_sub_order_id, t.kitchen_lat, t.kitchen_lng, t.drop_lat, t.drop_lng, t.drop_distance_m, t.rate_card_version,
                   (SELECT COALESCE(MAX(o.round), 0) FROM fleet_schema.trip_offer o WHERE o.trip_id = t.id) AS rounds
            FROM fleet_schema.trip t WHERE t.id = ?""", tripId);
        int rounds = ((Number) trip.get("rounds")).intValue();
        if (rounds >= policy.offerRounds()) {
            return List.of();
        }
        Set<UUID> offered = Set.copyOf(jdbc.queryForList("SELECT rider_id FROM fleet_schema.trip_offer WHERE trip_id = ?", UUID.class, tripId));
        double lat = ((Number) trip.get("kitchen_lat")).doubleValue();
        double lng = ((Number) trip.get("kitchen_lng")).doubleValue();
        int dropM = trip.get("drop_distance_m") == null ? 0 : ((Number) trip.get("drop_distance_m")).intValue();
        List<Candidate> riders = riders((UUID) trip.get("chef_sub_order_id"), lat, lng, ((Number) trip.get("drop_lat")).doubleValue(),
            ((Number) trip.get("drop_lng")).doubleValue(), dropM, policy, offered, rounds + 1);
        RateCard card = policies.rateCard((String) trip.get("rate_card_version")).filter(own -> !own.draft())
            .or(() -> policies.rateCardInForce(null)).orElse(null);
        if (riders.isEmpty() || card == null) {
            return List.of();
        }
        // shortcut: a fresh courier quote each round sent (and on a rare raced attempt); keep the first on the trip if couriers limit quotes.
        Choice choice = choose(riders, policy, card, dropM, courierQuotePaise.get(), rounds + 1);
        if (choice.offers().isEmpty()) {
            return List.of();
        }
        List<RingingOffer> newRound = transaction.execute(status -> {
            // A round goes out only with its riders' full time to decide before the stage ends; else Borzo comes next now.
            boolean fits = jdbc.query("SELECT deadline_at >= now() + make_interval(secs => ?) AS fits FROM fleet_schema.trip_stage "
                + "WHERE trip_id = ? AND provider = 'CRAVES_FLEET' AND state = 'OPEN' FOR UPDATE", (row, n) -> row.getBoolean("fits"),
                policy.offerSeconds(), tripId).stream().findFirst().orElse(false);
            if (!fits) {
                return List.<RingingOffer>of();
            }
            jdbc.update("UPDATE fleet_schema.trip_offer SET state = 'EXPIRED', decided_at = now() WHERE state = 'ACTIVE' AND expires_at <= now()");
            boolean busy = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM fleet_schema.trip_offer WHERE trip_id = ? "
                + "AND state = 'ACTIVE')", Boolean.class, tripId));
            Integer sent = jdbc.queryForObject("SELECT COALESCE(MAX(round), 0) FROM fleet_schema.trip_offer WHERE trip_id = ?",
                Integer.class, tripId);
            if (busy || sent == null || sent != rounds) {
                return null;
            }
            int inserted = insertOffers(tripId, policy, choice.offers(), rounds + 1);
            if (inserted == 0) {
                return null;
            }
            LOGGER.info("FLEET_OFFERED trip={} round={} offers={}", tripId, rounds + 1, inserted);
            return ringing(tripId);
        });
        if (newRound != null) {
            refreshEngine(newRound);
        }
        return newRound;
    }

    /**
     * P3-06, behind CRAVES_FLEET_ROAD_RANKING_ENABLED (off): the ROAD_RANKED allowed riders nearest by straight line, ordered
     * by road metres to the kitchen, one call each, all at once (RoadDistanceClient never fails: without an answer it is
     * straight line × 1.3, which keeps the straight-line order). The rest follow in their order, outside any fair band (their
     * road distance is unknown). More than the riders at once are ranked, or the same three would get the offer. Pay still
     * uses the straight line, as the terms say.
     */
    List<Candidate> byRoad(List<Candidate> riders, double kitchenLat, double kitchenLng, UUID chefSubOrderId) {
        List<Candidate> allowed = riders.stream().filter(rider -> testMode.riderAllowed(rider.riderId())).toList();
        List<Candidate> nearest = allowed.subList(0, Math.min(ROAD_RANKED, allowed.size()));
        Map<UUID, Integer> metres = new ConcurrentHashMap<>();
        try (ExecutorService calls = Executors.newVirtualThreadPerTaskExecutor()) {
            nearest.forEach(rider -> calls.execute(() -> metres.put(rider.riderId(), roads.meters(rider.lat(), rider.lng(), kitchenLat, kitchenLng))));
        }
        List<Candidate> ranked = new ArrayList<>(nearest.stream()
            .map(rider -> new Candidate(rider.riderId(), rider.straightLineM(), rider.lat(), rider.lng(),
                metres.getOrDefault(rider.riderId(), Integer.MAX_VALUE), null, rider.homeNearerM()))
            .sorted(Comparator.comparingDouble(Candidate::rankM)).toList());
        LOGGER.info("FLEET_ROAD_RANKED chefSubOrderId={} straightLineM={} roadM={}", chefSubOrderId,
            nearest.stream().map(rider -> Math.round(rider.straightLineM())).toList(), ranked.stream().map(rider -> metres.get(rider.riderId())).toList());
        allowed.subList(nearest.size(), allowed.size()).forEach(rider -> ranked.add(new Candidate(rider.riderId(), rider.straightLineM(),
            rider.lat(), rider.lng(), Double.POSITIVE_INFINITY, null, rider.homeNearerM())));
        return ranked;
    }

    /**
     * Heading home (Phase 5, docs/riders/DISPATCH.md §4), by straight lines: how many metres nearer home the drop leaves the
     * rider, or null when the order doesn't take them home. It must leave them at least HOME_PROGRESS_M nearer than they are
     * now, and the ride to the kitchen, the drop and on home may add at most HOME_DETOUR_M, or a quarter of the way home if
     * that is more, to riding straight home (Uber's added-distance test; Namma Yatri's 2 km corridor; research R14).
     */
    static Integer homeNearerM(double riderLat, double riderLng, double kitchenLat, double kitchenLng, double dropLat, double dropLng,
                               double homeLat, double homeLng) {
        double riderHome = RoadDistanceClient.straightLineMetres(riderLat, riderLng, homeLat, homeLng);
        double dropHome = RoadDistanceClient.straightLineMetres(dropLat, dropLng, homeLat, homeLng);
        if (dropHome > riderHome - HOME_PROGRESS_M) {
            return null;
        }
        double added = RoadDistanceClient.straightLineMetres(riderLat, riderLng, kitchenLat, kitchenLng)
            + RoadDistanceClient.straightLineMetres(kitchenLat, kitchenLng, dropLat, dropLng) + dropHome - riderHome;
        return added > Math.max(HOME_DETOUR_M, riderHome / 4) ? null : (int) Math.round(riderHome - dropHome);
    }

    /**
     * Eligible riders, nearest first: ACTIVE, on an open shift and not on a break (Phase 4), idle (no active trip or open
     * offer), heard from (HEARD_FROM: a call in the last 45 s, a real fix under 3 minutes old, a phone that can ring),
     * inside the policy radius. With rider choices on and an order's drop (dropM >= 0), also within each rider's farthest
     * drop and pickup (the pickup as the offer shows it, at this detour), and, for a rider heading home (Phase 5), only an
     * order that takes them home (homeNearerM). Declines play no part.
     */
    private List<Candidate> nearbyRiders(double lat, double lng, int radiusM, int dropM, int detourPercent, Double dropLat, Double dropLng) {
        double dLat = radiusM / 111_320.0;
        double dLng = radiusM / (111_320.0 * Math.max(0.01, Math.cos(Math.toRadians(lat))));
        boolean choices = riderChoices && dropM >= 0;
        return jdbc.query("""
                SELECT r.id, p.lat, p.lng, r.max_pickup_m, r.home_lat, r.home_lng, s.heading_home_until > now() AS heading_home
                FROM fleet_schema.rider r
                JOIN fleet_schema.rider_shift s ON s.rider_id = r.id AND s.ended_at IS NULL AND s.credential_revoked_at IS NULL
                  AND s.credential_expires_at > now() AND\s""" + FleetShiftService.BREAK_ENDS.formatted("s.id") + """
                 IS NULL
                JOIN fleet_schema.rider_position_latest p ON p.rider_id = r.id
                WHERE r.status = 'ACTIVE' AND\s""" + HEARD_FROM + """

                  AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?
                  AND (NOT ? OR r.max_drop_m IS NULL OR r.max_drop_m >= ?)
                  AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip t WHERE t.rider_id = r.id
                                  AND t.state IN ('ASSIGNED', 'AT_PICKUP', 'PICKED_UP', 'AT_DROP'))
                  AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip_offer o WHERE o.rider_id = r.id AND o.state = 'ACTIVE' AND o.expires_at > now())""",
                (row, n) -> {
                    double metres = RoadDistanceClient.straightLineMetres(lat, lng, row.getDouble("lat"), row.getDouble("lng"));
                    Integer maxPickupM = choices ? (Integer) row.getObject("max_pickup_m") : null;
                    // A rider who chose a nearer pickup is left out (null), as if out of range.
                    if (maxPickupM != null && FleetPay.pickupDistanceM(metres, detourPercent) > maxPickupM) {
                        return null;
                    }
                    Integer homeNearerM = null;
                    if (choices && row.getBoolean("heading_home") && row.getObject("home_lat") != null && dropLat != null) {
                        homeNearerM = homeNearerM(row.getDouble("lat"), row.getDouble("lng"), lat, lng, dropLat, dropLng,
                            row.getDouble("home_lat"), row.getDouble("home_lng"));
                        if (homeNearerM == null) {
                            return null;
                        }
                    }
                    return new Candidate(row.getObject("id", UUID.class), metres, row.getDouble("lat"), row.getDouble("lng"), metres, null,
                        homeNearerM);
                },
                lat - dLat, lat + dLat, lng - dLng, lng + dLng, choices, Math.max(dropM, 0))
            .stream().filter(rider -> rider != null && rider.straightLineM() <= radiusM).sorted(Comparator.comparingDouble(Candidate::straightLineM))
            .toList();
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
            ON CONFLICT (chef_sub_order_id) WHERE replaced_at IS NULL DO NOTHING""",
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
        int offered = insertOffers(tripId, policy, plan.offers(), 1);
        List<RingingOffer> offers = offered == 0 ? List.of() : ringing(tripId);
        if (offers.isEmpty()) {
            if (!plan.offers().isEmpty() && policy.offerRounds() > 1) {
                // The riders chosen took another order a moment ago: with rounds, the next look offers it to the riders free then.
                return new Opened(List.of(), deadline, true);
            }
            closeFleetStage(tripId, plan.offers().isEmpty() ? plan.outcome() : "RIDERS_BUSY", borzoNext, policy.pidgeStageSeconds());
            return new Opened(List.of(), deadline, false);
        }
        LOGGER.info("FLEET_OFFERED chefSubOrderId={} trip={} offers={} deadline={}", command.chefSubOrderId(), tripId, offers.size(), deadline);
        return new Opened(List.copyOf(offers), deadline, false);
    }

    /**
     * Rings one offer on the rider's bound phone; the app also gets it on its next /locations call. The push's outcome is
     * stored on the offer (pushed_at, push_result: NO_TOKEN, SENT, notification-service's code, ERROR) for the receipts
     * queries in PILOT-HEALTH.md.
     */
    private void ring(RingingOffer offer) {
        String result = "ERROR";
        try {
            String token = jdbc.queryForList("SELECT fcm_token FROM fleet_schema.rider_device WHERE rider_id = ? AND state = 'BOUND' "
                + "AND fcm_token IS NOT NULL", String.class, offer.riderId()).stream().findFirst().orElse(null);
            if (token == null) {
                result = "NO_TOKEN";
                return;
            }
            long secondsLeft = Math.max(0, Duration.between(Instant.now(), offer.offer().expiresAt()).getSeconds());
            result = push.offer(token, UUID.fromString(offer.offer().offerId()), json.writeValueAsString(offer.offer()),
                "New order: " + FleetRiderService.rupees(offer.offer().payPaise()),
                offer.offer().kitchenArea() + " to " + offer.offer().customerLocality(), (int) Math.min(600, secondsLeft));
            LOGGER.info("FLEET_OFFER_PUSH offer={} rider={} result={}", offer.offer().offerId(), offer.riderId(), result);
        } catch (RuntimeException | JsonProcessingException exception) {
            LOGGER.warn("FLEET_OFFER_PUSH offer={} failed: {}", offer.offer().offerId(), exception.getClass().getSimpleName());
        } finally {
            recordPush(offer, result);
        }
    }

    private void recordPush(RingingOffer offer, String result) {
        try {
            String stored = result == null ? "ERROR" : result.length() <= 40 ? result : result.substring(0, 40);
            jdbc.update("UPDATE fleet_schema.trip_offer SET pushed_at = now(), push_result = ? WHERE id = ?", stored,
                UUID.fromString(offer.offer().offerId()));
        } catch (RuntimeException exception) {
            LOGGER.warn("FLEET_OFFER_PUSH offer={} result not stored: {}", offer.offer().offerId(), exception.getClass().getSimpleName());
        }
    }

    /** "#" + the first 8 characters of the chef sub-order id without dashes, uppercase: the number the chef and customer see. */
    public static String orderCode(UUID chefSubOrderId) {
        return "#" + chefSubOrderId.toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
    }

    /** The rider's delivery job. A fleet trip that ended with none was cancelled before any rider took it: nobody is booked. */
    private UUID deliveryJob(UUID chefSubOrderId) {
        return jdbc.queryForList("SELECT id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?", UUID.class, chefSubOrderId)
            .stream().findFirst().orElseThrow(() -> new IllegalStateException(
                "The order's Craves rider trip has no delivery job: it was cancelled before a rider took it, so no courier is booked"));
    }

    /** The order's current trip: one ops gave to another rider (V166) is replaced by the new rider's. */
    private Optional<TripState> trip(UUID chefSubOrderId) {
        return jdbc.query("SELECT id, chef_sub_order_id, state, provider FROM fleet_schema.trip WHERE chef_sub_order_id = ? "
            + "AND replaced_at IS NULL",
            (row, n) -> new TripState(row.getObject("id", UUID.class), row.getObject("chef_sub_order_id", UUID.class),
                row.getString("state"), row.getString("provider")), chefSubOrderId).stream().findFirst();
    }

    /**
     * One ACTIVE offer per rider: a rider another order reached first is skipped, not doubled up, and so is one who went
     * offline, took a trip or started a break while the plan fetched distances and quotes. Returns how many went out.
     */
    private int insertOffers(UUID tripId, DispatchPolicy policy, List<Planned> planned, int round) {
        int offered = 0;
        for (Planned offer : planned) {
            offered += jdbc.update("""
                INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, pay_paise, pay_lines, rate_card_version, pickup_distance_m,
                  drop_distance_m, expires_at, round, reason)
                SELECT ?, ?, r.id, ?, CAST(? AS jsonb), ?, ?, ?, now() + make_interval(secs => ?), ?, CAST(? AS jsonb)
                FROM fleet_schema.rider r
                WHERE r.id = ? AND\s""" + FREE_NOW + """

                ON CONFLICT (rider_id) WHERE state = 'ACTIVE' DO NOTHING""",
                offer.offerId(), tripId, offer.quote().totalPaise(), write(offer.quote().lines()), offer.quote().rateCardVersion(),
                offer.quote().pickupDistanceM(), offer.quote().dropDistanceM(), policy.offerSeconds(), round, write(offer.reason()),
                offer.riderId());
        }
        if (offered > 0 && offered < planned.size()) {
            // Some riders were taken a moment ago: the reasons count only the riders actually asked together.
            jdbc.update("UPDATE fleet_schema.trip_offer SET reason = jsonb_set(reason, '{atOnce}', to_jsonb(CAST(? AS integer))) "
                + "WHERE trip_id = ? AND round = ? AND state = 'ACTIVE' AND reason IS NOT NULL", offered, tripId, round);
        }
        return offered;
    }

    /** The trip's offers riders are deciding on now, ready to ring. */
    private List<RingingOffer> ringing(UUID tripId) {
        return jdbc.query("SELECT " + FleetTripModels.OFFER_COLUMNS
                + " FROM fleet_schema.trip_offer o JOIN fleet_schema.trip t ON t.id = o.trip_id WHERE o.trip_id = ? AND o.state = 'ACTIVE'",
            (row, n) -> new RingingOffer(row.getObject("rider_id", UUID.class), FleetTripModels.offer(row, json)), tripId);
    }

    private static DeliveryProviderTemporarilyUnavailableException riderDeciding(Instant deadline, DispatchPolicy policy) {
        Instant check = Instant.now().plus(policy != null && policy.offerRounds() > 1 ? ROUND_CHECK_EVERY : CHECK_EVERY);
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

    /**
     * rankM: the distance riders are ranked by (road metres with road ranking, else straight line); standing: fair turns only;
     * homeNearerM: for a rider heading home, how much nearer home this order's drop leaves them (Phase 5), else null.
     */
    record Candidate(UUID riderId, double straightLineM, double lat, double lng, double rankM, Standing standing, Integer homeNearerM) {
        Candidate with(Standing day) {
            return new Candidate(riderId, straightLineM, lat, lng, rankM, day, homeNearerM);
        }
    }

    /** A rider's day so far: pay credited today, seconds online today (breaks left out), and when they last became free. */
    record Standing(long earnedPaise, long onlineSeconds, Instant freeSince) {
        long perHourPaise() {
            return FleetEarnings.perOnlineHourPaise(earnedPaise, onlineSeconds);
        }
    }

    private record Planned(UUID offerId, UUID riderId, PayQuote quote, OfferReason reason) {
    }

    private record Choice(List<Planned> offers, String outcome) {
    }

    private record Plan(UUID chefId, String rateCardVersion, int dropDistanceM, List<Planned> offers, String outcome, Long courierQuotePaise) {
    }

    private record RingingOffer(UUID riderId, Offer offer) {
    }

    /** waiting: no offer went out, but the stage stays open for the next round (the riders chosen became busy). */
    private record Opened(List<RingingOffer> offers, Instant deadline, boolean waiting) {
    }
}
