package in.craves.integration.erasure;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.delivery.InternalRequestAuthorizer;
import in.craves.integration.erasure.AccountErasureDtos.Blocker;
import in.craves.integration.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.integration.erasure.AccountErasureDtos.Scope;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The three erasure calls are private: only the internal secret opens them, and bad input is a 400. */
class AccountErasureControllerTest {
    private static final String BASE = "/internal/v1/account-erasure";
    private static final String SECRET = "unit-secret";
    private static final UUID IDENTITY = UUID.fromString("33333333-3333-4333-8333-333333333333");
    private static final UUID REQUEST = UUID.fromString("44444444-4444-4444-8444-444444444444");

    private final AccountErasureService service = mock(AccountErasureService.class);
    private final MockMvc mvc = MockMvcBuilders
        .standaloneSetup(new AccountErasureController(service, new InternalRequestAuthorizer(SECRET))).build();

    private static String body(String scope) {
        return "{\"requestId\":\"" + REQUEST + "\",\"identityId\":\"" + IDENTITY + "\",\"scope\":\"" + scope + "\"}";
    }

    private static MockHttpServletRequestBuilder call(String path, String json) {
        return post(BASE + path).header("X-Craves-Internal-Secret", SECRET)
            .contentType(MediaType.APPLICATION_JSON).content(json);
    }

    @Test
    void everyCallNeedsTheInternalSecret() throws Exception {
        MockMvc unconfigured = MockMvcBuilders
            .standaloneSetup(new AccountErasureController(service, new InternalRequestAuthorizer(""))).build();
        for (String path : List.of("/blockers", "/prepare", "")) {
            mvc.perform(post(BASE + path).contentType(MediaType.APPLICATION_JSON).content(body("CUSTOMER")))
                .andExpect(status().isUnauthorized());
            mvc.perform(post(BASE + path).header("X-Craves-Internal-Secret", "wrong")
                    .contentType(MediaType.APPLICATION_JSON).content(body("CUSTOMER")))
                .andExpect(status().isUnauthorized());
            // No key configured means closed: an empty header must not match an empty key.
            unconfigured.perform(post(BASE + path).header("X-Craves-Internal-Secret", "")
                    .contentType(MediaType.APPLICATION_JSON).content(body("CUSTOMER")))
                .andExpect(status().isServiceUnavailable());
        }
        verifyNoInteractions(service);
    }

    @Test
    void anUnknownScopeIsABadRequest() throws Exception {
        for (String path : List.of("/blockers", "/prepare", "")) {
            mvc.perform(call(path, body("OTHER")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").value("Invalid account erasure request"));
        }
        verifyNoInteractions(service);
    }

    @Test
    void aMissingFieldOrAnUnreadableIdIsABadRequest() throws Exception {
        mvc.perform(call("", "{\"requestId\":\"" + REQUEST + "\",\"scope\":\"CUSTOMER\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.title").value("Invalid account erasure request"));
        mvc.perform(call("/prepare", "{\"identityId\":\"" + IDENTITY + "\",\"scope\":\"CUSTOMER\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(call("/blockers", "{\"scope\":\"CUSTOMER\"}")).andExpect(status().isBadRequest());
        mvc.perform(call("/blockers", "{\"identityId\":\"" + IDENTITY + "\"}")).andExpect(status().isBadRequest());
        mvc.perform(call("/blockers", "{\"identityId\":\"not-a-uuid\",\"scope\":\"CUSTOMER\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.title").value("Invalid account erasure request"));
        mvc.perform(call("/blockers", "")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void blockersAreEmptyForSomeoneWithNothing() throws Exception {
        when(service.blockers(IDENTITY, Scope.CUSTOMER)).thenReturn(List.of());

        mvc.perform(call("/blockers", "{\"identityId\":\"" + IDENTITY + "\",\"scope\":\"CUSTOMER\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("integration"))
            .andExpect(jsonPath("$.blockers").isEmpty());
    }

    @Test
    void blockersListWhatIsStillOpen() throws Exception {
        when(service.blockers(IDENTITY, Scope.ALL)).thenReturn(
            List.of(new Blocker("PAYOUT_ON_HOLD", "Payouts are on hold for this chef")));

        mvc.perform(call("/blockers", "{\"identityId\":\"" + IDENTITY + "\",\"scope\":\"ALL\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.blockers[0].code").value("PAYOUT_ON_HOLD"))
            .andExpect(jsonPath("$.blockers[0].detail").value("Payouts are on hold for this chef"));
    }

    @Test
    void prepareAnswersDoneWithNothingToDo() throws Exception {
        mvc.perform(call("/prepare", body("ALL")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("integration"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts").isEmpty());
        verifyNoInteractions(service);
    }

    @Test
    void eraseAnswersDoneOrBlocked() throws Exception {
        when(service.erase(IDENTITY, Scope.CUSTOMER, REQUEST))
            .thenReturn(ErasureResponse.done(Map.of("payment_order", 2)));
        when(service.erase(IDENTITY, Scope.CHEF, REQUEST)).thenReturn(
            ErasureResponse.blocked(List.of(new Blocker("PAYABLE_UNPAID", "1 chef earning(s) are not paid out yet"))));

        mvc.perform(call("", body("CUSTOMER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("integration"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts.payment_order").value(2))
            .andExpect(jsonPath("$.blockers").doesNotExist());
        mvc.perform(call("", body("CHEF")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.service").value("integration"))
            .andExpect(jsonPath("$.status").value("BLOCKED"))
            .andExpect(jsonPath("$.blockers[0].code").value("PAYABLE_UNPAID"))
            .andExpect(jsonPath("$.counts").doesNotExist());
    }
}
