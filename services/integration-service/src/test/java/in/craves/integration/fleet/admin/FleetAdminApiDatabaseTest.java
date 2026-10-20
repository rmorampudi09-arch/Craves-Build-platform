package in.craves.integration.fleet.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.payout.bank.BankDataCipher;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** The admin fleet API against a real database: due-process rules, payout account rules, idempotency and the audit. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
@WebMvcTest(FleetAdminController.class)
@ContextConfiguration(classes = {FleetAdminController.class, FleetAdminService.class, RiderJoinsExitsExport.class, FleetApiAdvice.class,
    WebSecurityConfiguration.class, CravesJwtAuthenticationFilter.class, FleetAdminApiDatabaseTest.Database.class})
@TestPropertySource(properties = "craves.fleet.enabled=true")
class FleetAdminApiDatabaseTest {
    static final String FLEET = "/api/v1/admin/fleet";

    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement
    static class Database {
        @Bean FleetDatabase fleetDatabase() {
            return new FleetDatabase();
        }

        @Bean JdbcTemplate jdbcTemplate(FleetDatabase fleet) {
            return fleet.db;
        }

        @Bean PlatformTransactionManager transactionManager(FleetDatabase fleet) {
            return fleet.transactions;
        }

        @Bean BankDataCipher bankDataCipher(ObjectMapper json) {
            byte[] key = new byte[32];
            ThreadLocalRandom.current().nextBytes(key);
            return new BankDataCipher(json, "test", "{\"test\":\"" + Base64.getEncoder().encodeToString(key) + "\"}");
        }
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @MockBean JwtVerifier verifier;
    @MockBean FleetStorage storage;
    @MockBean FleetRoleClient roles;
    final UUID ops = UUID.randomUUID();
    final UUID payments = UUID.randomUUID();

    @BeforeEach
    void signIn() {
        when(verifier.verify("ops")).thenReturn(new CravesPrincipal(ops, "+919000000001", Set.of("OPERATIONS_ADMIN")));
        when(verifier.verify("payments")).thenReturn(new CravesPrincipal(payments, "+919000000002", Set.of("PAYMENTS_ADMIN")));
    }

    @Test
    void createRiderIsAuditedAndAReplayReturnsTheFirstResult() throws Exception {
        String phone = phone();
        String body = "{\"name\":\"Ravi Kumar\",\"phone\":\"" + phone + "\",\"language\":\"te\"}";
        UUID key = UUID.randomUUID();
        String first = send(post(FLEET + "/riders"), "ops", key, body).andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("PENDING")).andExpect(jsonPath("$.phoneMasked").value(org.hamcrest.Matchers.startsWith("+91 ")))
            .andReturn().getResponse().getContentAsString();
        String again = send(post(FLEET + "/riders"), "ops", key, body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();

        assertThat(json.readTree(again)).isEqualTo(json.readTree(first));
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.rider WHERE phone = ?", Integer.class, phone)).isEqualTo(1);
        send(post(FLEET + "/riders"), "ops", key, body.replace("Ravi", "Rafi"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
        send(post(FLEET + "/riders"), "ops", UUID.randomUUID(), body.replace("Ravi", "Rafi"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PHONE_IN_USE"));

        String riderId = json.readTree(first).get("riderId").asText();
        mvc.perform(get(FLEET + "/audit").param("riderId", riderId).header("Authorization", "Bearer ops")).andExpect(status().isOk())
            .andExpect(jsonPath("$.entries.length()").value(1)).andExpect(jsonPath("$.entries[0].action").value("RIDER_CREATED"))
            .andExpect(jsonPath("$.entries[0].actorName").value("Admin +91 90xxxxx001"));
    }

    @Test
    void noticeNeedsSevenDaysAndKeepsTheRiderWorking() throws Exception {
        UUID rider = activeRider();
        statusEvent(rider, "NOTICE", "\"deadline\":\"" + Instant.now().plus(6, ChronoUnit.DAYS) + "\",")
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("NOTICE_DEADLINE_TOO_SOON"));
        statusEvent(rider, "NOTICE", "\"deadline\":\"" + Instant.now().plus(8, ChronoUnit.DAYS) + "\",")
            .andExpect(status().isCreated()).andExpect(jsonPath("$.statusAfter").value("ACTIVE")).andExpect(jsonPath("$.reviewBy").isEmpty());
        statusEvent(rider, "DEACTIVATE", "").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("NOTICE_REQUIRED"));
        assertThat(riderStatus(rider)).isEqualTo("ACTIVE");
        verify(roles, never()).revoke(any(), any());
    }

    @Test
    void safetyPauseNeedsAReviewWithin72HoursThenDeactivationRevokesTheRole() throws Exception {
        UUID rider = activeRider();
        statusEvent(rider, "SAFETY_PAUSE", "\"reviewBy\":\"" + Instant.now().plus(73, ChronoUnit.HOURS) + "\",")
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("REVIEW_BY_TOO_LATE"));
        statusEvent(rider, "SAFETY_PAUSE", "\"reviewBy\":\"" + Instant.now().plus(48, ChronoUnit.HOURS) + "\",")
            .andExpect(status().isCreated()).andExpect(jsonPath("$.statusAfter").value("SUSPENDED"));
        assertThat(riderStatus(rider)).isEqualTo("SUSPENDED");

        statusEvent(rider, "DEACTIVATE", "").andExpect(status().isCreated()).andExpect(jsonPath("$.statusAfter").value("DEACTIVATED"));
        verify(roles).revoke(identity(rider), rider);
        assertThat(db.queryForList("SELECT action FROM fleet_schema.admin_audit WHERE rider_id = ? ORDER BY at", String.class, rider))
            .containsExactly("STATUS_RESTORE", "STATUS_SAFETY_PAUSE", "STATUS_DEACTIVATE");
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.rider_status_event WHERE rider_id = ? AND approver_id = ?",
            Integer.class, rider, ops)).isEqualTo(3);
    }

