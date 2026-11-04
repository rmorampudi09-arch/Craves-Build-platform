package in.craves.integration.fleet.slots;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.admin.FleetSlotService;
import in.craves.integration.payout.bank.BankDataCipher;
import in.craves.integration.fleet.slots.FleetSlotBookingService.Booking;
import in.craves.integration.fleet.slots.FleetSlotBookingService.Capacity;
import in.craves.integration.fleet.slots.FleetSlotBookingService.CapacityInput;
import in.craves.integration.fleet.slots.FleetSlotBookingService.SlotOffer;
import in.craves.integration.fleet.slots.FleetSlotBookingService.SlotsPage;
import in.craves.integration.fleet.slots.FleetSlotBookingService.Standby;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Future;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.CountDownLatch;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * App 1.3.3 (R-07): clusters from recorded orders, the weekly capacity, booking, standby, cancelling, no-shows and the
 * settlement a booked slot gets, against a real database (the disposable Postgres every fleet database test uses).
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetSlotBookingDatabaseTest {
    static final double LAT = 17.4483;
    static final double LNG = 78.3915;
    /** Monday 9 Nov 2026 plans the week of 16 Nov; its waves open Thursday 12 and Friday 13 Nov at 10:00 IST. */
    static final LocalDate PLANNING_MONDAY = LocalDate.of(2026, 11, 9);
    static final Instant THURSDAY_NOON = at(2026, 11, 12, 12, 0);
    static final Instant FRIDAY_NOON = at(2026, 11, 13, 12, 0);

    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final Admin ops = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx210");
    FleetSlotBookingService slots;
    FleetSlotService settlement;
    UUID ravi;
    UUID priya;

    static Instant at(int year, int month, int day, int hour, int minute) {
        return ZonedDateTime.of(year, month, day, hour, minute, 0, 0, FleetSlotBookingService.IST).toInstant();
    }

    @BeforeEach
    void setUp() {
        FleetAdminService admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class),
            mock(BankDataCipher.class));
        FleetPolicyStore policies = new FleetPolicyStore(fleet.db, json);
        slots = new FleetSlotBookingService(fleet.db, policies, admin, fleet.transactions);
        settlement = new FleetSlotService(fleet.db, policies, admin, fleet.transactions);
        ravi = fleet.rider("Ravi Kumar", "+919876543210");
        priya = fleet.rider("Priya", "+919876543211");
        // Only an active rider holds a place (as only an active rider starts a shift).
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE' WHERE id IN (?, ?)", ravi, priya);
    }

    /** perDay orders a day at the IST hour over the 14 days before now, at (lat, lng), recorded as the dispatch chain records them. */
    void recorded(Instant now, double lat, double lng, int hour, int perDay, String area) {
        for (int day = 1; day <= 14; day++) {
            for (int i = 0; i < perDay; i++) {
                Instant at = now.atZone(FleetSlotBookingService.IST).toLocalDate().minusDays(day).atTime(hour, i).atZone(FleetSlotBookingService.IST).toInstant();
                UUID order = UUID.randomUUID();
                fleet.db.update("INSERT INTO delivery_schema.delivery_command (id, chef_sub_order_id, order_id, command_type, status, dispatch_at, "
                    + "idempotency_key, payload) VALUES (?, ?, ?, 'QUOTE_AND_CREATE', 'COMPLETED', ?, ?, CAST(? AS jsonb))", UUID.randomUUID(), order,
                    UUID.randomUUID(), Timestamp.from(at), "slot-test-" + order,
                    "{\"deliveryRequest\": {\"pickup\": {\"latitude\": " + lat + ", \"longitude\": " + lng + ", \"area\": \"" + area + "\"}}}");
            }
        }
    }

    UUID approvedDinner(Instant now) {
        recorded(now, LAT, LNG, 20, 9, "Madhapur");
        assertThat(slots.rebuildClusters(now)).isEqualTo(1);
        assertThat(slots.planWeek(PLANNING_MONDAY)).as("7 days × lunch and dinner").isEqualTo(14);
        Capacity dinner = slots.capacities(LocalDate.of(2026, 11, 16), LocalDate.of(2026, 11, 22)).windows().stream()
            .filter(window -> window.startsAt().equals(at(2026, 11, 18, 19, 0))).findFirst().orElseThrow();
        assertThat(dinner.places()).as("2.25 orders an hour / 1.4, rounded up").isEqualTo(2);
        assertThat(dinner.ratePerHourPaise()).as("₹90, inside the draft card's 0 to 15000").isEqualTo(9000);
        assertThat(dinner.approvedAt()).isNull();
        slots.approve(ops, UUID.randomUUID(), dinner.capacityId());
        return dinner.capacityId();
    }

    @Test
    void clustersKeepTheirIdWhileTheCentreMovesUnderFiveHundredMetres() {
        Instant now = at(2026, 11, 9, 6, 0);
        recorded(now, LAT, LNG, 12, 9, "Madhapur");
        recorded(now, LAT + 0.05, LNG, 12, 1, "Kondapur");
        assertThat(slots.rebuildClusters(now)).isEqualTo(1);
        Map<String, Object> first = fleet.db.queryForMap("SELECT id, n, name, centre_lat FROM fleet_schema.slot_cluster WHERE active");
        assertThat(first.get("name")).isEqualTo("Madhapur");
        assertThat(first.get("n")).isEqualTo(1);
        // Two days later the same kitchen's orders sit 200 m north: same cluster, moved.
        Instant later = now.plus(2, ChronoUnit.DAYS);
        fleet.db.update("UPDATE delivery_schema.delivery_command SET payload = jsonb_set(payload, '{deliveryRequest,pickup,latitude}', to_jsonb(?::float8))",
            LAT + 0.0018);
        assertThat(slots.rebuildClusters(later)).isEqualTo(1);
        Map<String, Object> moved = fleet.db.queryForMap("SELECT id, n, centre_lat FROM fleet_schema.slot_cluster WHERE active");
        assertThat(moved.get("id")).isEqualTo(first.get("id"));
        assertThat((Double) moved.get("centre_lat")).isGreaterThan((Double) first.get("centre_lat"));
        // Orders gone: the cluster goes quiet; a new one elsewhere gets the next number and a made-up name without an area.
        fleet.db.update("DELETE FROM delivery_schema.delivery_command");
        recorded(later, LAT + 0.2, LNG + 0.2, 20, 9, "");
        assertThat(slots.rebuildClusters(later)).isEqualTo(1);
        assertThat(fleet.db.queryForObject("SELECT active FROM fleet_schema.slot_cluster WHERE id = ?", Boolean.class, first.get("id"))).isFalse();
        assertThat(fleet.db.queryForObject("SELECT name FROM fleet_schema.slot_cluster WHERE active", String.class)).isEqualTo("Cluster 2");
    }

    @Test
    void ridersBookFromTheirWaveIntoApprovedWindowsOnlyWithTheHoursAndOverlapRules() {
        UUID dinner = approvedDinner(at(2026, 11, 9, 6, 0));
        // Ravi completed a slot last week, so he books from Thursday; Priya is new and waits for Friday.
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, status) VALUES (?, ?, 'Madhapur', ?, ?, 'COMPLETED')",
            UUID.randomUUID(), ravi, Timestamp.from(at(2026, 11, 4, 19, 0)), Timestamp.from(at(2026, 11, 4, 21, 30)));
        refused(() -> slots.book(ravi, dinner, at(2026, 11, 12, 9, 59)), 409, "SLOT_WAVE_NOT_OPEN");
        refused(() -> slots.book(priya, dinner, THURSDAY_NOON), 409, "SLOT_WAVE_NOT_OPEN");
        Booking booked = slots.book(ravi, dinner, THURSDAY_NOON);
        assertThat(booked.status()).isEqualTo("BOOKED");
        assertThat(booked.clusterName()).isEqualTo("Madhapur");
        assertThat(booked.ratePerHourPaise()).isEqualTo(9000);
        refused(() -> slots.book(ravi, dinner, THURSDAY_NOON), 409, "SLOT_ALREADY_BOOKED");
        // The booked slot is an ordinary rider_slot with the cluster's geometry, for the heartbeat and the settlement.
        Map<String, Object> slot = fleet.db.queryForMap("SELECT zone_name, guaranteed_per_hour_paise, zone_radius_m, status FROM fleet_schema.rider_slot "
            + "WHERE rider_id = ? AND status = 'BOOKED'", ravi);
        assertThat(slot.get("zone_name")).isEqualTo("Madhapur");
        assertThat(slot.get("guaranteed_per_hour_paise")).isEqualTo(9000L);
        assertThat(slot.get("zone_radius_m")).isEqualTo(1500);

        SlotsPage page = slots.list(ravi, THURSDAY_NOON);
        SlotOffer offer = page.slots().stream().filter(s -> s.capacityId().equals(dinner)).findFirst().orElseThrow();
        assertThat(offer.placesLeft()).isEqualTo(1);
        assertThat(offer.bookingId()).isEqualTo(booked.bookingId());
        assertThat(offer.opensAt()).isEqualTo(at(2026, 11, 12, 10, 0));
        assertThat(page.earlyWave()).isTrue();
        assertThat(page.slots()).as("only approved windows").hasSize(1);
        assertThat(slots.list(priya, THURSDAY_NOON).earlyWave()).isFalse();

        // Not approved, started, and the window a rider already holds (an ops slot) are refused.
        UUID lunchSameDay = fleet.db.queryForObject("SELECT id FROM fleet_schema.slot_capacity WHERE starts_at = ?", UUID.class,
            Timestamp.from(at(2026, 11, 18, 11, 30)));
        refused(() -> slots.book(ravi, lunchSameDay, THURSDAY_NOON), 404, "CAPACITY_NOT_FOUND");
        slots.approve(ops, UUID.randomUUID(), lunchSameDay);
        // No lunch orders were recorded, so the job planned 0 places; ops opens two.
        slots.adjust(ops, UUID.randomUUID(), lunchSameDay, new CapacityInput(2, null));
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at) VALUES (?, ?, 'Ops zone', ?, ?)",
            UUID.randomUUID(), ravi, Timestamp.from(at(2026, 11, 18, 13, 0)), Timestamp.from(at(2026, 11, 18, 14, 0)));
        refused(() -> slots.book(ravi, lunchSameDay, THURSDAY_NOON), 409, "SLOT_OVERLAP");
        refused(() -> slots.book(ravi, dinner, at(2026, 11, 18, 19, 1)), 409, "SLOT_STARTED");
        // Six booked hours a day: Priya's dinner (2.5 h) plus a 3.5 h ops slot leave no room for the 3 h lunch.
        Booking priyaDinner = slots.book(priya, dinner, FRIDAY_NOON);
        assertThat(priyaDinner.status()).isEqualTo("BOOKED");
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at) VALUES (?, ?, 'Ops zone', ?, ?)",
            UUID.randomUUID(), priya, Timestamp.from(at(2026, 11, 18, 15, 0)), Timestamp.from(at(2026, 11, 18, 18, 30)));
        refused(() -> slots.book(priya, lunchSameDay, FRIDAY_NOON), 409, "SLOT_HOURS_LIMIT");
    }

    @Test
    void aFullWindowTakesStandbysAndACancellationPromotesTheFirstWhoStillFits() {
        UUID dinner = approvedDinner(at(2026, 11, 9, 6, 0));
        slots.adjust(ops, UUID.randomUUID(), dinner, new CapacityInput(1, null));
        refused(() -> slots.adjust(ops, UUID.randomUUID(), dinner, new CapacityInput(null, 20000L)), 422, "GUARANTEE_OUT_OF_RANGE");
        refused(() -> slots.standby(ravi, dinner, FRIDAY_NOON), 409, "SLOT_HAS_PLACES");
        Booking ravis = slots.book(ravi, dinner, FRIDAY_NOON);
        refused(() -> slots.book(priya, dinner, FRIDAY_NOON), 409, "SLOT_FULL");
        Standby standby = slots.standby(priya, dinner, FRIDAY_NOON.plusSeconds(60));
        assertThat(standby.position()).isEqualTo(1);
        assertThat(slots.list(priya, FRIDAY_NOON.plusSeconds(120)).slots().get(0).standby()).isTrue();

        refused(() -> slots.cancel(priya, ravis.bookingId(), FRIDAY_NOON.plusSeconds(180)), 404, "BOOKING_NOT_FOUND");
        Booking cancelled = slots.cancel(ravi, ravis.bookingId(), FRIDAY_NOON.plusSeconds(180));
        assertThat(cancelled.status()).isEqualTo("CANCELLED");
        assertThat(fleet.db.queryForObject("SELECT status FROM fleet_schema.rider_slot WHERE rider_id = ?", String.class, ravi)).isEqualTo("CANCELLED");
        Map<String, Object> promoted = fleet.db.queryForMap("SELECT b.status, s.promoted_booking_id FROM fleet_schema.slot_booking b "
            + "JOIN fleet_schema.slot_standby s ON s.promoted_booking_id = b.id WHERE b.rider_id = ?", priya);
        assertThat(promoted.get("status")).isEqualTo("BOOKED");
        assertThat(slots.list(priya, FRIDAY_NOON.plusSeconds(240)).slots().get(0).bookingId()).isNotNull();
        refused(() -> slots.cancel(ravi, ravis.bookingId(), FRIDAY_NOON.plusSeconds(300)), 409, "BOOKING_NOT_BOOKED");
    }

    @Test
    void noShiftFifteenMinutesInIsANoShowWithoutAGuaranteeAndASettledSlotCompletesItsBooking() {
        UUID dinner = approvedDinner(at(2026, 11, 9, 6, 0));
        Booking ravis = slots.book(ravi, dinner, FRIDAY_NOON);
        Booking priyas = slots.book(priya, dinner, FRIDAY_NOON);
        // Priya went online before the slot; Ravi never did.
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at) VALUES (?, ?, ?, ?, ?)",
            UUID.randomUUID(), priya, "p".repeat(64), Timestamp.from(at(2026, 11, 19, 3, 0)), Timestamp.from(at(2026, 11, 18, 18, 50)));
        assertThat(slots.markNoShows(at(2026, 11, 18, 19, 10))).as("inside the 15 minutes of grace").isZero();
        assertThat(slots.markNoShows(at(2026, 11, 18, 19, 16))).isEqualTo(1);
        assertThat(fleet.db.queryForObject("SELECT status FROM fleet_schema.slot_booking WHERE id = ?", String.class, ravis.bookingId())).isEqualTo("NO_SHOW");
        assertThat(fleet.db.queryForObject("SELECT status FROM fleet_schema.rider_slot WHERE rider_id = ?", String.class, ravi)).isEqualTo("CANCELLED");
        assertThat(fleet.db.queryForObject("SELECT status FROM fleet_schema.slot_booking WHERE id = ?", String.class, priyas.bookingId())).isEqualTo("BOOKED");
        // Two no-shows in 14 days: Ravi loses the Thursday wave even with a completed slot.
        fleet.db.update("INSERT INTO fleet_schema.slot_booking (id, capacity_id, rider_id, rider_slot_id, status, no_show_at) "
            + "SELECT ?, capacity_id, rider_id, rider_slot_id, 'NO_SHOW', no_show_at FROM fleet_schema.slot_booking WHERE id = ?", UUID.randomUUID(),
            ravis.bookingId());
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, status) VALUES (?, ?, 'Madhapur', ?, ?, 'COMPLETED')",
            UUID.randomUUID(), ravi, Timestamp.from(at(2026, 11, 10, 19, 0)), Timestamp.from(at(2026, 11, 10, 21, 30)));
        assertThat(slots.experienced(ravi, at(2026, 11, 19, 10, 0))).isFalse();
        assertThat(slots.experienced(priya, at(2026, 11, 19, 10, 0))).as("no completed slot yet").isFalse();

        // Priya's slot ends and the existing settlement pays her guarantee for the minutes counted inside the zone.
        fleet.db.update("UPDATE fleet_schema.rider_slot SET in_zone_seconds = 5400, starts_at = now() - INTERVAL '2 hours', "
            + "ends_at = now() - INTERVAL '1 minute' WHERE rider_id = ? AND status = 'BOOKED'", priya);
        assertThat(settlement.settleDue()).isEqualTo(1);
        assertThat(fleet.db.queryForObject("SELECT guaranteed_paise FROM fleet_schema.rider_slot_settlement WHERE rider_id = ?", Long.class, priya))
            .as("1.5 hours at ₹90").isEqualTo(13500L);
        slots.markNoShows(Instant.now());
        assertThat(fleet.db.queryForObject("SELECT status FROM fleet_schema.slot_booking WHERE id = ?", String.class, priyas.bookingId())).isEqualTo("COMPLETED");
        assertThat(slots.experienced(priya, Instant.now())).isTrue();
    }

    @Test
    void theSlotRulesJoinTheDraftBeforeTheFirstCardIsPublished() {
        List<Map<String, Object>> cards = fleet.db.queryForList("SELECT version, status, summary_of_changes::text AS summary FROM fleet_schema.rate_card "
            + "ORDER BY version");
        assertThat(cards).as("no card is published in a fresh database: no version is spent").extracting(card -> card.get("version"))
            .containsExactly("2026-10-v1");
        assertThat(cards.get(0).get("status")).isEqualTo("DRAFT");
        assertThat((String) cards.get(0).get("summary")).contains("Booked peak slots").contains("At most 6 booked hours a day");
    }

    @Test
    void twoRidersRacingForTheLastPlaceGetOneBookingAndOneSlotFull() throws Exception {
        UUID dinner = approvedDinner(at(2026, 11, 9, 6, 0));
        slots.adjust(ops, UUID.randomUUID(), dinner, new CapacityInput(1, null));
        TransactionTemplate tx = new TransactionTemplate(fleet.transactions);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Object>> results = new ArrayList<>();
        for (UUID rider : List.of(ravi, priya)) {
            results.add(pool.submit(() -> {
                go.await();
                try {
                    return tx.execute(status -> slots.book(rider, dinner, FRIDAY_NOON));
                } catch (FleetApiException refused) {
                    return refused.code();
                }
            }));
        }
        go.countDown();
        List<Object> outcomes = new ArrayList<>();
        for (Future<Object> result : results) {
            outcomes.add(result.get(30, TimeUnit.SECONDS));
        }
        pool.shutdown();
        assertThat(outcomes.stream().filter(Booking.class::isInstance)).as("exactly one place").hasSize(1);
        assertThat(outcomes).contains("SLOT_FULL");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.slot_booking WHERE capacity_id = ? AND status = 'BOOKED'", Integer.class, dinner))
            .isEqualTo(1);
    }

    @Test
    void onlyActiveRidersHoldPlacesStandbyNeedsNoPlaceAndAnOpsCancelFreesThePlace() {
        UUID dinner = approvedDinner(at(2026, 11, 9, 6, 0));
        slots.adjust(ops, UUID.randomUUID(), dinner, new CapacityInput(1, null));
        refused(() -> slots.adjust(ops, UUID.randomUUID(), dinner, new CapacityInput(501, null)), 400, "VALIDATION_FAILED");
        refused(() -> slots.capacities(LocalDate.of(1999, 1, 1), LocalDate.of(1999, 1, 2)), 400, "VALIDATION_FAILED");
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'SUSPENDED' WHERE id = ?", priya);
        refused(() -> slots.book(priya, dinner, FRIDAY_NOON), 403, "RIDER_NOT_ACTIVE");
        Booking ravis = slots.book(ravi, dinner, FRIDAY_NOON);
        // Holding the place, Ravi cannot also queue for it; Priya, suspended, queues but is skipped when a place frees.
        refused(() -> slots.standby(ravi, dinner, FRIDAY_NOON), 409, "SLOT_ALREADY_BOOKED");
        slots.standby(priya, dinner, FRIDAY_NOON);
        // Ops cancels Ravi's slot: the no-show job ends the booking and offers the place to the list (Priya is skipped).
        fleet.db.update("UPDATE fleet_schema.rider_slot SET status = 'CANCELLED', cancelled_at = now(), cancelled_reason = 'Ops' WHERE rider_id = ?", ravi);
        slots.markNoShows(FRIDAY_NOON.plusSeconds(60));
        assertThat(fleet.db.queryForObject("SELECT status FROM fleet_schema.slot_booking WHERE id = ?", String.class, ravis.bookingId())).isEqualTo("CANCELLED");
        assertThat(slots.list(ravi, FRIDAY_NOON.plusSeconds(120)).slots().get(0).placesLeft()).isEqualTo(1);
        assertThat(fleet.db.queryForObject("SELECT promoted_booking_id FROM fleet_schema.slot_standby WHERE rider_id = ?", UUID.class, priya)).isNull();
        // Active again, Priya books the freed place, then cancels and rejoins the list once it is full again.
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE' WHERE id = ?", priya);
        Booking priyas = slots.book(priya, dinner, FRIDAY_NOON.plusSeconds(180));
        slots.cancel(priya, priyas.bookingId(), FRIDAY_NOON.plusSeconds(240));
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.slot_booking WHERE rider_id = ? AND status = 'BOOKED'", Integer.class, priya))
            .as("cancelling never re-books the same rider from their own standby row").isZero();
    }

    private static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
