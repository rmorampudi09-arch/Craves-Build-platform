package in.craves.integration.fleet.admin;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminModels.PhoneHealth;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderDetail;
import in.craves.integration.fleet.admin.FleetAdminModels.RiderOffer;
import in.craves.integration.fleet.admin.FleetAdminModels.Shift;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import in.craves.integration.payout.bank.BankDataCipher;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** The ops console's rider page (WORKPLAN P2-06a): each shift's heartbeat and phone health, and the rider's recent offers. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetRiderHealthDatabaseTest {
    static final String OFFER = "INSERT INTO fleet_schema.trip_offer (id, trip_id, rider_id, state, pay_paise, rate_card_version, "
        + "pickup_distance_m, drop_distance_m, offered_at, expires_at, decided_at, pushed_at, push_result, rang_at, rang_channel) "
        + "VALUES (?, ?, ?, ?, 6800, '2026-10-v1', 1200, 3400, now() - make_interval(mins => ?), now() - make_interval(mins => ?) "
        + "+ INTERVAL '40 seconds', now() - make_interval(mins => ?) + INTERVAL '30 seconds', now() - make_interval(mins => ?), ?, %s, ?)";
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();

    @Test
    void theRiderPageShowsEachShiftsHeartbeatAndPhoneAndTheRecentOffers() {
        UUID rider = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET started_at = now() - INTERVAL '2 hours', max_silence_seconds = 75, "
            + "silences_over_60s = 1, can_ring = false, health = '{\"batteryPct\": 54, \"charging\": false, \"powerSave\": true, "
            + "\"canRing\": false, \"drainPct\": 6.0, \"unpluggedMin\": 60, \"lastExitReason\": \"LOW_MEMORY\", \"queuePending\": 2, "
            + "\"queueOldestAgeS\": 95}' WHERE rider_id = ?", rider);
        // Yesterday's shift on an older app: no heartbeat, no health.
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at, ended_at) "
            + "VALUES (?, ?, ?, now() - INTERVAL '20 hours', now() - INTERVAL '1 day', now() - INTERVAL '20 hours')",
            UUID.randomUUID(), rider, "b".repeat(64));
        UUID trip = fleet.trip(UUID.randomUUID());
        UUID rang = UUID.randomUUID();
        UUID unheard = UUID.randomUUID();
        fleet.db.update(OFFER.formatted("now() - INTERVAL '10 minutes' + INTERVAL '2 seconds'"), rang, trip, rider, "DECLINED", 10, 10, 10, 10,
            "SENT", "fcm");
        fleet.db.update(OFFER.formatted("NULL"), unheard, trip, rider, "EXPIRED", 5, 5, 5, 5, "NO_TOKEN", null);

        RiderDetail detail = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class),
            mock(BankDataCipher.class)).getRider(rider);

        Shift open = detail.shifts().get(0);
        assertThat(open.endedAt()).isNull();
        assertThat(open.lastSeenAt()).isBetween(Instant.now().minusSeconds(60), Instant.now());
        assertThat(open.maxSilenceSeconds()).isEqualTo(75);
        assertThat(open.silencesOver60s()).isEqualTo(1);
        assertThat(open.phone()).as("6% over 60 unplugged minutes is 6% an hour")
            .isEqualTo(new PhoneHealth(54, false, true, false, 6.0, "LOW_MEMORY", 2, 95));
        Shift older = detail.shifts().get(1);
        assertThat(older.phone()).isNull();
        assertThat(older.lastSeenAt()).isNull();
        assertThat(older.maxSilenceSeconds()).isZero();

        assertThat(detail.recentOffers()).as("newest first")
            .extracting(RiderOffer::offerId, RiderOffer::orderCode, RiderOffer::state, RiderOffer::pushResult, RiderOffer::rangChannel)
            .containsExactly(tuple(unheard, "#0A1B2C3D", "EXPIRED", "NO_TOKEN", null), tuple(rang, "#0A1B2C3D", "DECLINED", "SENT", "fcm"));
        RiderOffer heard = detail.recentOffers().get(1);
        assertThat(heard.rangAt()).isEqualTo(heard.offeredAt().plusSeconds(2));
        assertThat(heard.pushedAt()).isEqualTo(heard.offeredAt());
        assertThat(detail.recentOffers().get(0).rangAt()).isNull();
    }

    @Test
    void aBatteryRateNeedsHalfAnHourUnplugged() {
        UUID rider = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT, KITCHEN_LNG, 5, false);
        fleet.db.update("UPDATE fleet_schema.rider_shift SET health = '{\"batteryPct\": 90, \"drainPct\": 2.0, \"unpluggedMin\": 20}' "
            + "WHERE rider_id = ?", rider);
        PhoneHealth phone = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class),
            mock(BankDataCipher.class)).getRider(rider).shifts().get(0).phone();
        assertThat(phone.batteryPct()).isEqualTo(90);
        assertThat(phone.batteryPerHourPct()).isNull();
        assertThat(phone.canRing()).as("not reported yet").isNull();
        assertThat(phone.lastExitReason()).isNull();
    }
}
