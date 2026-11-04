package in.craves.notification.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.notification.erasure.AccountErasureService;
import in.craves.notification.erasure.AccountErasureService.Scope;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class InternalAccountErasureControllerTest {
    private static final String KEY = "unit-test-internal-key";
    private static final String BASE = "/internal/v1/account-erasure";
    private static final UUID REQUEST = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID IDENTITY = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final String ERASE = """
        {"requestId":"%s","identityId":"%s","scope":"ALL"}""".formatted(REQUEST, IDENTITY);

    private final AccountErasureService service = mock(AccountErasureService.class);

    @Test
    void allThreeRoutesRefuseAMissingWrongOrBlankInternalKey() throws Exception {
        MockMvc mvc = mvc(KEY);
        for (String path : new String[] {BASE + "/blockers", BASE + "/prepare", BASE}) {
            mvc.perform(json(path, ERASE)).andExpect(status().isForbidden());
            mvc.perform(json(path, ERASE).header("X-Craves-Internal-Key", "wrong-key")).andExpect(status().isForbidden());
        }
        // a service with no key configured refuses even a blank header
        for (String path : new String[] {BASE + "/blockers", BASE + "/prepare", BASE}) {
            mvc("").perform(json(path, ERASE).header("X-Craves-Internal-Key", "")).andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }

    @Test
    void blockersAreAlwaysNone() throws Exception {
        mvc(KEY).perform(authed(BASE + "/blockers", """
                {"identityId":"%s","scope":"CHEF"}""".formatted(IDENTITY)))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"service\":\"notification\",\"blockers\":[]}", true));
        verifyNoInteractions(service);
    }

    @Test
    void prepareIsDoneWithEmptyCountsAndTouchesNothing() throws Exception {
        mvc(KEY).perform(authed(BASE + "/prepare", ERASE))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"service\":\"notification\",\"status\":\"DONE\",\"counts\":{}}", true));
        verifyNoInteractions(service);
    }

    @Test
    void eraseAnswersDoneWithTheCountsOfTheService() throws Exception {
        when(service.erase(any(), any(), any())).thenReturn(Map.of("in_app_notification", 3, "push_device_registration", 1));

        mvc(KEY).perform(authed(BASE, ERASE))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("notification"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts.in_app_notification").value(3))
            .andExpect(jsonPath("$.counts.push_device_registration").value(1))
            .andExpect(jsonPath("$.blockers").doesNotExist());
        verify(service).erase(IDENTITY, Scope.ALL, REQUEST);
    }

    @Test
    void anUnknownScopeAMissingFieldOrABadIdIsA400() throws Exception {
        MockMvc mvc = mvc(KEY);
        for (String body : new String[] {
            ERASE.replace("ALL", "EVERYONE"),
            ERASE.replace("\"scope\":\"ALL\"", "\"scope\":null"),
            ERASE.replace("\"identityId\":\"" + IDENTITY + "\",", ""),
            ERASE.replace(IDENTITY.toString(), "not-a-uuid"),
            "{",
        }) {
            for (String path : new String[] {BASE + "/blockers", BASE + "/prepare", BASE}) {
                mvc.perform(authed(path, body)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
            }
        }
        // erase and prepare also need the requestId; blockers does not
        String noRequestId = ERASE.replace("\"requestId\":\"" + REQUEST + "\",", "");
        mvc.perform(authed(BASE, noRequestId)).andExpect(status().isBadRequest());
        mvc.perform(authed(BASE + "/prepare", noRequestId)).andExpect(status().isBadRequest());
        mvc.perform(authed(BASE + "/blockers", noRequestId)).andExpect(status().isOk());
        verifyNoInteractions(service);
    }

    private MockMvc mvc(String key) {
        return MockMvcBuilders.standaloneSetup(new InternalAccountErasureController(service, key)).build();
    }

    private static MockHttpServletRequestBuilder json(String path, String body) {
        return post(path).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static MockHttpServletRequestBuilder authed(String path, String body) {
        return json(path, body).header("X-Craves-Internal-Key", KEY);
    }
}
