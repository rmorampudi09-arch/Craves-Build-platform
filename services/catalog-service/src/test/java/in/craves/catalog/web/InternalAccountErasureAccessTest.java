package in.craves.catalog.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.catalog.config.InternalCatalogAccessProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.exception.AppErrorHandler;
import in.craves.catalog.security.InternalCatalogAuthorizer;
import in.craves.catalog.service.AccountErasureService;
import in.craves.catalog.service.AccountErasureService.Scope;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Pattern of InternalCatalogAccessTest: the internal key guards all four calls; then the wire shape of each. */
class InternalAccountErasureAccessTest {
    static final String KEY = "internal-test-key";
    static final String BLOCKERS = "/internal/v1/account-erasure/blockers";
    static final String PREPARE = "/internal/v1/account-erasure/prepare";
    static final String RELEASE = "/internal/v1/account-erasure/release";
    static final String ERASE = "/internal/v1/account-erasure";
    final AccountErasureService service = mock(AccountErasureService.class);
    final InternalCatalogAccessProperties properties = new InternalCatalogAccessProperties();
    final UUID request = UUID.randomUUID(), identity = UUID.randomUUID();
    InternalAccountErasureController controller;
    MockMvc mvc;

    @BeforeEach void setUp() {
        properties.setAccessValue(KEY);
        controller = new InternalAccountErasureController(service, new InternalCatalogAuthorizer(properties));
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new AppErrorHandler()).build();
    }

    /** A null leaves that field out of the body. */
    static String body(Object requestId, Object identityId, Object scope) {
        var fields = new ArrayList<String>();
        if (requestId != null) fields.add("\"requestId\":\"" + requestId + "\"");
        if (identityId != null) fields.add("\"identityId\":\"" + identityId + "\"");
        if (scope != null) fields.add("\"scope\":\"" + scope + "\"");
        return "{" + String.join(",", fields) + "}";
    }

    @Test void everyCallNeedsTheInternalKeyAndNeverReachesTheServiceWithoutIt() {
        var body = new InternalAccountErasureController.ErasureRequest(request, identity, Scope.CHEF);
        for (String key : new String[] {null, "wrong"}) {
            assertEquals(403, assertThrows(ApiException.class, () -> controller.blockers(key, body)).getStatus());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.prepare(key, body)).getStatus());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.release(key, body)).getStatus());
            assertEquals(403, assertThrows(ApiException.class, () -> controller.erase(key, body)).getStatus());
        }
        verifyNoInteractions(service);
        properties.setAccessValue("");
        assertEquals(503, assertThrows(ApiException.class, () -> controller.erase(KEY, body)).getStatus());
        verifyNoMoreInteractions(service);
    }

    @Test void blockersAreAlwaysEmpty() throws Exception {
        mvc.perform(post(BLOCKERS).header(InternalCatalogAuthorizer.HEADER_NAME, KEY)
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content(body(null, identity, "ALL")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("catalog"))
            .andExpect(jsonPath("$.blockers").isEmpty());
        verifyNoInteractions(service);
    }

    @Test void prepareAnswersDoneWithTheCounts() throws Exception {
        when(service.prepare(identity, Scope.CHEF, request)).thenReturn(Map.of("kitchen_schedule_config", 1));
        mvc.perform(post(PREPARE).header(InternalCatalogAuthorizer.HEADER_NAME, KEY)
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content(body(request, identity, "CHEF")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("catalog"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts.kitchen_schedule_config").value(1));
    }

    @Test void releaseAnswersDoneWithTheCounts() throws Exception {
        when(service.release(identity, Scope.CHEF, request)).thenReturn(Map.of("kitchen_schedule_config", 1));
        mvc.perform(post(RELEASE).header(InternalCatalogAuthorizer.HEADER_NAME, KEY)
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content(body(request, identity, "CHEF")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("catalog"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts.kitchen_schedule_config").value(1));
    }

    @Test void eraseAnswersDoneWithTheCounts() throws Exception {
        when(service.erase(identity, Scope.ALL, request)).thenReturn(Map.of("kitchen_profile", 1, "media_blob", 3));
        mvc.perform(post(ERASE).header(InternalCatalogAuthorizer.HEADER_NAME, KEY)
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content(body(request, identity, "ALL")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("catalog"))
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts.kitchen_profile").value(1))
            .andExpect(jsonPath("$.counts.media_blob").value(3));
    }

    @Test void anUnknownScopeOrAMissingFieldIs400InTheUsualErrorBodyAndNothingRuns() throws Exception {
        for (String path : new String[] {BLOCKERS, PREPARE, RELEASE, ERASE}) {
            for (String json : new String[] {body(request, identity, "OTHER"), body(request, identity, null), body(request, null, "CHEF"), "not json"}) {
                mvc.perform(post(path).header(InternalCatalogAuthorizer.HEADER_NAME, KEY).contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content(json))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").exists())
                    .andExpect(jsonPath("$.message").exists());
            }
        }
        // prepare, release and erase also need the requestId
        for (String path : new String[] {PREPARE, RELEASE, ERASE}) {
            mvc.perform(post(path).header(InternalCatalogAuthorizer.HEADER_NAME, KEY).contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content(body(null, identity, "CHEF")))
                .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test void aWrongKeyOnAValidBodyIs403OnTheWire() throws Exception {
        for (String path : new String[] {RELEASE, ERASE}) {
            mvc.perform(post(path).header(InternalCatalogAuthorizer.HEADER_NAME, "wrong")
                    .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content(body(request, identity, "CHEF")))
                .andExpect(status().isForbidden());
        }
        verify(service, never()).release(any(), any(), any());
        verify(service, never()).erase(any(), any(), any());
    }
}
