package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import in.craves.integration.fleet.FleetRain.Setting;
import in.craves.integration.fleet.eta.FleetEta;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;

/** Rain mode (R16 19, V178) against a real database: the ops switch, the automatic switch's reading, and the policy it runs. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetRainDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final UUID rider = fleet.rider("Ravi Kumar", "+919800000001");

    FleetRain rain(String etaMode, boolean auto) {
        return new FleetRain(fleet.db, new FleetEta(fleet.db, etaMode, ""), auto);
    }

    /** A delivered ride to the door that ended minutesAgo after rideMinutes; predicted: the live model's minutes (null: none). */
    void ride(int minutesAgo, double rideMinutes, Double predicted) {
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'DELIVERED', rider_id = ?, arrived_drop_at = now() - make_interval(mins => ?), "
            + "picked_up_at = now() - make_interval(mins => ?) - make_interval(secs => ?), finished_at = now() - make_interval(mins => ?) "
            + "WHERE id = ?", rider, minutesAgo, minutesAgo, rideMinutes * 60, minutesAgo, trip);
        fleet.db.update("INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, state, pay_paise, rate_card_version, pickup_distance_m, "
            + "drop_distance_m, expires_at, decided_at, drop_minutes) VALUES (?, ?, ?, 'ACCEPTED', 4000, '2026-10-v1', 500, 3500, "
            + "now() + INTERVAL '40 seconds', now(), ?)", UUID.randomUUID(), trip, rider, predicted);
    }

    @Test
    void opsSetTheSwitchWithWhoAndWhenAndOtherServersFollowWithin30Seconds() {
        FleetRain rain = rain("off", false);
        FleetRain other = rain("off", false);
        assertThat(rain.setting()).as("V178 seeds it off").isEqualTo(new Setting("off", null, null));
        assertThat(other.level(0)).isEqualTo("off");

        UUID admin = UUID.randomUUID();
        Setting set = rain.set("severe", admin, "Admin +91 98xxxxx210");
        assertThat(set.level()).isEqualTo("severe");
        assertThat(set.setByName()).isEqualTo("Admin +91 98xxxxx210");
        assertThat(set.setAt()).isCloseTo(Instant.now(), within(1, ChronoUnit.MINUTES));
        assertThat(fleet.db.queryForObject("SELECT set_by FROM fleet_schema.rain_mode", UUID.class)).isEqualTo(admin);
        assertThat(rain.severe()).as("this server at once").isTrue();
        assertThat(other.level(29_000)).as("the others within 30 s").isEqualTo("off");
        assertThat(other.level(30_000)).isEqualTo("severe");

        rain.set("on", admin, "Admin +91 98xxxxx210");
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.rain_mode", Integer.class)).as("one row").isEqualTo(1);
        assertThat(rain.raining()).isTrue();
        assertThat(rain.severe()).isFalse();
        assertThatThrownBy(() -> fleet.db.update("UPDATE fleet_schema.rain_mode SET level = 'storm'"))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void theAutomaticSwitchReadsTheLastHalfHoursRidesToTheDoor() {
        for (int i = 0; i < 9; i++) {
            ride(5, 18, 12.0); // 1.5 times the prediction
        }
        ride(45, 30, 12.0); // ended too long ago
        ride(3, 30, null);  // no live model then
        assertThat(rain("live", true).slow()).as("9 rides are too few").isFalse();
        ride(2, 18, 12.0);
        assertThat(rain("live", true).slow()).isTrue();
        assertThat(rain("live", true).level(0)).isEqualTo("on");
        assertThat(rain("live", true).status().setting().level()).as("the ops switch is untouched").isEqualTo("off");
        assertThat(rain("shadow", true).level(0)).as("only with the model live").isEqualTo("off");
        assertThat(rain("live", false).level(0)).as("only with CRAVES_FLEET_RAIN_AUTO").isEqualTo("off");
    }

    @Test
    void oneRidersLongStopDoesNotSwitchItOn() {
        for (int i = 0; i < 11; i++) {
            ride(5, 12.5, 12.0);
        }
        ride(4, 90, 12.0);
        assertThat(rain("live", true).slow()).isFalse();
    }

    @Test
    void whileItRainsThePolicyInForceRunsWithRainRulesButRidersTermsKeepTheirs() {
        fleet.db.update("INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, mode, offer_seconds, "
            + "fleet_stage_seconds, radius_m, ranges, offers_at_once, offer_rounds, fair_band_m) VALUES ('2026-11-v1', 'PUBLISHED', "
            + "now() - INTERVAL '1 day', now(), 'live', 30, 120, 5000, '{}', 1, 3, 1500)");
        FleetPolicyStore store = new FleetPolicyStore(fleet.db, new ObjectMapper());
        FleetRain rain = rain("off", false);
        store.setRain(rain);
        DispatchPolicy dry = store.currentDispatchPolicy().orElseThrow();
        assertThat(dry.offerSeconds()).isEqualTo(30);
        assertThat(dry.offerRounds()).isEqualTo(3);

        rain.set("on", UUID.randomUUID(), "Admin +91 98xxxxx210");
        DispatchPolicy wet = store.currentDispatchPolicy().orElseThrow();
        assertThat(wet).isEqualTo(FleetRain.inRain(dry));
        assertThat(wet.offerSeconds()).isEqualTo(45);
        assertThat(wet.offerRounds()).isEqualTo(2);
        assertThat(store.dispatchRules(null).offerRounds()).as("riders' terms show the policy's own rules").isEqualTo(3);
    }
}
