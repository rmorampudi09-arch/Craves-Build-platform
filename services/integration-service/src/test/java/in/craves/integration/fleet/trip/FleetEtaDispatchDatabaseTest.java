package in.craves.integration.fleet.trip;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryCommandScheduler;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.command.DeliveryServiceBusPublisher;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.DeliveryCodeClient;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import in.craves.integration.fleet.dispatch.FleetDispatcher;
import in.craves.integration.fleet.eta.FleetEta;
import in.craves.integration.fleet.trip.FleetTripModels.Offer;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Phase 5, the travel-time model (docs/riders/DISPATCH.md §2): live, offers show the model's minutes and the chef's arrival
 * time uses them; where the dispatch policy ranks by travel time and the model was judged to rank riders well, the rider
 * soonest at the kitchen gets the order even when another is nearer by straight line, and the offer says so. In shadow or
 * off, nothing changes.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetEtaDispatchDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final UUID chefSubOrderId = UUID.fromString("0bde0101-1111-4111-8111-111111111111");
    FleetPolicyStore policies;
    FleetTripService trips;
    FleetDispatcher dispatcher;
    UUID north;
    UUID south;

    @BeforeEach
    void setUp() {
        policies = new FleetPolicyStore(fleet.db, json);
        RoadDistanceClient roads = mock(RoadDistanceClient.class);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, policies, new FleetTestMode(fleet.db, FleetDatabase.properties(true)),
            roads, mock(RiderPushClient.class), json);
        DeliveryOutboxRepository outbox = new DeliveryOutboxRepository(fleet.db, json);
        DeliveryStatusUpdateService statusUpdates = new DeliveryStatusUpdateService(List.of(), new DeliveryStatusRepository(fleet.db, json),
            outbox, new DeliveryCommandProperties(), json, new BorzoPidgeHandoffRepository(fleet.db));
        FleetStatusBridge bridge = new FleetStatusBridge(fleet.db, outbox, new DeliveryCommandRepository(fleet.db, json), statusUpdates, json);
        DeliveryCodeClient codes = mock(DeliveryCodeClient.class);
        when(codes.verify(any(), anyString())).thenReturn(new DeliveryCodeClient.Result(DeliveryCodeClient.Outcome.VERIFIED, 0));
        trips = new FleetTripService(fleet.db, new FleetTripPay(fleet.db, policies, json, event -> { }), bridge, json, codes,
            mock(FleetStorage.class), fleet.transactions, mock(RiderPushClient.class));
        north = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false); // ~110 m
        south = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT - 0.004, KITCHEN_LNG, 5, false); // ~445 m
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, true);
    }

    /** The fixtures' model, as python -m fleet_eta sql publishes it, judged on ranking as given. */
    void model(String ranking) {
        fleet.db.update("INSERT INTO fleet_schema.eta_model (version, model, metrics) VALUES ('split-1', CAST(? AS jsonb), CAST(? AS jsonb))",
            FleetDispatchFixtures.ETA_MODEL, "{\"heldOutTest\":{\"verdict\":\"better\",\"rankingVerdict\":\"" + ranking + "\"}}");
    }

    /** The rider's open shift started minutes ago: free to take an order since then (fair turns' tie-break). */
    void freeFor(UUID rider, int minutes) {
        fleet.db.update("UPDATE fleet_schema.rider_shift SET started_at = now() - make_interval(mins => ?) WHERE rider_id = ? AND ended_at IS NULL",
            minutes, rider);
    }

    /**
     * Fair turns over the three riders: north (110 m, 9 minutes) free an hour, south (445 m, 2 minutes) just online, and far
     * south (890 m, 2 minutes) free half an hour; nobody has earned today. Returns far south.
     */
    UUID fairTurns(boolean byTravelTime, String etaMode) {
        UUID farSouth = FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT - 0.008, KITCHEN_LNG, 5, false);
        freeFor(north, 60);
        freeFor(farSouth, 30);
        FleetDispatchFixtures.policy(fleet.db, "live", 40, 60, 1, 1, 1000, byTravelTime);
        model("better");
        dispatcher.setEta(new FleetEta(fleet.db, etaMode, "split-1"));
        return farSouth;
    }

    Integer bandRiders() {
        return fleet.db.queryForObject("SELECT (reason ->> 'bandRiders')::int FROM fleet_schema.trip_offer", Integer.class);
    }

    /** The band in minutes the offer's reason states (ranked by travel time), or null. */
    Double bandMinutes() {
        return fleet.db.queryForObject("SELECT (reason ->> 'bandMinutes')::float8 FROM fleet_schema.trip_offer", Double.class);
    }

    Map<String, Object> offer() {
        assertThatThrownBy(() -> dispatcher.run(FleetDispatchFixtures.command(chefSubOrderId), OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        return fleet.db.queryForMap("SELECT id, rider_id, pickup_minutes, drop_minutes, reason ->> 'rule' AS rule FROM fleet_schema.trip_offer");
    }

    Offer shown() {
        return fleet.db.queryForObject("SELECT " + FleetTripModels.OFFER_COLUMNS
            + " FROM fleet_schema.trip_offer o JOIN fleet_schema.trip t ON t.id = o.trip_id", (row, n) -> FleetTripModels.offer(row, json));
    }

    @Test
    void rankedByTravelTimeTheRiderSoonestAtTheKitchenGetsTheOrderAndEveryoneSeesTheModelsMinutes() throws Exception {
        FleetDispatchFixtures.policy(fleet.db, "live", 40, 60, 1, 1, 0, true);
        model("better");
        dispatcher.setEta(new FleetEta(fleet.db, "live", "split-1"));
        Map<String, Object> offer = offer();
        assertThat(offer.get("rider_id")).as("2 minutes away, not the nearer rider 9 minutes away").isEqualTo(south);
        assertThat(offer.get("rule")).as("the offer says soonest, not nearest").isEqualTo("SOONEST");
        assertThat(((Number) offer.get("pickup_minutes")).doubleValue()).isEqualTo(2.0);
        assertThat(((Number) offer.get("drop_minutes")).doubleValue()).isEqualTo(12.0);
        assertThat(shown().estMinutes()).as("2 + 12 minutes riding, and 5 at the kitchen and the door").isEqualTo(19);

        UUID identity = fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, south);
        UUID tripId = UUID.fromString(new TransactionTemplate(fleet.transactions)
            .execute(status -> trips.accept(identity, (UUID) offer.get("id"), "a1")).tripId());
        assertThat(fleet.db.queryForObject("SELECT pickup_minutes FROM fleet_schema.trip WHERE id = ?", Double.class, tripId)).isEqualTo(2.0);
        JsonNode assigned = json.readTree(fleet.db.queryForObject("SELECT payload::text FROM delivery_schema.delivery_outbox "
            + "WHERE payload -> 'data' ->> 'status' = 'COURIER_ASSIGNED'", String.class)).path("data");
        Instant observed = json.convertValue(assigned.path("observedAt"), Instant.class);
        assertThat(Duration.between(observed, json.convertValue(assigned.path("pickupEtaAt"), Instant.class)))
            .as("the chef sees the rider in the model's 2 minutes").isEqualTo(Duration.ofMinutes(2));
    }

    @Test
    void whereThePolicyRanksByDistanceTheNearestGetsItAndTheOfferStillShowsTheModelsMinutes() {
        FleetDispatchFixtures.policy(fleet.db, "live", 40, 60, 1, 1, 0, false);
        model("better");
        dispatcher.setEta(new FleetEta(fleet.db, "live", "split-1"));
        Map<String, Object> offer = offer();
        assertThat(offer.get("rider_id")).as("nearest first, as riders were told").isEqualTo(north);
        assertThat(offer.get("rule")).isEqualTo("NEAREST");
        assertThat(((Number) offer.get("pickup_minutes")).doubleValue()).as("the model's minutes for the nearer rider").isEqualTo(9.0);
        assertThat(shown().estMinutes()).isEqualTo(26);
    }

    @Test
    void aModelNotJudgedToRankRidersWellNeverDecidesWhoHearsFirst() {
        FleetDispatchFixtures.policy(fleet.db, "live", 40, 60, 1, 1, 0, true);
        model("not-better");
        dispatcher.setEta(new FleetEta(fleet.db, "live", "split-1"));
        Map<String, Object> offer = offer();
        assertThat(offer.get("rider_id")).as("by distance, with an alert: riders were told soonest").isEqualTo(north);
        assertThat(offer.get("rule")).isEqualTo("NEAREST");
    }

    /**
     * Ranked by travel time, a fair band is in minutes (1000 m is 3 minutes at 20 km/h): the two riders 2 minutes away share
     * the turn and the one free longer gets it, though farther; the rider 9 minutes away is outside the band, though nearest
     * by straight line and free longest.
     */
    @Test
    void rankedByTravelTimeFairTurnsAreAmongTheRidersWithinMinutesOfTheSoonest() {
        UUID farSouth = fairTurns(true, "live");
        Map<String, Object> offer = offer();
        assertThat(offer.get("rider_id")).isEqualTo(farSouth);
        assertThat(offer.get("rule")).isEqualTo("FAIR");
        assertThat(bandRiders()).as("south and far south; north is 7 minutes behind").isEqualTo(2);
        assertThat(bandMinutes()).as("the reason says the band was counted in minutes").isEqualTo(3.0);
    }

    /** The same riders and band by distance: everyone is within 1000 m of the nearest, and north, free longest, gets it. */
    @Test
    void byDistanceTheSameBandTakesInEveryoneWithinItsMetres() {
        fairTurns(false, "live");
        Map<String, Object> offer = offer();
        assertThat(offer.get("rider_id")).isEqualTo(north);
        assertThat(offer.get("rule")).isEqualTo("FAIR");
        assertThat(bandRiders()).isEqualTo(3);
        assertThat(bandMinutes()).isNull();
    }

    /** In shadow, the model's order (with the same fair turns) is only logged beside today's: today's order stands. */
    @Test
    void inShadowFairTurnsStayAsToday() {
        fairTurns(true, "shadow");
        Map<String, Object> offer = offer();
        assertThat(offer.get("rider_id")).isEqualTo(north);
        assertThat(bandRiders()).isEqualTo(3);
        assertThat(offer.get("pickup_minutes")).isNull();
    }

    @Test
    void withTheModelInShadowOrOffTodaysRuleStays() {
        FleetDispatchFixtures.policy(fleet.db, "live", 40, 60, 1, 1, 0, true);
        model("better");
        dispatcher.setEta(new FleetEta(fleet.db, "shadow", "split-1"));
        Map<String, Object> offer = offer();
        assertThat(offer.get("rider_id")).as("nearest first, as today").isEqualTo(north);
        assertThat(offer.get("pickup_minutes")).isNull();
        assertThat(offer.get("drop_minutes")).isNull();
        Offer shown = shown();
        assertThat(shown.estMinutes()).as("20 km/h on the offer's distances").isEqualTo(FleetTripModels.estMinutes(shown.pickupDistanceM(),
            shown.dropDistanceM()));
    }

    /**
     * Dispatch timed to the food (R16 18) reads the model's middle minutes for the free riders nearest the kitchen: only with
     * a live model whose ranking passed, dispatch live, a known chef whose kitchen test mode lets riders take, and a rider
     * free inside the radius.
     */
    @Test
    void dispatchTimedToTheFoodReadsTheMiddleRideOfTheFreeRidersNearestTheKitchen() {
        Instant now = Instant.now();
        model("better");
        dispatcher.setEta(new FleetEta(fleet.db, "live", "split-1"));
        assertThat(dispatcher.rideMinutes(chefSubOrderId, KITCHEN_LAT, KITCHEN_LNG, now)).as("no dispatch policy in force").isEmpty();

        FleetDispatchFixtures.policy(fleet.db, "live");
        assertThat(dispatcher.rideMinutes(chefSubOrderId, KITCHEN_LAT, KITCHEN_LNG, now)).as("north 9 and south 2 minutes").hasValue(5.5);
        FleetDispatchFixtures.riderOnShift(fleet, "+919800000003", KITCHEN_LAT - 0.008, KITCHEN_LNG, 5, false); // 890 m, 2 minutes
        assertThat(dispatcher.rideMinutes(chefSubOrderId, KITCHEN_LAT, KITCHEN_LNG, now)).as("9, 2 and 2").hasValue(2.0);

        UUID elsewhere = UUID.fromString("0bde0202-2222-4222-8222-222222222222");
        FleetDispatchFixtures.kitchen(fleet.db, elsewhere, false);
        assertThat(dispatcher.rideMinutes(elsewhere, KITCHEN_LAT, KITCHEN_LNG, now)).as("test mode keeps riders from this kitchen").isEmpty();
        assertThat(dispatcher.rideMinutes(UUID.randomUUID(), KITCHEN_LAT, KITCHEN_LNG, now)).as("a chef nobody knows").isEmpty();
        assertThat(dispatcher.rideMinutes(chefSubOrderId, KITCHEN_LAT + 0.2, KITCHEN_LNG, now)).as("nobody free within 5 km").isEmpty();
        dispatcher.setEta(new FleetEta(fleet.db, "shadow", "split-1"));
        assertThat(dispatcher.rideMinutes(chefSubOrderId, KITCHEN_LAT, KITCHEN_LNG, now)).as("the model in shadow").isEmpty();
    }

    @Test
    void dispatchTimedToTheFoodNeedsAVersionWhoseRankingPassed() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        model("not-better");
        dispatcher.setEta(new FleetEta(fleet.db, "live", "split-1"));
        assertThat(dispatcher.rideMinutes(chefSubOrderId, KITCHEN_LAT, KITCHEN_LNG, Instant.now())).isEmpty();
    }

    /**
     * R16 18's narrowing window against the database: a command coming due 12 minutes before the food, whose riders are 5.5
     * minutes away, waits 4.5 minutes; once a worker started it, or the chef's ready tap moved it, it starts at once.
     */
    @Test
    void aCommandDueWellBeforeItsRidersWouldMeetTheFoodWaitsUnlessStartedOrReady() {
        FleetDispatchFixtures.policy(fleet.db, "live");
        model("better");
        dispatcher.setEta(new FleetEta(fleet.db, "live", "split-1"));
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setFoodTimedDispatchEnabled(true);
        DeliveryCommandRepository commands = new DeliveryCommandRepository(fleet.db, json);
        DeliveryCommandScheduler scheduler = new DeliveryCommandScheduler(commands, mock(DeliveryServiceBusPublisher.class), properties);
        scheduler.setFleetStage(dispatcher);

        DeliveryCommandMessage started = FleetDispatchFixtures.command(chefSubOrderId); // ready in 12 minutes
        commands.createOrFind(started);
        assertThat(scheduler.holdUntil(started)).as("12 − 5.5 − 2 minutes on").hasValueSatisfying(until ->
            assertThat(until).isCloseTo(started.readyAt().minusSeconds(450), within(1, ChronoUnit.MILLIS)));
        assertThat(commands.claim(started.commandId(), 5)).isPresent();
        assertThat(scheduler.holdUntil(started)).as("a worker started it").isEmpty();

        UUID tappedOrder = UUID.fromString("0bde0303-3333-4333-8333-333333333333");
        FleetDispatchFixtures.kitchen(fleet.db, tappedOrder, true);
        DeliveryCommandMessage tapped = FleetDispatchFixtures.command(tappedOrder);
        commands.createOrFind(tapped);
        assertThat(scheduler.holdUntil(tapped)).isPresent();
        Instant tap = Instant.now();
        assertThat(commands.accelerateScheduled(tapped.commandId(), new DeliveryCommandMessage(tapped.commandId(), UUID.randomUUID(),
            tapped.correlationId(), tapped.orderId(), tappedOrder, tap, tap, tapped.idempotencyKey(), tapped.distanceKm(), tapped.area(),
            tapped.orderHour(), tapped.dayOfWeek(), tapped.deliveryRequest()), "delivery-ready:" + tappedOrder)).isTrue();
        assertThat(scheduler.holdUntil(tapped)).as("the chef tapped ready").isEmpty();
    }
}
