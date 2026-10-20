package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** POST /shift/start and /shift/end against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
@WebMvcTest(FleetRiderController.class)
@ContextConfiguration(classes = {FleetRiderController.class, FleetRiderService.class, FleetShiftService.class, FleetPolicyStore.class,
    FleetApiAdvice.class, WebSecurityConfiguration.class, CravesJwtAuthenticationFilter.class, FleetRiderApiDatabaseTest.Database.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true"})
class FleetShiftApiDatabaseTest {
    static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0x01, 0x02};

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @MockBean JwtVerifier verifier;
    @MockBean FleetStorage storage;

    @Test
    void goingOnlineNeedsAnActiveRiderOnTheBoundPhoneWithCurrentDocumentsAndApp() throws Exception {
        Ready rider = ready();
        db.update("UPDATE fleet_schema.rider SET status = 'SUSPENDED' WHERE id = ?", rider.id());
        expect(start(rider, rider.installation()), 403, "RIDER_NOT_ACTIVE");
        db.update("UPDATE fleet_schema.rider SET status = 'ACTIVE', min_app_version = '1.2.0' WHERE id = ?", rider.id());
        expect(start(rider, null), 409, "DEVICE_NOT_BOUND");
        expect(start(rider, "a-different-phone"), 409, "DEVICE_NOT_BOUND");
        expect(start(rider, rider.installation()), 403, "APP_UPDATE_REQUIRED");

        db.update("UPDATE fleet_schema.rider SET min_app_version = NULL WHERE id = ?", rider.id());
        db.update("UPDATE fleet_schema.rider_document SET expires_on = NULL WHERE rider_id = ? AND type = 'PUC'", rider.id());
        db.update("UPDATE fleet_schema.rider_document SET expires_on = current_date - 1 WHERE rider_id = ? AND type = 'DRIVING_LICENCE'",
            rider.id());
        expect(start(rider, rider.installation()), 403, "DOCUMENTS_EXPIRED").andExpect(jsonPath("$.message")
            .value("Renew these before going online: Driving licence, PUC certificate. Upload a new photo in Profile and ops will check it."));

        db.update("UPDATE fleet_schema.rider_document SET expires_on = current_date + 30 WHERE rider_id = ?", rider.id());
        // A new photo waiting for review never hides a current verified one.
        document(rider.id(), "PUC", "PENDING", null);
        expect(mvc.perform(multipart("/api/v1/rider/shift/start").file(new MockMultipartFile("selfie", "s.jpg", "image/jpeg", "png?".getBytes()))
            .header("Authorization", "Bearer " + rider.token()).header(FleetShiftService.INSTALLATION_ID, rider.installation())),
            422, "SELFIE_INVALID");
        verifyNoInteractions(storage);
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.rider_shift WHERE rider_id = ?", Integer.class, rider.id())).isZero();

        start(rider, rider.installation()).andExpect(status().isOk());
    }

    @Test
    void goingOnlineReturnsTheCredentialOnceAndStoresOnlyItsHashAndTheSelfieForReview() throws Exception {
        Ready rider = ready();
        Map<?, ?> body = json.readValue(start(rider, rider.installation()).andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsString(), Map.class);
        String credential = (String) body.get("shiftCredential");
        assertThat(credential).matches("[A-Za-z0-9_-]{43}");
        assertThat(Instant.parse((String) body.get("expiresAt")))
            .isBetween(Instant.now().plus(Duration.ofHours(12)).minusSeconds(60), Instant.now().plus(Duration.ofHours(12)));

        Map<String, Object> shift = db.queryForMap("SELECT credential_hash, selfie_state, selfie_blob, selfie_size_bytes, device_id, ended_at "
            + "FROM fleet_schema.rider_shift WHERE rider_id = ?", rider.id());
        assertThat(shift).containsEntry("credential_hash", FleetShiftService.hash(credential)).containsEntry("selfie_state", "PENDING")
            .containsEntry("selfie_size_bytes", JPEG.length).containsEntry("device_id", FleetShiftService.deviceId(rider.id(), rider.installation()))
            .containsEntry("ended_at", null);
        assertThat((String) shift.get("selfie_blob")).startsWith("riders/" + rider.id() + "/selfies/").endsWith(".jpg");
        verify(storage).upload(eq((String) shift.get("selfie_blob")), eq(JPEG), eq("image/jpeg"), eq(false));
    }

    @Test
    void startingAgainFromTheSamePhoneRotatesTheCredentialAndAnotherPhonesShiftIsRefused() throws Exception {
        Ready rider = ready();
        String first = credential(start(rider, rider.installation()));
        String second = credential(start(rider, rider.installation()));
        assertThat(second).isNotEqualTo(first);
        assertThat(db.queryForList("SELECT credential_hash FROM fleet_schema.rider_shift WHERE rider_id = ?", String.class, rider.id()))
            .containsExactly(FleetShiftService.hash(second));
        verify(storage, times(1)).upload(any(), any(), any(), anyBoolean());

        // The open shift belongs to a phone ops has since replaced, and its credential still works.
        UUID old = UUID.randomUUID();
        db.update("INSERT INTO fleet_schema.rider_device (id, rider_id, app_version, model, state) VALUES (?, ?, '1.0.0', 'Old', 'REPLACED')",
            old, rider.id());
        db.update("UPDATE fleet_schema.rider_shift SET device_id = ? WHERE rider_id = ?", old, rider.id());
        expect(start(rider, rider.installation()), 409, "SHIFT_OPEN");
    }

    @Test
    void goingOfflineRevokesTheCredentialAndAShiftPastTwelveHoursIsClosedAtTheNextStart() throws Exception {
        Ready rider = ready();
        start(rider, rider.installation()).andExpect(status().isOk());
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/v1/rider/shift/end").header("Authorization", "Bearer " + rider.token())).andExpect(status().isNoContent());
        }
        assertThat(db.queryForObject("SELECT ended_at IS NOT NULL AND credential_revoked_at IS NOT NULL FROM fleet_schema.rider_shift "
            + "WHERE rider_id = ?", Boolean.class, rider.id())).isTrue();

        UUID stale = UUID.randomUUID();
        db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at) "
            + "VALUES (?, ?, ?, now() - INTERVAL '1 hour', now() - INTERVAL '13 hours')", stale, rider.id(), FleetShiftService.hash("stale"));
        start(rider, rider.installation()).andExpect(status().isOk());
        assertThat(db.queryForObject("SELECT ended_at = credential_expires_at FROM fleet_schema.rider_shift WHERE id = ?", Boolean.class, stale))
            .isTrue();
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.rider_shift WHERE rider_id = ? AND ended_at IS NULL", Integer.class,
            rider.id())).isEqualTo(1);
    }

    ResultActions start(Ready rider, String installation) throws Exception {
        var request = multipart("/api/v1/rider/shift/start").file(new MockMultipartFile("selfie", "selfie.jpg", "image/jpeg", JPEG))
            .header("Authorization", "Bearer " + rider.token());
        return mvc.perform(installation == null ? request : request.header(FleetShiftService.INSTALLATION_ID, installation));
    }

    static ResultActions expect(ResultActions result, int status, String code) throws Exception {
        return result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
    }

    String credential(ResultActions result) throws Exception {
        return json.readTree(result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("shiftCredential").asText();
    }

    /** An ACTIVE rider with the RIDER role, a bound phone on app 1.0.0 and the four riding documents verified and current. */
    Ready ready() {
        UUID identity = UUID.randomUUID();
        UUID rider = UUID.randomUUID();
        String phone = FleetRiderApiDatabaseTest.phone();
        db.update("INSERT INTO fleet_schema.rider (id, identity_id, name, phone, status, created_by) VALUES (?, ?, 'Ravi Kumar', ?, 'ACTIVE', ?)",
            rider, identity, phone, UUID.randomUUID());
        String installation = "android-" + UUID.randomUUID().toString().substring(0, 16);
        db.update("INSERT INTO fleet_schema.rider_device (id, rider_id, app_version, model, state) VALUES (?, ?, '1.0.0', 'Redmi Note 13', 'BOUND')",
            FleetShiftService.deviceId(rider, installation), rider);
        for (String type : List.of("DRIVING_LICENCE", "VEHICLE_RC", "VEHICLE_INSURANCE", "PUC")) {
            document(rider, type, "VERIFIED", "current_date + 30");
        }
        when(verifier.verify(identity.toString())).thenReturn(new CravesPrincipal(identity, phone, Set.of("CUSTOMER", "RIDER")));
        return new Ready(identity.toString(), rider, installation);
    }

    void document(UUID rider, String type, String status, String expiresOn) {
        db.update("INSERT INTO fleet_schema.rider_document (id, rider_id, type, status, expires_on, blob_name, content_type, size_bytes, "
            + "reviewed_at) VALUES (?, ?, ?, ?, " + expiresOn + ", 'riders/x.jpg', 'image/jpeg', 10, CASE WHEN ? = 'PENDING' THEN NULL ELSE now() END)",
            UUID.randomUUID(), rider, type, status, status);
    }

    record Ready(String token, UUID id, String installation) {
    }
}
