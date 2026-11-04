package in.craves.userchef.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.userchef.config.AuthInternalClientProperties;
import in.craves.userchef.exception.AppErrorHandler;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.service.AccountErasureService;
import in.craves.userchef.service.AccountErasureService.Scope;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class InternalAccountErasureControllerTest {
    private static final String HEADER = "X-Craves-Internal-Secret";
    private final AccountErasureService service = mock(AccountErasureService.class);
    private final MockMvc mvc;
    private final UUID requestId = UUID.randomUUID();
    private final UUID identityId = UUID.randomUUID();

    InternalAccountErasureControllerTest() {
        AuthInternalClientProperties properties = new AuthInternalClientProperties();
        properties.setServiceSecret("unit-secret");
        mvc = MockMvcBuilders.standaloneSetup(new InternalAccountErasureController(service, new InternalRequestAuthorizer(properties)))
            .setControllerAdvice(new AppErrorHandler())
            .build();
    }

    private String body(String scope) {
        return "{\"requestId\":\"" + requestId + "\",\"identityId\":\"" + identityId + "\",\"scope\":\"" + scope + "\"}";
    }

    @Test
    void allThreeCallsNeedTheInternalSecret() throws Exception {
        for (String path : new String[] {"/blockers", "/prepare", ""}) {
            mvc.perform(post("/internal/v1/account-erasure" + path).contentType(MediaType.APPLICATION_JSON).content(body("ALL")))
                .andExpect(status().isUnauthorized());
            mvc.perform(post("/internal/v1/account-erasure" + path).contentType(MediaType.APPLICATION_JSON)
                    .header(HEADER, "wrong").content(body("ALL")))
                .andExpect(status().isUnauthorized());
        }
        verifyNoInteractions(service);
    }

    @Test
    void blockersAreAlwaysEmpty() throws Exception {
        mvc.perform(post("/internal/v1/account-erasure/blockers").contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON).header(HEADER, "unit-secret")
                .content("{\"identityId\":\"" + identityId + "\",\"scope\":\"CHEF\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("user-chef"))
            .andExpect(jsonPath("$.blockers").isEmpty());
        verifyNoInteractions(service);
    }

    @Test
    void prepareIsDoneWithEmptyCountsAndTouchesNothing() throws Exception {
        mvc.perform(post("/internal/v1/account-erasure/prepare").contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON).header(HEADER, "unit-secret").content(body("CUSTOMER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("user-chef"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts").isEmpty());
        verifyNoInteractions(service);
    }

    @Test
    void eraseReturnsTheServiceCounts() throws Exception {
        Map<String, Integer> counts = new LinkedHashMap<>();
        counts.put("customer_profile", 1);
        counts.put("customer_address", 3);
        when(service.erase(eq(identityId), eq(Scope.CUSTOMER), eq(requestId))).thenReturn(counts);

        mvc.perform(post("/internal/v1/account-erasure").contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON).header(HEADER, "unit-secret").content(body("CUSTOMER")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("user-chef"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts.customer_profile").value(1))
            .andExpect(jsonPath("$.counts.customer_address").value(3));
        verify(service).erase(identityId, Scope.CUSTOMER, requestId);
    }

    @Test
    void unknownScopeMissingFieldOrBrokenBodyIsABadRequestThatNeverEchoesTheInput() throws Exception {
        String[] bad = {
            body("EVERYTHING"),
            "{\"requestId\":\"" + requestId + "\",\"scope\":\"ALL\"}",
            "{\"requestId\":\"" + requestId + "\",\"identityId\":\"" + identityId + "\"}",
            "{\"requestId\":\"" + requestId + "\",\"identityId\":\"not-a-uuid\",\"scope\":\"ALL\"}",
            "{not json",
        };
        for (String payload : bad) {
            mvc.perform(post("/internal/v1/account-erasure").contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON).header(HEADER, "unit-secret").content(payload))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ACCOUNT_ERASURE_REQUEST_INVALID"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("EVERYTHING"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("not-a-uuid"))));
        }
        mvc.perform(post("/internal/v1/account-erasure").contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON).header(HEADER, "unit-secret")
                .content("{\"identityId\":\"" + identityId + "\",\"scope\":\"ALL\"}"))
            .andExpect(status().isBadRequest());
        verify(service, org.mockito.Mockito.never()).erase(any(), any(), any());
    }
}
