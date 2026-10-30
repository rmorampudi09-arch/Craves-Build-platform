package in.craves.advanced.platform;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.support.IntegrationTestBase;
import in.craves.advanced.support.TestTokens;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class PlatformIT extends IntegrationTestBase {

    @Test
    void healthIsPublic() throws Exception {
        mvc.perform(get("/actuator/health/readiness")).andExpect(status().isOk());
    }

    @Test
    void featuresArePublicAndShowTheBrokenModuleAsUnavailable() throws Exception {
        mvc.perform(get("/api/v1/food-lists").header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER"))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/advanced/features"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='food-lists')].available", hasItem(true)))
                .andExpect(jsonPath("$[?(@.id=='broken-feature')].available", hasItem(false)));
    }

    @Test
    void oneBrokenModuleAnswers503WhileOthersServe() throws Exception {
        String token = bearer(UUID.randomUUID(), "CUSTOMER");
        mvc.perform(get("/api/v1/broken-feature/anything").header("Authorization", token))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("FEATURE_UNAVAILABLE"));
        mvc.perform(get("/api/v1/food-lists").header("Authorization", token)).andExpect(status().isOk());
    }

    @Test
    void missingTokenGets401EnvelopeWithCorrelationId() throws Exception {
        mvc.perform(get("/api/v1/food-lists").header("X-Correlation-ID", "test-correlation-123"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("X-Correlation-ID", "test-correlation-123"))
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"))
                .andExpect(jsonPath("$.correlationId").value("test-correlation-123"));
    }

    @Test
    void tokenForAnotherAudienceIsRefused() throws Exception {
        String foreign = TestTokens.token(UUID.randomUUID(), CLOCK.instant(), "someone-else", "CUSTOMER");
        mvc.perform(get("/api/v1/food-lists").header("Authorization", "Bearer " + foreign)).andExpect(status().isUnauthorized());
    }

    @Test
    void unknownPathsAreDenied() throws Exception {
        mvc.perform(get("/internal/anything").header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void moduleStatusIsForStaffOnly() throws Exception {
        mvc.perform(get("/api/v1/advanced/modules").header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER")))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        mvc.perform(get("/api/v1/advanced/modules").header("Authorization", bearer(UUID.randomUUID(), "PLATFORM_ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id=='broken-feature')].state", hasItem("FAILED")));
    }

    @Test
    void malformedJsonIsA400Envelope() throws Exception {
        mvc.perform(post("/api/v1/food-lists").header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }
}
