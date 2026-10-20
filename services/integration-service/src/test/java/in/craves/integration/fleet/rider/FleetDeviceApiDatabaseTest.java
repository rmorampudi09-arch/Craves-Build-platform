package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.admin.FleetAdminController;
import in.craves.integration.fleet.admin.FleetAdminService;
import in.craves.integration.fleet.admin.RiderJoinsExitsExport;
import in.craves.integration.payout.bank.BankDataCipher;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** POST /devices against a real database, through to ops approving a new phone with P1's admin endpoint. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
@WebMvcTest(controllers = {FleetRiderController.class, FleetAdminController.class})
@ContextConfiguration(classes = {FleetRiderController.class, FleetRiderService.class, FleetShiftService.class, FleetPolicyStore.class,
    FleetAdminController.class, FleetAdminService.class, RiderJoinsExitsExport.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class, FleetRiderApiDatabaseTest.Database.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true"})
class FleetDeviceApiDatabaseTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @MockBean JwtVerifier verifier;
    @MockBean FleetStorage storage;
    @MockBean FleetRoleClient roles;
    @MockBean BankDataCipher cipher;

    @Test
    void theFirstPhoneIsBoundTheSamePhoneUpdatesAndAnotherWaitsUntilOpsApprovesIt() throws Exception {
        Rider rider = rider();
        register(rider.token(), null, "phone-a-0001", "token-1", "1.0.0").andExpect(status().isNoContent());
        register(rider.token(), null, "phone-a-0001", "token-2", "1.1.0").andExpect(status().isNoContent());
        Map<String, Object> first = db.queryForMap("SELECT id, state, fcm_token, app_version FROM fleet_schema.rider_device WHERE rider_id = ?",
            rider.id());
        assertThat(first).containsEntry("id", FleetShiftService.deviceId(rider.id(), "phone-a-0001")).containsEntry("state", "BOUND")
            .containsEntry("fcm_token", "token-2").containsEntry("app_version", "1.1.0");

        for (int i = 0; i < 2; i++) {
            register(rider.token(), null, "phone-b-0002", "token-b", "1.1.0").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DEVICE_NOT_BOUND"));
        }
        UUID second = FleetShiftService.deviceId(rider.id(), "phone-b-0002");
        assertThat(state(second)).isEqualTo("PENDING_APPROVAL");
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.rider_device WHERE rider_id = ?", Integer.class, rider.id())).isEqualTo(2);

        // A shift open on the first phone loses its credential when ops approves the second.
        String credential = FleetShiftService.newCredential();
        db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, device_id, credential_hash, credential_expires_at) "
            + "VALUES (?, ?, ?, ?, now() + INTERVAL '12 hours')", UUID.randomUUID(), rider.id(), first.get("id"), FleetShiftService.hash(credential));
        register(null, credential, "phone-a-0001", "token-3", "1.1.0").andExpect(status().isNoContent());

        UUID ops = UUID.randomUUID();
        when(verifier.verify("ops")).thenReturn(new CravesPrincipal(ops, "+919000000001", Set.of("OPERATIONS_ADMIN")));
        mvc.perform(post("/api/v1/admin/fleet/riders/" + rider.id() + "/devices/" + second + "/approve").header("Authorization", "Bearer ops")
            .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("BOUND"));
        assertThat(state((UUID) first.get("id"))).isEqualTo("REPLACED");
        register(null, credential, "phone-a-0001", "token-3", "1.1.0").andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("SHIFT_CREDENTIAL_INVALID"));

        register(rider.token(), null, "phone-b-0002", "token-b2", "1.1.0").andExpect(status().isNoContent());
        register(rider.token(), null, "phone-a-0001", "token-4", "1.1.0").andExpect(status().isConflict());
        assertThat(state((UUID) first.get("id"))).as("the old phone asks again").isEqualTo("PENDING_APPROVAL");
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.rider_device WHERE rider_id = ? AND state = 'BOUND'", Integer.class,
            rider.id())).isEqualTo(1);
    }

    @Test
    void badDetailsUnknownCredentialsAndNonRidersAreRefused() throws Exception {
        Rider rider = rider();
        register(rider.token(), null, "phone-a-0001", "token-1", "latest").andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        register(rider.token(), null, "short", "token-1", "1.0.0").andExpect(status().isBadRequest());
        register(null, "not-a-credential", "phone-a-0001", "token-1", "1.0.0").andExpect(status().isUnauthorized());
        register(null, null, "phone-a-0001", "token-1", "1.0.0").andExpect(status().isUnauthorized());

        UUID stranger = UUID.randomUUID();
        when(verifier.verify("stranger")).thenReturn(new CravesPrincipal(stranger, "+919000000009", Set.of("RIDER")));
        register("stranger", null, "phone-a-0001", "token-1", "1.0.0").andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("NOT_A_RIDER"));
        when(verifier.verify("customer")).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000008", Set.of("CUSTOMER")));
        register("customer", null, "phone-a-0001", "token-1", "1.0.0").andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.rider_device WHERE rider_id = ?", Integer.class, rider.id())).isZero();
    }

    ResultActions register(String token, String credential, String installation, String fcmToken, String appVersion) throws Exception {
        var request = post("/api/v1/rider/devices").contentType(MediaType.APPLICATION_JSON).content("{\"installationId\":\"" + installation
            + "\",\"fcmToken\":\"" + fcmToken + "\",\"appVersion\":\"" + appVersion + "\",\"model\":\"Redmi Note 13\"}");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return mvc.perform(credential == null ? request : request.header(FleetShiftService.SHIFT_CREDENTIAL, credential));
    }

    String state(UUID device) {
        return db.queryForObject("SELECT state FROM fleet_schema.rider_device WHERE id = ?", String.class, device);
    }

    Rider rider() {
        UUID identity = UUID.randomUUID();
        UUID rider = UUID.randomUUID();
        String phone = FleetRiderApiDatabaseTest.phone();
        db.update("INSERT INTO fleet_schema.rider (id, identity_id, name, phone, status, created_by) VALUES (?, ?, 'Ravi Kumar', ?, 'ACTIVE', ?)",
            rider, identity, phone, UUID.randomUUID());
        when(verifier.verify(identity.toString())).thenReturn(new CravesPrincipal(identity, phone, Set.of("CUSTOMER", "RIDER")));
        return new Rider(identity.toString(), rider);
    }

    record Rider(String token, UUID id) {
    }
}
