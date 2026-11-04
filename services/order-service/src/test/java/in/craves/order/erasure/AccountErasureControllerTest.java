package in.craves.order.erasure;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.order.erasure.AccountErasureDtos.Blocker;
import in.craves.order.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.order.erasure.AccountErasureDtos.Scope;
import in.craves.order.web.OrderApiExceptionHandler;
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
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new AccountErasureController(service, SECRET))
        .setControllerAdvice(new OrderApiExceptionHandler()).build();

    private static String body(String scope) {
        return "{\"requestId\":\"" + REQUEST + "\",\"identityId\":\"" + IDENTITY + "\",\"scope\":\"" + scope + "\"}";
    }

    private static MockHttpServletRequestBuilder call(String path, String json) {
        return post(BASE + path).header("X-Craves-Internal-Secret", SECRET).contentType(MediaType.APPLICATION_JSON).content(json);
    }

    @Test
    void everyCallNeedsTheInternalSecret() throws Exception {
        MockMvc unconfigured = MockMvcBuilders.standaloneSetup(new AccountErasureController(service, "")).build();
        for (String path : List.of("/blockers", "/prepare", "")) {
            mvc.perform(post(BASE + path).contentType(MediaType.APPLICATION_JSON).content(body("CUSTOMER")))
                .andExpect(status().isForbidden());
            mvc.perform(post(BASE + path).header("X-Craves-Internal-Secret", "wrong")
                    .contentType(MediaType.APPLICATION_JSON).content(body("CUSTOMER")))
                .andExpect(status().isForbidden());
            // Not configured means closed: an empty header must not match an empty key.
            unconfigured.perform(post(BASE + path).header("X-Craves-Internal-Secret", "")
                    .contentType(MediaType.APPLICATION_JSON).content(body("CUSTOMER")))
                .andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }

    @Test
    void anUnknownScopeIsABadRequest() throws Exception {
        for (String path : List.of("/blockers", "/prepare", "")) {
            mvc.perform(call(path, body("OTHER")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_ERASURE_REQUEST"));
        }
        verifyNoInteractions(service);
    }

    @Test
    void aMissingFieldOrAnUnreadableIdIsABadRequest() throws Exception {
        mvc.perform(call("", "{\"requestId\":\"" + REQUEST + "\",\"scope\":\"CUSTOMER\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("INVALID_ERASURE_REQUEST"));
        mvc.perform(call("/prepare", "{\"identityId\":\"" + IDENTITY + "\",\"scope\":\"CUSTOMER\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(call("/blockers", "{\"scope\":\"CUSTOMER\"}")).andExpect(status().isBadRequest());
        mvc.perform(call("/blockers", "{\"identityId\":\"" + IDENTITY + "\"}")).andExpect(status().isBadRequest());
        mvc.perform(call("/blockers", "{\"identityId\":\"not-a-uuid\",\"scope\":\"CUSTOMER\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("INVALID_ERASURE_REQUEST"));
        mvc.perform(call("/blockers", "")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test
    void blockersAreEmptyForSomeoneWithNothing() throws Exception {
        when(service.blockers(IDENTITY, Scope.CUSTOMER)).thenReturn(List.of());

        mvc.perform(call("/blockers", "{\"identityId\":\"" + IDENTITY + "\",\"scope\":\"CUSTOMER\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("order"))
            .andExpect(jsonPath("$.blockers").isEmpty());
    }

    @Test
    void blockersListAnOrderThatIsStillOnItsWay() throws Exception {
        when(service.blockers(IDENTITY, Scope.ALL)).thenReturn(
            List.of(new Blocker("ORDER_IN_PROGRESS", "1 order(s) are still in progress")));

        mvc.perform(call("/blockers", "{\"identityId\":\"" + IDENTITY + "\",\"scope\":\"ALL\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.blockers[0].code").value("ORDER_IN_PROGRESS"));
    }

    @Test
    void prepareAnswersDoneWithNothingToDo() throws Exception {
        mvc.perform(call("/prepare", body("ALL")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("order"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts").isEmpty());
        verifyNoInteractions(service);
    }

    @Test
    void eraseAnswersDoneOrBlocked() throws Exception {
        when(service.erase(IDENTITY, Scope.CUSTOMER, REQUEST)).thenReturn(ErasureResponse.done(Map.of("cart", 1)));
        when(service.erase(IDENTITY, Scope.CHEF, REQUEST)).thenReturn(
            ErasureResponse.blocked(List.of(new Blocker("KITCHEN_ORDER_IN_PROGRESS", "1 order(s) are still in progress"))));

        mvc.perform(call("", body("CUSTOMER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("order"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts.cart").value(1))
            .andExpect(jsonPath("$.blockers").doesNotExist());
        mvc.perform(call("", body("CHEF")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.service").value("order"))
            .andExpect(jsonPath("$.status").value("BLOCKED"))
            .andExpect(jsonPath("$.blockers[0].code").value("KITCHEN_ORDER_IN_PROGRESS"))
            .andExpect(jsonPath("$.counts").doesNotExist());
    }
}
