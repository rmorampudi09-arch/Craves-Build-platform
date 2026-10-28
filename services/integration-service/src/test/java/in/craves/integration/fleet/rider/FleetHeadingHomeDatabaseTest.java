package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.rider.FleetRiderModels.HeadingHome;
import in.craves.integration.fleet.rider.FleetRiderModels.HomeSpot;
import in.craves.integration.fleet.rider.FleetRiderModels.HomeSpotRequest;
import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatch;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderFix;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Phase 5 heading home against a real database: the home spot (about a kilometre, never an address, always deletable,
 * forgotten after 90 days unused), heading home for an hour, and its end when the rider turns it off or gets home.
 * Who hears of which order is in FleetDispatchDatabaseTest.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetHeadingHomeDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final FleetPolicyStore policies = new FleetPolicyStore(fleet.db, new ObjectMapper());
    final UUID identity = UUID.randomUUID();
    final FleetShiftService shifts = new FleetShiftService(fleet.db, FleetDatabase.properties(true, false, null, true), mock(FleetStorage.class));
    final FleetShiftService shiftsOff = new FleetShiftService(fleet.db, FleetDatabase.properties(true), mock(FleetStorage.class));
    final FleetRiderService riders = new FleetRiderService(fleet.db, policies, FleetDatabase.properties(true, false, null, true),
        mock(FleetStorage.class));
    final FleetRiderService ridersOff = new FleetRiderService(fleet.db, policies, FleetDatabase.properties(true), mock(FleetStorage.class));
    final FleetLocationService locations = new FleetLocationService(fleet.db, new ObjectMapper(), FleetDatabase.properties(true));
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
    void theHomeSpotIsKeptToAboutAKilometreShownOnlyToTheRiderAndAlwaysDeletable() {
        refused(() -> ridersOff.saveHome(identity, new HomeSpotRequest(17.4567, 78.3912)), 503, "RIDER_CHOICES_OFF");
        for (HomeSpotRequest unreadable : List.of(new HomeSpotRequest(null, 78.39), new HomeSpotRequest(17.45, null),
            new HomeSpotRequest(91.0, 78.39), new HomeSpotRequest(17.45, 181.0), new HomeSpotRequest(Double.NaN, 78.39))) {
            refused(() -> riders.saveHome(identity, unreadable), 400, "VALIDATION_FAILED");
        }
        assertThat(riders.profile(identity).homeSavedAt()).isNull();
        assertThat(riders.home(identity).homeSaved()).isFalse();

        HomeSpot saved = riders.saveHome(identity, new HomeSpotRequest(17.45678, 78.39123));
        Map<String, Object> stored = fleet.db.queryForMap("SELECT home_lat, home_lng FROM fleet_schema.rider WHERE id = ?", rider);
        assertThat((BigDecimal) stored.get("home_lat")).as("two decimal places: about a kilometre").isEqualByComparingTo("17.46");
        assertThat((BigDecimal) stored.get("home_lng")).isEqualByComparingTo("78.39");
        assertThat(riders.profile(identity).homeSavedAt()).isEqualTo(saved.savedAt());
        assertThat(ridersOff.profile(identity).homeSavedAt()).as("shown with choices off too, so the rider can delete it").isNotNull();
        assertThat(riders.home(identity).homeSaved()).isTrue();
        assertThat(ridersOff.home(identity).homeSaved()).as("Home offers heading home only while choices are on").isNull();

        @SuppressWarnings("unchecked")
        Map<String, Object> own = (Map<String, Object>) riders.myData(identity).get("profile");
        assertThat(((Number) own.get("homeLat")).doubleValue()).as("the rider's own copy has the spot").isEqualTo(17.46);
        @SuppressWarnings("unchecked")
        Map<String, Object> opsCopy = (Map<String, Object>) RiderDataExport.build(fleet.db, rider, Instant.now(), false).get("profile");
        assertThat(opsCopy).as("ops's copy only says one is kept").doesNotContainKeys("homeLat", "homeLng").containsEntry("homeSpotKept", true);

        shifts.headHome(identity);
        ridersOff.forgetHome(identity);
        assertThat(fleet.db.queryForMap("SELECT home_lat, home_lng, home_saved_at, home_used_at FROM fleet_schema.rider WHERE id = ?", rider)
            .values()).as("deleting always works, even with choices off").hasSize(4).containsOnlyNulls();
        assertThat(heading()).as("and ends heading home").isNull();
        ridersOff.forgetHome(identity);
    }

    @Test
    void headingHomeLastsAnHourAndEndsWhenTheRiderTurnsItOffOrGetsNearHome() {
        refused(() -> shiftsOff.headHome(identity), 503, "RIDER_CHOICES_OFF");
        refused(() -> shifts.headHome(identity), 409, "HOME_NOT_SAVED");
        refused(() -> shifts.headHome(UUID.randomUUID()), 409, "NOT_ONLINE");
        riders.saveHome(identity, new HomeSpotRequest(17.47, 78.35));

        HeadingHome on = shifts.headHome(identity);
        assertThat(Duration.between(Instant.now(), on.until()).toSeconds()).isBetween(3_590L, 3_600L);
        assertThat(riders.home(identity).headingHomeUntil()).isEqualTo(on.until());
        assertThat(fleet.db.queryForObject("SELECT home_used_at FROM fleet_schema.rider WHERE id = ?", Timestamp.class, rider))
            .as("using it keeps it from being forgotten").isNotNull();
        shiftsOff.stopHeadingHome(identity);
        assertThat(riders.home(identity).headingHomeUntil()).as("turning it off always works").isNull();
        shifts.stopHeadingHome(identity);

        shifts.headHome(identity);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET heading_home_until = now() - INTERVAL '1 second' WHERE rider_id = ?", rider);
        assertThat(riders.home(identity).headingHomeUntil()).as("an hour that ran out is not shown").isNull();

        shifts.headHome(identity);
        Instant t = Instant.now().minusSeconds(120).truncatedTo(ChronoUnit.MILLIS);
        locations.ingest(null, credential, new LocationBatch(List.of(fix(17.4513, 78.3915, t, false))));
        assertThat(heading()).as("about 5 km from home").isNotNull();
        locations.ingest(null, credential, new LocationBatch(List.of(fix(17.4701, 78.3502, t.plusSeconds(10), true))));
        assertThat(heading()).as("a mock fix never ends it").isNotNull();
        locations.ingest(null, credential, new LocationBatch(List.of()));
        assertThat(heading()).as("a call without fixes changes nothing").isNotNull();
        locations.ingest(null, credential, new LocationBatch(List.of(fix(17.4745, 78.3520, t.plusSeconds(20), false))));
        assertThat(heading()).as("within a kilometre of home: it has done its job").isNull();
    }

    @Test
    void aHomeSpotNobodySavedOrUsedFor90DaysIsForgotten() {
        riders.saveHome(identity, new HomeSpotRequest(17.47, 78.35));
        fleet.db.update("UPDATE fleet_schema.rider SET home_saved_at = now() - INTERVAL '120 days', home_used_at = now() - INTERVAL '10 days' "
            + "WHERE id = ?", rider);
        locations.forgetUnusedHomes();
        assertThat(riders.profile(identity).homeSavedAt()).as("used 10 days ago: kept").isNotNull();

        fleet.db.update("UPDATE fleet_schema.rider SET home_used_at = now() - INTERVAL '91 days' WHERE id = ?", rider);
        locations.forgetUnusedHomes();
        assertThat(riders.profile(identity).homeSavedAt()).as("unused for 91 days: forgotten").isNull();
        assertThat(fleet.db.queryForObject("SELECT home_lat FROM fleet_schema.rider WHERE id = ?", BigDecimal.class, rider)).isNull();
    }

    private Timestamp heading() {
        return fleet.db.queryForObject("SELECT heading_home_until FROM fleet_schema.rider_shift WHERE rider_id = ? AND ended_at IS NULL",
            Timestamp.class, rider);
    }

    private static RiderFix fix(double lat, double lng, Instant at, boolean mock) {
        return new RiderFix(lat, lng, 8.0, at, mock);
    }

    private static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, exception -> {
            assertThat(exception.status()).isEqualTo(status);
            assertThat(exception.code()).isEqualTo(code);
        });
    }
}
