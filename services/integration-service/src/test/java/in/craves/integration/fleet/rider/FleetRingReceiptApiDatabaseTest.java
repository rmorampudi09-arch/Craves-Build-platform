package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

/**
 * POST /offers/{offerId}/rang (R22 22) against a real database, with CRAVES_FLEET_RING_RECEIPT_ENABLED on; every /locations
 * test runs again with it on, so the switch changes nothing there.
 */
// Not inherited from the parent: without it this class would run, and fail to start, where there is no database.
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
@ContextConfiguration(classes = FleetRingReceiptController.class)
@TestPropertySource(properties = "craves.fleet.ring-receipt-enabled=true")
class FleetRingReceiptApiDatabaseTest extends FleetLocationApiDatabaseTest {
    @Test
    void aRingReceiptIsStoredOnceInOneStatementForTheRidersOwnOffer() throws Exception {
        OnShift rider = onShift();
        OnShift other = onShift();
        UUID mine = offer(rider.id(), fleet.trip(UUID.randomUUID()), "now() + INTERVAL '30 seconds'");
        UUID theirs = offer(other.id(), fleet.trip(UUID.randomUUID()), "now() + INTERVAL '30 seconds'");
        Map<String, Object> before = fleet.db.queryForMap("SELECT * FROM fleet_schema.trip_offer WHERE id = ?", mine);

        STATEMENTS.set(0);
        rang(rider.credential(), mine, "fcm", 2000).andExpect(status().isNoContent());
        assertThat(STATEMENTS.get()).as("one statement").isEqualTo(1);
        Map<String, Object> after = fleet.db.queryForMap("SELECT *, EXTRACT(EPOCH FROM now() - rang_at) AS ago "
            + "FROM fleet_schema.trip_offer WHERE id = ?", mine);
        assertThat(after.get("rang_channel")).isEqualTo("fcm");
        assertThat(((Number) after.remove("ago")).doubleValue()).isBetween(1.5, 15.0);
        Object first = after.remove("rang_at");
        after.remove("rang_channel");
        before.remove("rang_at");
        before.remove("rang_channel");
        assertThat(after).as("nothing else on the offer changes: its state, its time, its rider").isEqualTo(before);

        // A repeat, and the same receipt arriving with /locations afterwards: the first arrival stays.
        rang(rider.credential(), mine, "locations", 0).andExpect(status().isNoContent());
        locations(rider, List.of(), List.of(receipt(mine, "locations", 0))).andExpect(status().isOk());
        assertThat(fleet.db.queryForMap("SELECT rang_at, rang_channel FROM fleet_schema.trip_offer WHERE id = ?", mine))
            .containsEntry("rang_at", first).containsEntry("rang_channel", "fcm");

        // Another rider's offer and an unknown one: 204, nothing stored.
        rang(rider.credential(), theirs, "fcm", 0).andExpect(status().isNoContent());
        rang(rider.credential(), UUID.randomUUID(), "fcm", 0).andExpect(status().isNoContent());
        assertThat(fleet.db.queryForObject("SELECT rang_at IS NULL FROM fleet_schema.trip_offer WHERE id = ?", Boolean.class, theirs)).isTrue();
    }

    @Test
    void aRingReceiptNeverComesBeforeItsOfferAndNeedsAKnownChannel() throws Exception {
        OnShift rider = onShift();
        UUID mine = offer(rider.id(), fleet.trip(UUID.randomUUID()), "now() + INTERVAL '30 seconds'");
        rang(rider.credential(), mine, "sms", 0).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(post(path(mine)).header(FleetShiftService.SHIFT_CREDENTIAL, rider.credential())).andExpect(status().isBadRequest());
        assertThat(fleet.db.queryForObject("SELECT rang_at IS NULL FROM fleet_schema.trip_offer WHERE id = ?", Boolean.class, mine)).isTrue();
        // An age from before the offer itself (offered 30 s ago) is held at the offer's time.
        rang(rider.credential(), mine, "locations", 3_600_000_000L).andExpect(status().isNoContent());
        assertThat(fleet.db.queryForObject("SELECT rang_at = offered_at FROM fleet_schema.trip_offer WHERE id = ?", Boolean.class, mine)).isTrue();
    }

    @Test
    void onlyALiveShiftsCredentialReportsARing() throws Exception {
        OnShift rider = onShift();
        UUID mine = offer(rider.id(), fleet.trip(UUID.randomUUID()), "now() + INTERVAL '30 seconds'");
        rang("not-a-credential", mine, "fcm", 0).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("SHIFT_CREDENTIAL_INVALID"));
        mvc.perform(post(path(mine)).contentType(MediaType.APPLICATION_JSON).content("{\"channel\":\"fcm\",\"ageMs\":0}"))
            .andExpect(status().isUnauthorized());
        // A rider who is no longer ACTIVE, their shift still open: refused, nothing written. (ACTIVE riders: the tests above.)
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'SUSPENDED' WHERE id = ?", rider.id());
        rang(rider.credential(), mine, "fcm", 0).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("SHIFT_CREDENTIAL_INVALID"));
        assertThat(fleet.db.queryForObject("SELECT rang_at IS NULL FROM fleet_schema.trip_offer WHERE id = ?", Boolean.class, mine)).isTrue();
        fleet.db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE' WHERE id = ?", rider.id());
        fleet.db.update("UPDATE fleet_schema.rider_shift SET ended_at = now(), credential_revoked_at = now() WHERE id = ?", rider.shift());
        rang(rider.credential(), mine, "fcm", 0).andExpect(status().isUnauthorized());
        assertThat(fleet.db.queryForObject("SELECT rang_at IS NULL FROM fleet_schema.trip_offer WHERE id = ?", Boolean.class, mine)).isTrue();
    }

    ResultActions rang(String credential, UUID offer, String channel, long ageMs) throws Exception {
        return mvc.perform(post(path(offer)).header(FleetShiftService.SHIFT_CREDENTIAL, credential).contentType(MediaType.APPLICATION_JSON)
            .content("{\"channel\":\"" + channel + "\",\"ageMs\":" + ageMs + "}"));
    }

    static String path(UUID offer) {
        return "/api/v1/rider/offers/" + offer + "/rang";
    }
}
