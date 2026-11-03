package in.craves.subscription.erasure;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.subscription.config.SecurityConfig;
import in.craves.subscription.erasure.AccountErasureDtos.Blocker;
import in.craves.subscription.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.subscription.erasure.AccountErasureDtos.Scope;
import in.craves.subscription.order.OccurrenceOrderProperties;
import in.craves.subscription.security.CravesJwtAuthenticationFilter;
import in.craves.subscription.security.JwtVerifier;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** The three erasure calls are private: no bearer token, only the internal secret, and bad input is a 400. */
@WebMvcTest(AccountErasureController.class)
@Import({SecurityConfig.class, CravesJwtAuthenticationFilter.class})
class AccountErasureControllerTest {
    private static final String BASE = "/internal/v1/account-erasure";
    private static final String SECRET = "right-internal-secret";
    private static final UUID IDENTITY = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID REQUEST = UUID.fromString("44444444-4444-4444-8444-444444444444");

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private JwtVerifier jwtVerifier;

    @MockBean
    private OccurrenceOrderProperties properties;

    @MockBean
    private AccountErasureService service;

    @BeforeEach
    void rightSecretIsAccepted() {
        when(properties.validInternalAccess(SECRET)).thenReturn(true);
    }

    private static String body(String scope) {
        return "{\"requestId\":\"" + REQUEST + "\",\"identityId\":\"" + IDENTITY + "\",\"scope\":\"" + scope + "\"}";
    }

    private MockHttpServletRequestBuilder call(String path, String json) {
        return post(BASE + path).header("X-Craves-Internal-Secret", SECRET).contentType(MediaType.APPLICATION_JSON).content(json);
    }

    @Test
    void everyCallNeedsTheInternalSecret() throws Exception {
        for (String path : List.of("/blockers", "/prepare", "")) {
            mockMvc.perform(post(BASE + path).contentType(MediaType.APPLICATION_JSON).content(body("CUSTOMER")))
                .andExpect(status().isUnauthorized());
            mockMvc.perform(post(BASE + path).header("X-Craves-Internal-Secret", "wrong").contentType(MediaType.APPLICATION_JSON)
                    .content(body("CUSTOMER")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid internal service credential"));
        }
        verifyNoInteractions(service);
    }

    @Test
    void anUnknownScopeIsABadRequest() throws Exception {
        for (String path : List.of("/blockers", "/prepare", "")) {
            mockMvc.perform(call(path, body("OTHER"))).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test
    void aMissingFieldIsABadRequest() throws Exception {
        mockMvc.perform(call("", "{\"requestId\":\"" + REQUEST + "\",\"scope\":\"CUSTOMER\"}")).andExpect(status().isBadRequest());
        mockMvc.perform(call("/blockers", "{\"scope\":\"CUSTOMER\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void blockersAreEmptyForSomeoneWithNothing() throws Exception {
        when(service.blockers(IDENTITY, Scope.CUSTOMER)).thenReturn(List.of());

        mockMvc.perform(call("/blockers", "{\"identityId\":\"" + IDENTITY + "\",\"scope\":\"CUSTOMER\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("subscription"))
            .andExpect(jsonPath("$.blockers").isEmpty());
    }

    @Test
    void blockersListAStillRunningSubscription() throws Exception {
        when(service.blockers(IDENTITY, Scope.ALL)).thenReturn(
            List.of(new Blocker("SUBSCRIPTION_STILL_ACTIVE", "1 meal plan subscription(s) are still running")));

        mockMvc.perform(call("/blockers", "{\"identityId\":\"" + IDENTITY + "\",\"scope\":\"ALL\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.blockers[0].code").value("SUBSCRIPTION_STILL_ACTIVE"));
    }

    @Test
    void prepareAnswersDoneWithCounts() throws Exception {
        when(service.prepare(IDENTITY, Scope.ALL, REQUEST)).thenReturn(ErasureResponse.done(Map.of("customer_subscription", 2)));

        mockMvc.perform(call("/prepare", body("ALL")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("subscription"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts.customer_subscription").value(2));
    }

    @Test
    void eraseAnswersDoneOrBlocked() throws Exception {
        when(service.erase(IDENTITY, Scope.CUSTOMER, REQUEST)).thenReturn(ErasureResponse.done(Map.of()));
        when(service.erase(IDENTITY, Scope.CHEF, REQUEST)).thenReturn(
            ErasureResponse.blocked(List.of(new Blocker("PLAN_HAS_ACTIVE_SUBSCRIBERS", "1 subscriber is still on a plan"))));

        mockMvc.perform(call("", body("CUSTOMER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.blockers").doesNotExist());
        mockMvc.perform(call("", body("CHEF")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.service").value("subscription"))
            .andExpect(jsonPath("$.status").value("BLOCKED"))
            .andExpect(jsonPath("$.blockers[0].code").value("PLAN_HAS_ACTIVE_SUBSCRIBERS"))
            .andExpect(jsonPath("$.counts").doesNotExist());
    }
}