    @Test
    void activationNeedsTheRiderToHaveSignedInAndGrantsTheRole() throws Exception {
        UUID rider = rider("Sita Devi");
        statusEvent(rider, "RESTORE", "").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVALID_STATUS_TRANSITION"));
        UUID identity = UUID.randomUUID();
        db.update("UPDATE fleet_schema.rider SET identity_id = ? WHERE id = ?", identity, rider);
        statusEvent(rider, "RESTORE", "").andExpect(status().isCreated()).andExpect(jsonPath("$.statusAfter").value("ACTIVE"));
        verify(roles).grant(identity, rider);
    }

    @Test
    void payoutAccountMustMatchTheKycNameAndBelongToOneRider() throws Exception {
        UUID ravi = rider("Ravi Kumar");
        UUID sita = rider("Sita Devi");
        String number = String.valueOf(ThreadLocalRandom.current().nextLong(100_000_000_000L, 999_999_999_999L));
        String account = "{\"method\":\"BANK\",\"accountNumber\":\"" + number + "\",\"ifsc\":\"SBIN0001234\",\"holderName\":\"%s\","
            + "\"verifiedInPerson\":true}";

        send(put(FLEET + "/riders/" + ravi + "/payout-account"), "payments", UUID.randomUUID(), account.formatted("Ravi Kumar Reddy"))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("HOLDER_NAME_MISMATCH"));
        send(put(FLEET + "/riders/" + ravi + "/payout-account"), "payments", UUID.randomUUID(), account.formatted("KUMAR RAVI"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.maskedAccount").value("xxxxxx" + number.substring(number.length() - 4)))
            .andExpect(jsonPath("$.ifsc").value("SBIN0001234")).andExpect(jsonPath("$.setBy").value("Admin +91 90xxxxx002"));
        // The same account typed with another branch of the same bank is still the same account.
        send(put(FLEET + "/riders/" + sita + "/payout-account"), "payments", UUID.randomUUID(),
                account.formatted("Sita Devi").replace("SBIN0001234", "SBIN0009999"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYOUT_ACCOUNT_NOT_UNIQUE"));

        String stored = db.queryForObject("SELECT encrypted_details || masked_account FROM fleet_schema.rider_payout_account WHERE rider_id = ?",
            String.class, ravi);
        assertThat(stored).doesNotContain(number);
        assertThat(db.queryForObject("SELECT summary FROM fleet_schema.admin_audit WHERE rider_id = ? AND action = 'PAYOUT_ACCOUNT_SET'",
            String.class, ravi)).doesNotContain(number);
    }

    @Test
    void documentReviewRecordsTheReviewerAndARejectionReason() throws Exception {
        UUID rider = rider("Ravi Kumar");
        UUID licence = document(rider);
        UUID pan = document(rider);
        send(post(FLEET + "/riders/" + rider + "/documents/" + licence + "/approve"), "ops", UUID.randomUUID(), null)
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("VERIFIED")).andExpect(jsonPath("$.reason").isEmpty());
        send(post(FLEET + "/riders/" + rider + "/documents/" + licence + "/reject"), "ops", UUID.randomUUID(), "{\"reason\":\"Blurry photo\"}")
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DOCUMENT_NOT_PENDING"));
        send(post(FLEET + "/riders/" + rider + "/documents/" + pan + "/reject"), "ops", UUID.randomUUID(), "{\"reason\":\"Blurry photo\"}")
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED")).andExpect(jsonPath("$.reason").value("Blurry photo"));

        JsonNode detail = json.readTree(mvc.perform(get(FLEET + "/riders/" + rider).header("Authorization", "Bearer ops"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(detail.get("rider").get("kycName").asText()).isEqualTo("Ravi Kumar");
        assertThat(detail.get("documents")).hasSize(2);
        assertThat(detail.get("payoutAccount").isNull()).isTrue();
    }

    @Test
    void approvingANewPhoneReplacesTheOldOne() throws Exception {
        UUID rider = rider("Ravi Kumar");
        UUID old = device(rider, "BOUND");
        UUID fresh = device(rider, "PENDING_APPROVAL");
        send(post(FLEET + "/riders/" + rider + "/devices/" + fresh + "/approve"), "ops", UUID.randomUUID(), null)
            .andExpect(status().isOk()).andExpect(jsonPath("$.state").value("BOUND"));
        assertThat(db.queryForObject("SELECT state FROM fleet_schema.rider_device WHERE id = ?", String.class, old)).isEqualTo("REPLACED");
        send(post(FLEET + "/riders/" + rider + "/devices/" + old + "/approve"), "ops", UUID.randomUUID(), null)
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DEVICE_NOT_PENDING"));
    }

    @Test
    void theJoinsAndExitsExportIsACsvDownloadAndIsAudited() throws Exception {
        UUID rider = activeRider();
        String today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).toString();
        String csv = mvc.perform(get(FLEET + "/exports/rider-joins-exits").param("date", today).header("Authorization", "Bearer ops"))
            .andExpect(status().isOk())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                .string("Content-Disposition", "attachment; filename=\"rider-joins-exits-" + today + ".csv\""))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().contentTypeCompatibleWith("text/csv"))
            .andReturn().getResponse().getContentAsString();
        assertThat(csv).startsWith("date,riderId,name,phoneMasked,event,reason\r\n").contains(rider + ",Ravi Kumar,").contains(",JOINED,");
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = 'EXPORT_DOWNLOADED' AND target_id = ?",
            Integer.class, today)).isPositive();
        mvc.perform(get(FLEET + "/exports/rider-joins-exits").param("date", "20-10-2026").header("Authorization", "Bearer ops"))
            .andExpect(status().isBadRequest());
    }

