package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import in.craves.integration.fleet.rider.FleetRiderModels.HomeSummary;
import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatch;
import in.craves.integration.fleet.rider.FleetRiderModels.OrderPreferences;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderFix;
import in.craves.integration.fleet.rider.FleetRiderModels.ShiftPause;
import in.craves.integration.security.CravesPrincipal;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Phase 4 rider choices against a real database: a break while online, and the farthest pickup and drop a rider wants. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetRiderChoicesDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final FleetPolicyStore policies = new FleetPolicyStore(fleet.db, new ObjectMapper());
    final UUID identity = UUID.randomUUID();
    final FleetShiftService shifts = new FleetShiftService(fleet.db, FleetDatabase.properties(true, false, null, true), mock(FleetStorage.class));
    final FleetShiftService shiftsOff = new FleetShiftService(fleet.db, FleetDatabase.properties(true), mock(FleetStorage.class));
    final FleetRiderService riders = new FleetRiderService(fleet.db, policies, FleetDatabase.properties(true, false, null, true),
        mock(FleetStorage.class));
    final FleetRiderService ridersOff = new FleetRiderService(fleet.db, policies, FleetDatabase.properties(true), mock(FleetStorage.class));
    UUID rider;
    String credential;

    @BeforeEach
    void setUp() {
        rider = fleet.rider("Ravi Kumar", "+919876543210");
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE', identity_id = ? WHERE id = ?", identity, rider);
        credential = FleetShiftService.newCredential();
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at, last_seen_at) "
            + "VALUES (?, ?, ?, now() + INTERVAL '11 hours', now() - INTERVAL '1 hour', now())", UUID.randomUUID(), rider,
            FleetShiftService.hash(credential));
    }

    @Test
    void aBreakStopsOffersForItsMinutesAndTheRiderCanComeBackSooner() {
        refused(() -> shiftsOff.pause(identity, 10), 503, "RIDER_CHOICES_OFF");
        refused(() -> shifts.pause(identity, 4), 400, "VALIDATION_FAILED");
        refused(() -> shifts.pause(identity, 61), 400, "VALIDATION_FAILED");
        refused(() -> shifts.pause(identity, null), 400, "VALIDATION_FAILED");
        refused(() -> shifts.pause(UUID.randomUUID(), 10), 409, "NOT_ONLINE");
        UUID ringing = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, pay_paise, pay_lines, rate_card_version, pickup_distance_m, "
            + "drop_distance_m, expires_at) VALUES (?, ?, ?, 6800, '[]', '2026-10-v1', 1200, 3400, now() + INTERVAL '30 seconds')", ringing,
            fleet.trip(UUID.randomUUID()), rider);

        ShiftPause pause = shifts.pause(identity, 10);
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip_offer WHERE id = ?", String.class, ringing))
            .as("an offer still ringing goes to the next rider").isEqualTo("WITHDRAWN");
        assertThat(Duration.between(Instant.now(), pause.offersPausedUntil()).toSeconds()).isBetween(590L, 600L);
        assertThat(riders.home(identity).offersPausedUntil()).isEqualTo(pause.offersPausedUntil());
        ShiftPause longer = shifts.pause(identity, 30);
        assertThat(longer.offersPausedUntil()).as("a new break replaces the old one").isAfter(pause.offersPausedUntil());
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rider_break a JOIN fleet_schema.rider_break b ON a.id <> b.id "
            + "AND a.shift_id = b.shift_id AND a.started_at < b.ends_at AND b.started_at < a.ends_at", Integer.class))
            .as("the first break ended as the second began: they never overlap").isZero();

        shiftsOff.resume(identity);
        assertThat(riders.home(identity).offersPausedUntil()).as("ending a break works even with choices off").isNull();
        shifts.resume(identity);
        FleetDispatchFixtures.onBreak(fleet.db, rider, 20, -1);
        assertThat(riders.home(identity).offersPausedUntil()).as("a break that ended is not shown").isNull();
        assertThat(riders.home(identity).online()).isTrue();
    }

    @Test
    void theFarthestPickupAndDropAreTheRidersToChooseWithinBounds() {
        CravesPrincipal principal = new CravesPrincipal(identity, "+919876543210", Set.of("RIDER"));
        assertThat(riders.me(principal).features().riderChoices()).isTrue();
        assertThat(ridersOff.me(principal).features().riderChoices()).isFalse();
        assertThat(riders.profile(identity).preferences()).isEqualTo(new OrderPreferences(null, null));
        assertThat(ridersOff.profile(identity).preferences()).isNull();
        refused(() -> ridersOff.setPreferences(identity, new OrderPreferences(2000, null)), 503, "RIDER_CHOICES_OFF");

        assertThat(riders.setPreferences(identity, new OrderPreferences(2000, 6000))).isEqualTo(new OrderPreferences(2000, 6000));
        assertThat(riders.profile(identity).preferences()).isEqualTo(new OrderPreferences(2000, 6000));
        for (OrderPreferences outOfBounds : List.of(new OrderPreferences(499, null), new OrderPreferences(10_001, null),
            new OrderPreferences(null, 999), new OrderPreferences(null, 20_001))) {
            refused(() -> riders.setPreferences(identity, outOfBounds), 400, "VALIDATION_FAILED");
        }
        assertThat(riders.setPreferences(identity, new OrderPreferences(null, 6000))).as("null is any distance")
            .isEqualTo(new OrderPreferences(null, 6000));
        assertThat(riders.setPreferences(identity, null)).isEqualTo(new OrderPreferences(null, null));
    }

    /** The slot guarantee pays for time available for offers: a break adds nothing to it, while the shift still counts. */
    @Test
    void breakTimeDoesNotCountTowardTheSlotGuarantee() {
        UUID slot = UUID.randomUUID();
        fleet.db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, guaranteed_per_hour_paise) "
            + "VALUES (?, ?, 'Madhapur', now() - INTERVAL '2 hours', now() + INTERVAL '2 hours', 8000)", slot, rider);
        FleetLocationService locations = new FleetLocationService(fleet.db, new ObjectMapper(), FleetDatabase.properties(true));
        Instant t = Instant.now().minusSeconds(300).truncatedTo(ChronoUnit.MILLIS);
        locations.ingest(null, credential, new LocationBatch(List.of(fix(t))));

        shifts.pause(identity, 10);
        locations.ingest(null, credential, new LocationBatch(List.of(fix(t.plusSeconds(30)), fix(t.plusSeconds(60)))));
        assertThat(slotSeconds(slot)).as("on a break").isZero();
        assertThat(fleet.db.queryForObject("SELECT in_zone_seconds FROM fleet_schema.rider_shift WHERE rider_id = ?", Integer.class, rider))
            .isEqualTo(60);

        shifts.resume(identity);
        locations.ingest(null, credential, new LocationBatch(List.of(fix(t.plusSeconds(90)))));
        assertThat(slotSeconds(slot)).as("back from the break").isEqualTo(30);
    }

    /**
     * Phase 4: pay per available online hour today, breaks left out, as Home shows it and fair turns compare it; and the
     * middle over riders online 30 minutes or more, only once there are 5 of them.
     */
    @Test
    void homeShowsPayPerOnlineHourTodayAndTheMiddleOfFiveOrMoreRiders() {
        FleetDatabase.assumeTodayIsHoursOld(2);
        FleetDispatchFixtures.onBreak(fleet.db, rider, 40, -20);
        earned(rider, 20_000);
        FleetRiderService fresh = new FleetRiderService(fleet.db, policies, FleetDatabase.properties(true), mock(FleetStorage.class));
        HomeSummary alone = fresh.home(identity);
        assertThat(alone.todayOnlineMinutes()).as("an hour on shift less a 20-minute break").isBetween(39, 40);
        assertThat(alone.todayPerHourPaise()).as("₹200 over 40 minutes").isBetween(29_900L, 30_100L);
        assertThat(alone.fleetPerHourPaise()).as("under 5 riders: nothing that could show one rider's pay").isNull();

        for (long paise : new long[] {0, 10_000, 20_000, 40_000}) {
            earned(online(60), paise);
        }
        earned(online(20), 100_000);
        HomeSummary five = new FleetRiderService(fleet.db, policies, FleetDatabase.properties(true), mock(FleetStorage.class)).home(identity);
        assertThat(five.fleetPerHourPaise()).as("the middle of ₹0, 100, 200, 300 and 400 an hour; 20 minutes online counts for nothing")
            .isBetween(19_900L, 20_100L);
        assertThat(alone.todayPerHourPaise()).isNotNull();
    }

    /** A phone that stops calling stops counting as online 3 minutes after its last call, though its shift is still open. */
    @Test
    void aPhoneThatStoppedCallingStopsCountingAsOnline() {
        FleetDatabase.assumeTodayIsHoursOld(3);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET started_at = now() - INTERVAL '2 hours', credential_expires_at = now() + INTERVAL '9 hours', "
            + "last_seen_at = now() - INTERVAL '60 minutes' WHERE rider_id = ?", rider);
        assertThat(riders.home(identity).todayOnlineMinutes()).as("an hour until the last call, and 3 minutes after").isBetween(62, 63);
    }

    /** Another rider, online for the last minutes on an open shift. */
    private UUID online(int minutes) {
        UUID other = fleet.rider("Rider " + minutes, String.format("+9198%08d", Math.floorMod(UUID.randomUUID().getLeastSignificantBits(),
            100_000_000L)));
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at, last_seen_at) "
            + "VALUES (?, ?, ?, now() + INTERVAL '11 hours', now() - make_interval(mins => ?), now())", UUID.randomUUID(), other,
            FleetShiftService.hash(FleetShiftService.newCredential()), minutes);
        return other;
    }

    /** Pay finalized just now for a delivered trip. */
    private void earned(UUID who, long paise) {
        if (paise == 0) {
            return;
        }
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = 'DELIVERED', finished_at = now(), pay_finalized_at = now() "
            + "WHERE id = ?", who, trip);
        fleet.db.update("INSERT INTO fleet_schema.rider_earning (id, rider_id, trip_id, component, revision, business_key, gross_paise, "
            + "withheld_paise, net_paise, rate_card_version, withdrawable_at) VALUES (?, ?, ?, 'base', 1, ?, ?, 0, ?, '2026-10-v1', now())",
            UUID.randomUUID(), who, trip, "fleet-trip-pay/" + trip + "/base/1", paise, paise);
    }

    private static RiderFix fix(Instant at) {
        return new RiderFix(17.4483, 78.3915, 8.0, at, false);
    }

    private int slotSeconds(UUID slot) {
        return fleet.db.queryForObject("SELECT in_zone_seconds FROM fleet_schema.rider_slot WHERE id = ?", Integer.class, slot);
    }

    private static void refused(Runnable work, int status, String code) {
        assertThatThrownBy(work::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
