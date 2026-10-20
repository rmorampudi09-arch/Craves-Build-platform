package in.craves.integration.fleet.rider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
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
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** The rider API against a real database. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
@WebMvcTest(FleetRiderController.class)
@ContextConfiguration(classes = {FleetRiderController.class, FleetRiderService.class, FleetPolicyStore.class, FleetApiAdvice.class,
    WebSecurityConfiguration.class, CravesJwtAuthenticationFilter.class, FleetRiderApiDatabaseTest.Database.class})
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
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @MockBean JwtVerifier verifier;

    @Test
    void termsShowTheDraftRateCardInTheRidersLanguage() throws Exception {
        String token = rider("ACTIVE", "te");
        mvc.perform(get("/api/v1/rider/terms").header("Authorization", "Bearer " + token)).andExpect(status().isOk())
            .andExpect(jsonPath("$.version").value("2026-10-v1")).andExpect(jsonPath("$.draft").value(true))
            .andExpect(jsonPath("$.rateCardLines[0].label").value("Base pay, first 2 km of the drop"))
            .andExpect(jsonPath("$.rateCardLines[0].value").value("₹40"))
            .andExpect(jsonPath("$.grievanceLines[0].value").value("+914012345678"))
            .andExpect(jsonPath("$.summaryOfChanges[0]").exists());
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
    void aRiderRoleWithoutALinkedRiderIsRefused() throws Exception {
        UUID identity = UUID.randomUUID();
        when(verifier.verify(identity.toString())).thenReturn(new CravesPrincipal(identity, "+919000000009", Set.of("RIDER")));
        mvc.perform(get("/api/v1/rider/terms").header("Authorization", "Bearer " + identity))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_A_RIDER"));
    }

    /** A linked rider with the RIDER role; the bearer token is the identity id. */
    String rider(String status, String language) {
        UUID identity = UUID.randomUUID();
        String phone = "+9197" + ThreadLocalRandom.current().nextInt(10_000_000, 99_999_999);
        db.update("INSERT INTO fleet_schema.rider (id, identity_id, name, phone, language, status, created_by) VALUES (?, ?, 'Ravi Kumar', ?, ?, ?, ?)",
            UUID.randomUUID(), identity, phone, language, status, UUID.randomUUID());
        when(verifier.verify(identity.toString())).thenReturn(new CravesPrincipal(identity, phone, Set.of("CUSTOMER", "RIDER")));
        return identity.toString();
    }
}
