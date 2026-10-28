package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatch;
import in.craves.integration.fleet.rider.FleetRiderModels.LocationBatchResponse;
import in.craves.integration.fleet.rider.FleetRiderModels.RiderFix;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** P2-03 and P2-04 against a real database, without the web layer: a phone drains 20 kept fixes a call. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetLocationIngestDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final FleetLocationService service = new FleetLocationService(fleet.db, new ObjectMapper(), FleetDatabase.properties(true));

    @Test
    void twentyKeptFixesAreTrackedInOrderAndTheAnswerSaysHowManyAndHowOftenToSend() {
        UUID rider = fleet.rider("Ravi Kumar", "+919876543210");
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE', identity_id = ? WHERE id = ?", UUID.randomUUID(), rider);
        String credential = FleetShiftService.newCredential();
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at) "
            + "VALUES (?, ?, ?, now() + INTERVAL '11 hours', now() - INTERVAL '1 hour')", UUID.randomUUID(), rider, FleetShiftService.hash(credential));
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET state = 'PICKED_UP', rider_id = ? WHERE id = ?", rider, trip);
        // Ten minutes in a dead zone, one fix kept every 30 s, then the first call back.
        Instant t = Instant.now().minusSeconds(900).truncatedTo(ChronoUnit.MILLIS);
        List<RiderFix> kept = IntStream.range(0, 20).mapToObj(i -> new RiderFix(17.44, 78.39 + i / 10_000.0, 8.0, t.plusSeconds(30L * i), false))
            .toList();

        LocationBatchResponse answer = service.ingest(null, credential, new LocationBatch(kept));
        assertThat(answer.stop()).isNull();
        assertThat(answer.maxFixes()).isEqualTo(20);
        assertThat(answer.nextPollSec()).isEqualTo(10);
        assertThat(answer.callbackUploads()).as("phones keep the shift-long wake lock until P2-10 is switched on").isNull();
        assertThat(answer.activeTrip().tripId()).isEqualTo(trip.toString());
        assertThat(fleet.db.queryForList("SELECT recorded_at FROM fleet_schema.trip_track WHERE trip_id = ? ORDER BY recorded_at", Timestamp.class, trip))
            .hasSize(20).first().isEqualTo(Timestamp.from(t));
        assertThat(fleet.db.queryForObject("SELECT recorded_at FROM fleet_schema.rider_position_latest WHERE rider_id = ?", Timestamp.class, rider))
            .isEqualTo(Timestamp.from(t.plusSeconds(570)));

        List<RiderFix> tooMany = IntStream.range(0, 21).mapToObj(i -> new RiderFix(17.44, 78.39, 8.0, t.plusSeconds(600 + i), false)).toList();
        assertThatThrownBy(() -> service.ingest(null, credential, new LocationBatch(tooMany))).isInstanceOfSatisfying(FleetApiException.class,
            error -> assertThat(error.status()).isEqualTo(400));
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_track WHERE trip_id = ?", Integer.class, trip)).isEqualTo(20);

        // P2-10 switched on: every answer tells the phone to drop its shift-long wake lock.
        FleetLocationService callbacks = new FleetLocationService(fleet.db, new ObjectMapper(), FleetDatabase.properties(true, true));
        assertThat(callbacks.ingest(null, credential, new LocationBatch(List.of())).callbackUploads()).isTrue();
    }
}
