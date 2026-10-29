package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetStorage;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** P2-01: the trips a shift credential may move (FleetShiftService.tripIdentity), against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetTripCredentialDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    FleetShiftService shifts;
    UUID ravi;
    UUID raviIdentity;
    UUID sita;
    String credential;

    @BeforeEach
    void setUp() {
        shifts = new FleetShiftService(fleet.db, FleetDatabase.properties(true), mock(FleetStorage.class));
        ravi = active("Ravi Kumar", "+919876543210");
        sita = active("Sita Devi", "+919876543211");
        raviIdentity = fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, ravi);
        credential = FleetShiftService.newCredential();
        fleet.db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at) "
            + "VALUES (?, ?, ?, now() + INTERVAL '11 hours', now() - INTERVAL '1 hour')", UUID.randomUUID(), ravi, FleetShiftService.hash(credential));
    }

    @Test
    void aCredentialMovesItsRidersTripInProgressAndOneThatEndedThisShiftOnly() {
        UUID current = trip(ravi, "PICKED_UP", null);
        UUID endedThisShift = trip(ravi, "DELIVERED", "10 minutes");
        UUID endedBefore = trip(ravi, "DELIVERED", "2 hours");
        UUID sitas = trip(sita, "ASSIGNED", null);

        assertThat(shifts.tripIdentity(credential, current)).isEqualTo(raviIdentity);
        assertThat(shifts.tripIdentity(credential, endedThisShift)).as("a retried step gets its first answer").isEqualTo(raviIdentity);
        for (UUID other : List.of(sitas, endedBefore, UUID.randomUUID())) {
            refused(() -> shifts.tripIdentity(credential, other), 404, "TRIP_NOT_FOUND");
        }
        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip WHERE id = ?", String.class, sitas)).isEqualTo("ASSIGNED");
    }

    @Test
    void anUnknownCredentialADeactivatedRiderOrAnEndedShiftMovesNothing() {
        UUID current = trip(ravi, "AT_DROP", null);
        refused(() -> shifts.tripIdentity("not-a-credential", current), 401, "SHIFT_CREDENTIAL_INVALID");
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'DEACTIVATED' WHERE id = ?", ravi);
        refused(() -> shifts.tripIdentity(credential, current), 401, "SHIFT_CREDENTIAL_INVALID");
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'SUSPENDED' WHERE id = ?", ravi);
        assertThat(shifts.tripIdentity(credential, current)).as("a paused rider finishes the trip in hand, as with the app's token")
            .isEqualTo(raviIdentity);
        shifts.end(raviIdentity);
        refused(() -> shifts.tripIdentity(credential, current), 401, "SHIFT_CREDENTIAL_INVALID");
    }

    UUID active(String name, String phone) {
        UUID rider = fleet.rider(name, phone);
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE', identity_id = ? WHERE id = ?", UUID.randomUUID(), rider);
        return rider;
    }

    /** One trip of this rider in state, finished that long ago (an interval), or not finished when null. */
    UUID trip(UUID rider, String state, String finishedAgo) {
        UUID trip = fleet.trip(UUID.randomUUID());
        fleet.db.update("UPDATE fleet_schema.trip SET rider_id = ?, state = ?, finished_at = now() - CAST(? AS interval) WHERE id = ?", rider,
            state, finishedAgo, trip);
        return trip;
    }

    static void refused(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