    private ResultActions statusEvent(UUID rider, String kind, String timing) throws Exception {
        return send(post(FLEET + "/riders/" + rider + "/status-events"), "ops", UUID.randomUUID(), "{\"kind\":\"" + kind + "\"," + timing
            + "\"reason\":\"Customer reports about deliveries\",\"evidenceSummary\":\"Two reports and the call log\","
            + "\"appealPhone\":\"+914000000000\"}");
    }

    private ResultActions send(MockHttpServletRequestBuilder request, String token, UUID key, String body) throws Exception {
        request.header("Authorization", "Bearer " + token).header("Idempotency-Key", key.toString());
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(body);
        }
        return mvc.perform(request);
    }

    private UUID rider(String name) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO fleet_schema.rider (id, name, phone, created_by) VALUES (?, ?, ?, ?)", id, name, phone(), ops);
        return id;
    }

    private UUID activeRider() throws Exception {
        UUID rider = rider("Ravi Kumar");
        db.update("UPDATE fleet_schema.rider SET identity_id = ? WHERE id = ?", UUID.randomUUID(), rider);
        statusEvent(rider, "RESTORE", "").andExpect(status().isCreated());
        return rider;
    }

    private UUID document(UUID rider) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO fleet_schema.rider_document (id, rider_id, type, blob_name, content_type, size_bytes) "
            + "VALUES (?, ?, 'DRIVING_LICENCE', 'riders/x/dl.jpg', 'image/jpeg', 100)", id, rider);
        return id;
    }

    private UUID device(UUID rider, String state) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO fleet_schema.rider_device (id, rider_id, app_version, model, state) VALUES (?, ?, '1.0.0', 'Redmi', ?)",
            id, rider, state);
        return id;
    }

    private String riderStatus(UUID rider) {
        return db.queryForObject("SELECT status FROM fleet_schema.rider WHERE id = ?", String.class, rider);
    }

    private UUID identity(UUID rider) {
        return db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, rider);
    }

    private static String phone() {
        return "+9198" + ThreadLocalRandom.current().nextInt(10_000_000, 99_999_999);
    }
}
