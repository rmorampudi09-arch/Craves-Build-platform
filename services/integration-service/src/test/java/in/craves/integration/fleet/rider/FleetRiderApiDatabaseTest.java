package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.payout.bank.BankDataCipher;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.util.Base64;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** The rider API against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
@WebMvcTest(FleetRiderController.class)
@ContextConfiguration(classes = {FleetRiderController.class, FleetRiderService.class, FleetShiftService.class, FleetPolicyStore.class,
    FleetSignupController.class, FleetSignupService.class, FleetApiAdvice.class, WebSecurityConfiguration.class, CravesJwtAuthenticationFilter.class, FleetRiderApiDatabaseTest.Database.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true"})
class FleetRiderApiDatabaseTest {
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

        @Bean FleetProperties fleetProperties() {
            return FleetDatabase.properties(true);
        }

        @Bean BankDataCipher bankDataCipher(ObjectMapper json) {
            return new BankDataCipher(json, "test", "{\"test\":\"" + Base64.getEncoder().encodeToString(new byte[32]) + "\"}");
        }
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @MockBean JwtVerifier verifier;
    @MockBean FleetStorage storage;

    @Test
    void meIsNotRiderForAnyoneOpsDidNotAdd() throws Exception {
        UUID identity = UUID.randomUUID();
        when(verifier.verify("customer")).thenReturn(new CravesPrincipal(identity, "+919111111111", Set.of("CUSTOMER")));
        mvc.perform(get("/api/v1/rider/me").header("Authorization", "Bearer customer")).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("NOT_RIDER")).andExpect(jsonPath("$.termsVersion").value("2026-10-v1"))
            .andExpect(jsonPath("$.supportPhone").value("+914012345678")).andExpect(jsonPath("$.features.payoutsEnabled").value(false));
    }

    @Test
    void theFirstMeFromTheRidersPhoneLinksThemAndShowsPending() throws Exception {
        String phone = phone();
        UUID rider = UUID.randomUUID();
        db.update("INSERT INTO fleet_schema.rider (id, name, phone, created_by) VALUES (?, 'Sita Devi', ?, ?)", rider, phone, UUID.randomUUID());
        UUID identity = UUID.randomUUID();
        when(verifier.verify("sita")).thenReturn(new CravesPrincipal(identity, phone, Set.of("CUSTOMER")));
        mvc.perform(get("/api/v1/rider/me").header("Authorization", "Bearer sita")).andExpect(status().isOk())
            .andExpect(jsonPath("$.riderId").value(rider.toString())).andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.name").value("Sita Devi")).andExpect(jsonPath("$.minAppVersion").value("1.0.0"))
            .andExpect(jsonPath("$.notice").doesNotExist());
        assertThat(db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, rider)).isEqualTo(identity);
    }

    @Test
    void meForAnActiveRiderWhoAcceptedTheCurrentTerms() throws Exception {
        String token = rider("ACTIVE", "hi");
        accept(token, "2026-10-v1");
        mvc.perform(get("/api/v1/rider/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.language").value("hi"))
            .andExpect(jsonPath("$.termsVersion").value("2026-10-v1")).andExpect(jsonPath("$.acceptedTermsVersion").value("2026-10-v1"))
            .andExpect(jsonPath("$.statusReason").doesNotExist()).andExpect(jsonPath("$.notice").doesNotExist());
    }

    @Test
    void meShowsNewTermsWhenTheRiderAcceptedAnOlderVersion() throws Exception {
        db.update("INSERT INTO fleet_schema.rate_card (version, effective_from, base_paise, base_drop_m, drop_per_km_paise, pickup_free_m, "
            + "pickup_per_km_paise, wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, summary_of_changes, "
            + "created_at) SELECT '2026-09-v1', effective_from, base_paise, base_drop_m, drop_per_km_paise, pickup_free_m, pickup_per_km_paise, "
            + "wait_free_minutes, wait_per_minute_paise, slot_guarantee_per_hour_paise, ranges, summary_of_changes, created_at - INTERVAL '30 days' "
            + "FROM fleet_schema.rate_card WHERE version = '2026-10-v1' ON CONFLICT (version) DO NOTHING");
        String token = rider("ACTIVE", "en");
        db.update("INSERT INTO fleet_schema.rider_terms_acceptance (rider_id, version, language) SELECT id, '2026-09-v1', 'en' "
            + "FROM fleet_schema.rider WHERE identity_id = ?", UUID.fromString(token));
        mvc.perform(get("/api/v1/rider/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.termsVersion").value("2026-10-v1")).andExpect(jsonPath("$.acceptedTermsVersion").value("2026-09-v1"));
    }

    @Test
    void meForAPendingRider() throws Exception {
        mvc.perform(get("/api/v1/rider/me").header("Authorization", "Bearer " + rider("PENDING", "en"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("PENDING")).andExpect(jsonPath("$.acceptedTermsVersion").doesNotExist());
    }

    @Test
    void meForASuspendedRiderShowsTheSafetyPauseWithItsReviewDate() throws Exception {
        String token = rider("SUSPENDED", "en");
        event(token, "SAFETY_PAUSE", "ACTIVE", "SUSPENDED", null, "now() + INTERVAL '48 hours'");
        mvc.perform(get("/api/v1/rider/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("SUSPENDED")).andExpect(jsonPath("$.statusReason").value("A customer reported unsafe riding"))
            .andExpect(jsonPath("$.statusEffectiveAt").exists())
            .andExpect(jsonPath("$.notice.title").value("Paused for a safety review"))
            .andExpect(jsonPath("$.notice.deadline").exists()).andExpect(jsonPath("$.notice.appealPhone").value("+914000000000"))
            .andExpect(jsonPath("$.notice.checking").value("The customer's report and the trip route"));
    }

    @Test
    void meForADeactivatedRiderShowsHowToAppeal() throws Exception {
        String token = rider("DEACTIVATED", "en");
        event(token, "DEACTIVATE", "SUSPENDED", "DEACTIVATED", null, null);
        mvc.perform(get("/api/v1/rider/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DEACTIVATED")).andExpect(jsonPath("$.notice.title").value("Your rider account is closed"))
            .andExpect(jsonPath("$.notice.appealPhone").value("+914000000000")).andExpect(jsonPath("$.notice.deadline").doesNotExist());
    }

    @Test
    void meForAnActiveRiderWithANoticeKeepsThemWorkingAndShowsTheDeadline() throws Exception {
        String token = rider("ACTIVE", "en");
        event(token, "NOTICE", "ACTIVE", "ACTIVE", "now() + INTERVAL '7 days'", null);
        mvc.perform(get("/api/v1/rider/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.statusReason").doesNotExist())
            .andExpect(jsonPath("$.notice.title").value("Notice: we are checking a problem"))
            .andExpect(jsonPath("$.notice.reason").value("A customer reported unsafe riding"))
            .andExpect(jsonPath("$.notice.deadline").exists()).andExpect(jsonPath("$.notice.sentAt").exists());
    }

    @Test
    void profileShowsTheLatestDocumentPerTypeAndTheMaskedAccountForAPendingRider() throws Exception {
        String token = rider("PENDING", "en");
        UUID rider = db.queryForObject("SELECT id FROM fleet_schema.rider WHERE identity_id = ?", UUID.class, UUID.fromString(token));
        db.update("INSERT INTO fleet_schema.rider_document (id, rider_id, type, status, reason, blob_name, content_type, size_bytes, "
            + "uploaded_at, reviewed_at) VALUES (?, ?, 'DRIVING_LICENCE', 'REJECTED', 'The photo is blurry', 'riders/a', 'image/jpeg', 10, "
            + "now() - INTERVAL '1 day', now())", UUID.randomUUID(), rider);
        db.update("INSERT INTO fleet_schema.rider_document (id, rider_id, type, blob_name, content_type, size_bytes) "
            + "VALUES (?, ?, 'PAN', 'riders/b', 'image/jpeg', 10)", UUID.randomUUID(), rider);
        db.update("INSERT INTO fleet_schema.rider_payout_account (id, rider_id, method, encrypted_details, fingerprint, masked_account, "
            + "holder_name, verified_in_person, set_by, set_by_name) VALUES (?, ?, 'UPI', 'k.x', ?, 'ra****@okaxis', 'Ravi Kumar', true, ?, 'Ops')",
            UUID.randomUUID(), rider, "k." + UUID.randomUUID(), UUID.randomUUID());
        mvc.perform(get("/api/v1/rider/profile").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.vehicle.label").value("Two-wheeler"))
            .andExpect(jsonPath("$.documents[0].type").value("DL")).andExpect(jsonPath("$.documents[0].label").value("Driving licence"))
            .andExpect(jsonPath("$.documents[0].status").value("REJECTED")).andExpect(jsonPath("$.documents[0].reason").value("The photo is blurry"))
            .andExpect(jsonPath("$.documents[1].type").value("RC")).andExpect(jsonPath("$.documents[1].status").value("MISSING"))
            .andExpect(jsonPath("$.documents[4].type").value("PAN")).andExpect(jsonPath("$.documents[4].reason").doesNotExist())
            .andExpect(jsonPath("$.documents[5].type").value("BANK")).andExpect(jsonPath("$.documents.length()").value(6))
            .andExpect(jsonPath("$.payoutAccountMasked").value("ra****@okaxis")).andExpect(jsonPath("$.payoutAccountSubmitted").doesNotExist())
            .andExpect(jsonPath("$.insurance.claimPhone").value("+914012345678"));
    }

    @Test
    void homeShowsTheNextSlotItsGuaranteeTheRestPointAndTheBanner() throws Exception {
        String token = rider("ACTIVE", "en");
        db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, rest_point_name, rest_point_area, "
            + "guaranteed_per_hour_paise) SELECT ?, id, 'Madhapur and Kondapur', now() + INTERVAL '2 hours', now() + INTERVAL '5 hours', "
            + "'Amma''s Kitchen', 'Madhapur', 8000 FROM fleet_schema.rider WHERE identity_id = ?", UUID.randomUUID(), UUID.fromString(token));
        db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at, guaranteed_per_hour_paise, status) "
            + "SELECT ?, id, 'Cancelled zone', now() + INTERVAL '1 hour', now() + INTERVAL '2 hours', 9000, 'CANCELLED' "
            + "FROM fleet_schema.rider WHERE identity_id = ?", UUID.randomUUID(), UUID.fromString(token));
        db.update("INSERT INTO fleet_schema.ops_banner (id, tone, text, starts_at, ends_at) VALUES (?, 'warning', "
            + "'Heavy rain expected after 8 pm. Stop whenever you need to.', now() - INTERVAL '1 minute', now() + INTERVAL '1 hour')",
            UUID.randomUUID());
        mvc.perform(get("/api/v1/rider/home").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.online").value(false)).andExpect(jsonPath("$.todayEarningsPaise").value(0))
            .andExpect(jsonPath("$.todayTrips").value(0)).andExpect(jsonPath("$.nextSlot.zoneName").value("Madhapur and Kondapur"))
            .andExpect(jsonPath("$.guaranteedPerHourPaise").value(8000)).andExpect(jsonPath("$.restPoint.area").value("Madhapur"))
            .andExpect(jsonPath("$.banner.tone").value("warning")).andExpect(jsonPath("$.zoneName").doesNotExist())
            .andExpect(jsonPath("$.slotEndsAt").doesNotExist()).andExpect(jsonPath("$.shiftStartedAt").doesNotExist());
    }

    @Test
    void homeShowsTheOpenShiftTheRunningSlotAndTheTripInProgress() throws Exception {
        String token = rider("ACTIVE", "en");
        UUID rider = db.queryForObject("SELECT id FROM fleet_schema.rider WHERE identity_id = ?", UUID.class, UUID.fromString(token));
        db.update("INSERT INTO fleet_schema.rider_slot (id, rider_id, zone_name, starts_at, ends_at) "
            + "VALUES (?, ?, 'Madhapur and Kondapur', now() - INTERVAL '1 hour', now() + INTERVAL '2 hours')", UUID.randomUUID(), rider);
        UUID shift = UUID.randomUUID();
        db.update("INSERT INTO fleet_schema.rider_shift (id, rider_id, credential_hash, credential_expires_at, started_at) "
            + "VALUES (?, ?, ?, now() + INTERVAL '11 hours', now() - INTERVAL '1 hour')", shift, rider, FleetShiftService.hash(shift.toString()));
        UUID trip = UUID.randomUUID();
        db.update("""
            INSERT INTO fleet_schema.trip (id, chef_sub_order_id, order_id, chef_id, order_code, items_count, kitchen_name, kitchen_area,
              kitchen_address, kitchen_lat, kitchen_lng, chef_phone, customer_first_name, customer_phone, drop_area, drop_address, drop_lat,
              drop_lng, state, rider_id)
            VALUES (?, ?, ?, ?, '#0A1B2C3D', 2, 'Amma''s Kitchen', 'Madhapur', 'Road 1', 17.44, 78.39, '+919000000000', 'Priya',
              '+919000000001', 'Kondapur', 'Flat 2', 17.46, 78.36, 'AT_PICKUP', ?)""",
            trip, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), rider);
        mvc.perform(get("/api/v1/rider/home").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.online").value(true)).andExpect(jsonPath("$.shiftStartedAt").exists())
            .andExpect(jsonPath("$.zoneName").value("Madhapur and Kondapur")).andExpect(jsonPath("$.slotEndsAt").exists())
            .andExpect(jsonPath("$.activeTripId").value(trip.toString()));

        // Ops approved another phone: the shift's credential is revoked, so the rider is offline.
        db.update("UPDATE fleet_schema.rider_shift SET credential_revoked_at = now() WHERE id = ?", shift);
        mvc.perform(get("/api/v1/rider/home").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.online").value(false)).andExpect(jsonPath("$.shiftStartedAt").doesNotExist())
            .andExpect(jsonPath("$.zoneName").value("Madhapur and Kondapur"));
    }

    @Test
    void documentUploadStoresAPendingPhotoAndRefusesAadhaar() throws Exception {
        String token = rider("ACTIVE", "en");
        byte[] jpeg = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0x01, 0x02};
        mvc.perform(multipart("/api/v1/rider/documents").file(new MockMultipartFile("photo", "a.jpg", "image/jpeg", jpeg))
                .param("type", "AADHAAR").header("Authorization", "Bearer " + token))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("DOCUMENT_TYPE_NOT_ALLOWED"));
        mvc.perform(multipart("/api/v1/rider/documents").file(new MockMultipartFile("photo", "a.jpg", "image/jpeg", "not a jpeg".getBytes()))
                .param("type", "DL").header("Authorization", "Bearer " + token))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("DOCUMENT_FILE_INVALID"));
        mvc.perform(multipart("/api/v1/rider/documents").file(new MockMultipartFile("photo", "a.jpg", "image/jpeg", jpeg))
                .param("type", "DL").header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());

        Map<String, Object> stored = db.queryForMap("SELECT d.type, d.status, d.blob_name, d.size_bytes FROM fleet_schema.rider_document d "
            + "JOIN fleet_schema.rider r ON r.id = d.rider_id WHERE r.identity_id = ?", UUID.fromString(token));
        assertThat(stored).containsEntry("type", "DRIVING_LICENCE").containsEntry("status", "PENDING").containsEntry("size_bytes", 5);
        verify(storage).upload(eq((String) stored.get("blob_name")), eq(jpeg), eq("image/jpeg"), eq(false));
        assertThat((String) stored.get("blob_name")).startsWith("riders/").contains("/documents/driving_licence/");
    }

    @Test
    void termsShowTheDraftRateCardInTheRidersLanguage() throws Exception {
        String token = rider("ACTIVE", "te");
        mvc.perform(get("/api/v1/rider/terms").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value("2026-10-v1")).andExpect(jsonPath("$.draft").value(true))
            .andExpect(jsonPath("$.rateCardLines[0].label").value("Base pay, first 2 km of the drop"))
            .andExpect(jsonPath("$.rateCardLines[0].value").value("₹40"))
            .andExpect(jsonPath("$.grievanceLines[0].value").value("+914012345678"))
            .andExpect(jsonPath("$.summaryOfChanges[0]").exists()).andExpect(jsonPath("$.upcoming").doesNotExist());
    }

    @Test
    void onlyTheCurrentVersionCanBeAccepted() throws Exception {
        String token = rider("ACTIVE", "en");
        mvc.perform(post("/api/v1/rider/terms/accept").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"version\":\"2026-09-v1\"}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TERMS_CHANGED"));
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/v1/rider/terms/accept").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"version\":\"2026-10-v1\"}")).andExpect(status().isNoContent());
        }
        assertThat(db.queryForObject("SELECT count(*) FROM fleet_schema.rider_terms_acceptance a JOIN fleet_schema.rider r "
            + "ON r.id = a.rider_id WHERE r.identity_id = ?", Integer.class, UUID.fromString(token))).isEqualTo(1);
    }

    @Test
    void aRiderOpsAddedReadsTheProfileAndSendsDocumentsBeforeTheRiderRoleIsGranted() throws Exception {
        UUID identity = UUID.randomUUID();
        String phone = phone();
        db.update("INSERT INTO fleet_schema.rider (id, identity_id, name, phone, created_by) VALUES (?, ?, 'Sita Devi', ?, ?)",
            UUID.randomUUID(), identity, phone, UUID.randomUUID());
        when(verifier.verify("pending")).thenReturn(new CravesPrincipal(identity, phone, Set.of("CUSTOMER")));
        byte[] jpeg = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0x01};
        mvc.perform(multipart("/api/v1/rider/documents").file(new MockMultipartFile("photo", "dl.jpg", "image/jpeg", jpeg)).param("type", "DL")
            .header("Authorization", "Bearer pending")).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/rider/profile").header("Authorization", "Bearer pending")).andExpect(status().isOk())
            .andExpect(jsonPath("$.documents[0].type").value("DL")).andExpect(jsonPath("$.documents[0].status").value("PENDING"));
        for (String path : java.util.List.of("/api/v1/rider/home", "/api/v1/rider/terms")) {
            mvc.perform(get(path).header("Authorization", "Bearer pending")).andExpect(status().isForbidden());
        }

        when(verifier.verify("stranger")).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000007", Set.of("CUSTOMER")));
        mvc.perform(get("/api/v1/rider/profile").header("Authorization", "Bearer stranger")).andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("NOT_A_RIDER"));
        mvc.perform(multipart("/api/v1/rider/documents").file(new MockMultipartFile("photo", "dl.jpg", "image/jpeg", jpeg)).param("type", "AADHAAR")
            .header("Authorization", "Bearer stranger")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_A_RIDER"));
    }

    @Test
    void aRiderRoleWithoutALinkedRiderIsRefused() throws Exception {
        UUID identity = UUID.randomUUID();
        when(verifier.verify(identity.toString())).thenReturn(new CravesPrincipal(identity, "+919000000009", Set.of("RIDER")));
        mvc.perform(get("/api/v1/rider/terms").header("Authorization", "Bearer " + identity))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_A_RIDER"));
    }

    @Test
    void anyoneWithAnIndianNumberSignsUpAsAPendingRiderAndSeesTheDocumentsToSend() throws Exception {
        UUID identity = UUID.randomUUID();
        when(verifier.verify("new")).thenReturn(new CravesPrincipal(identity, phone(), Set.of("CUSTOMER")));
        String body = "{\"name\":\"  Ravi   Kumar \",\"language\":\"te\",\"vehicleKind\":\"ELECTRIC\",\"vehicleRegNumber\":\"ts 09-ea 1234\","
            + "\"adult\":true}";
        for (int i = 0; i < 2; i++) {
            apply("new", body).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.name").value("Ravi Kumar")).andExpect(jsonPath("$.language").value("te"));
        }
        assertThat(db.queryForMap("SELECT count(*) AS riders, max(vehicle_kind) AS kind, max(vehicle_reg_number) AS plate, "
            + "max(vehicle_label) AS label, max(status) AS status FROM fleet_schema.rider WHERE identity_id = ?", identity))
            .containsEntry("riders", 1L).containsEntry("kind", "ELECTRIC").containsEntry("plate", "TS09EA1234")
            .containsEntry("label", "Electric two-wheeler").containsEntry("status", "PENDING");
        // An electric two-wheeler needs no PUC; nothing is sent yet.
        mvc.perform(get("/api/v1/rider/profile").header("Authorization", "Bearer new")).andExpect(status().isOk())
            .andExpect(jsonPath("$.documents.length()").value(5)).andExpect(jsonPath("$.documents[0].type").value("DL"))
            .andExpect(jsonPath("$.documents[3].type").value("PAN"))
            .andExpect(jsonPath("$.documents[*].status").value(org.hamcrest.Matchers.everyItem(org.hamcrest.Matchers.is("MISSING"))))
            .andExpect(jsonPath("$.vehicle.label").value("Electric two-wheeler"));
        // Signing up grants nothing: work routes still need the RIDER role ops grants on activation.
        mvc.perform(get("/api/v1/rider/home").header("Authorization", "Bearer new")).andExpect(status().isForbidden());

        when(verifier.verify("cyclist")).thenReturn(new CravesPrincipal(UUID.randomUUID(), phone(), Set.of("CUSTOMER")));
        apply("cyclist", "{\"name\":\"Sita Devi\",\"language\":\"hi\",\"vehicleKind\":\"BICYCLE\",\"adult\":true}")
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));
        mvc.perform(get("/api/v1/rider/profile").header("Authorization", "Bearer cyclist")).andExpect(status().isOk())
            .andExpect(jsonPath("$.documents.length()").value(2)).andExpect(jsonPath("$.documents[0].type").value("PAN"))
            .andExpect(jsonPath("$.vehicle.regNumberMasked").doesNotExist());
    }

    @Test
    void signUpRefusesMinorsBadPlatesAPhoneAnotherAccountHoldsAndAccountsWithoutAPhone() throws Exception {
        when(verifier.verify("teen")).thenReturn(new CravesPrincipal(UUID.randomUUID(), phone(), Set.of("CUSTOMER")));
        String body = "{\"name\":\"Ravi Kumar\",\"language\":\"en\",\"vehicleKind\":\"PETROL\",\"vehicleRegNumber\":\"%s\",\"adult\":%s}";
        apply("teen", body.formatted("TS09EA1234", false)).andExpect(status().isBadRequest());
        apply("teen", body.formatted("NOT A PLATE", true)).andExpect(status().isBadRequest());
        apply("teen", "{\"name\":\"Ravi Kumar\",\"language\":\"en\",\"vehicleKind\":\"TRUCK\",\"adult\":true}").andExpect(status().isBadRequest());

        String phone = phone();
        db.update("INSERT INTO fleet_schema.rider (id, identity_id, name, phone, created_by) VALUES (?, ?, 'Sita Devi', ?, ?)",
            UUID.randomUUID(), UUID.randomUUID(), phone, UUID.randomUUID());
        when(verifier.verify("other")).thenReturn(new CravesPrincipal(UUID.randomUUID(), phone, Set.of("CUSTOMER")));
        apply("other", body.formatted("TS09EA1234", true)).andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PHONE_IN_USE"));

        when(verifier.verify("email")).thenReturn(new CravesPrincipal(UUID.randomUUID(), null, Set.of("CUSTOMER")));
        apply("email", body.formatted("TS09EA1234", true)).andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("PHONE_REQUIRED"));
    }

    @Test
    void aPendingRiderSendsAPayoutAccountThatWaitsForOps() throws Exception {
        UUID ravi = UUID.randomUUID();
        when(verifier.verify("ravi")).thenReturn(new CravesPrincipal(ravi, phone(), Set.of("CUSTOMER")));
        apply("ravi", "{\"name\":\"Ravi Kumar\",\"language\":\"en\",\"vehicleKind\":\"BICYCLE\",\"adult\":true}").andExpect(status().isOk());
        payoutAccount("ravi", "{\"method\":\"UPI\",\"holderName\":\"Sita Devi\",\"upiId\":\"sita@okaxis\"}")
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("HOLDER_NAME_MISMATCH"));
        payoutAccount("ravi", "{\"method\":\"UPI\",\"holderName\":\"Ravi Kumar\",\"upiId\":\"not a upi\"}").andExpect(status().isBadRequest());
        String upi = "ravi" + ThreadLocalRandom.current().nextInt(1_000_000) + "@okaxis";
        payoutAccount("ravi", "{\"method\":\"UPI\",\"holderName\":\"Ravi Kumar\",\"upiId\":\"" + upi.toUpperCase() + "\"}")
            .andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/rider/profile").header("Authorization", "Bearer ravi")).andExpect(status().isOk())
            .andExpect(jsonPath("$.payoutAccountSubmitted").value("ra****@okaxis")).andExpect(jsonPath("$.payoutAccountMasked").doesNotExist());

        // A second one replaces the first; still nothing is paid until ops confirms.
        String number = String.valueOf(ThreadLocalRandom.current().nextLong(100_000_000_000L, 999_999_999_999L));
        payoutAccount("ravi", "{\"method\":\"BANK\",\"holderName\":\"Mr Ravi Kumar\",\"accountNumber\":\"" + number.substring(0, 6) + " "
            + number.substring(6) + "\",\"ifsc\":\"sbin0001234\"}").andExpect(status().isNoContent());
        String accounts = "FROM fleet_schema.rider_payout_account a JOIN fleet_schema.rider r ON r.id = a.rider_id WHERE r.identity_id = ?";
        assertThat(db.queryForList("SELECT a.state || ':' || a.method || ':' || a.verified_in_person || ':' || a.masked_account " + accounts
            + " ORDER BY a.set_at", String.class, ravi))
            .containsExactly("REPLACED:UPI:false:ra****@okaxis", "SUBMITTED:BANK:false:xxxxxx" + number.substring(number.length() - 4));
        assertThat(db.queryForObject("SELECT string_agg(a.encrypted_details || a.masked_account, '') " + accounts, String.class, ravi))
            .doesNotContain(number).doesNotContain(upi);

        // The same account typed by another rider, even at another branch, is refused.
        when(verifier.verify("sita")).thenReturn(new CravesPrincipal(UUID.randomUUID(), phone(), Set.of("CUSTOMER")));
        apply("sita", "{\"name\":\"Sita Devi\",\"language\":\"en\",\"vehicleKind\":\"BICYCLE\",\"adult\":true}").andExpect(status().isOk());
        payoutAccount("sita", "{\"method\":\"BANK\",\"holderName\":\"Sita Devi\",\"accountNumber\":\"" + number + "\",\"ifsc\":\"SBIN0009999\"}")
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PAYOUT_ACCOUNT_NOT_UNIQUE"));

        when(verifier.verify("stranger")).thenReturn(new CravesPrincipal(UUID.randomUUID(), phone(), Set.of("CUSTOMER")));
        payoutAccount("stranger", "{\"method\":\"UPI\",\"holderName\":\"Ravi Kumar\",\"upiId\":\"x1@okaxis\"}")
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_A_RIDER"));
    }

    org.springframework.test.web.servlet.ResultActions apply(String token, String body) throws Exception {
        return mvc.perform(post("/api/v1/rider/apply").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
            .content(body));
    }

    org.springframework.test.web.servlet.ResultActions payoutAccount(String token, String body) throws Exception {
        return mvc.perform(post("/api/v1/rider/payout-account").header("Authorization", "Bearer " + token)
            .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    void accept(String token, String version) throws Exception {
        mvc.perform(post("/api/v1/rider/terms/accept").header("Authorization", "Bearer " + token)
            .contentType(MediaType.APPLICATION_JSON).content("{\"version\":\"" + version + "\"}")).andExpect(status().isNoContent());
    }

    void event(String token, String kind, String before, String after, String deadline, String reviewBy) {
        db.update("INSERT INTO fleet_schema.rider_status_event (id, rider_id, kind, reason, evidence_summary, deadline, review_by, "
            + "appeal_phone, approver_id, approver_name, status_before, status_after, created_at) SELECT ?, id, ?, "
            + "'A customer reported unsafe riding', 'The customer''s report and the trip route', " + deadline + ", " + reviewBy + ", "
            + "'+914000000000', ?, 'Admin +91 90xxxxx001', ?, ?, now() FROM fleet_schema.rider WHERE identity_id = ?",
            UUID.randomUUID(), kind, UUID.randomUUID(), before, after, UUID.fromString(token));
    }

    static String phone() {
        return "+9197" + ThreadLocalRandom.current().nextInt(10_000_000, 99_999_999);
    }

    /** A linked rider with the RIDER role; the bearer token is the identity id. */
    String rider(String status, String language) {
        UUID identity = UUID.randomUUID();
        String phone = phone();
        db.update("INSERT INTO fleet_schema.rider (id, identity_id, name, phone, language, status, created_by) VALUES (?, ?, 'Ravi Kumar', ?, ?, ?, ?)",
            UUID.randomUUID(), identity, phone, language, status, UUID.randomUUID());
        when(verifier.verify(identity.toString())).thenReturn(new CravesPrincipal(identity, phone, Set.of("CUSTOMER", "RIDER")));
        return identity.toString();
    }
}
