package in.craves.auth.web;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.auth.api.IdentityResponse;
import in.craves.auth.config.InternalServiceProperties;
import in.craves.auth.exception.RestExceptionHandler;
import in.craves.auth.service.AuthService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class InternalRoleControllerTest {
    private static final String SECRET = "synthetic-internal-secret";
    private static final UUID IDENTITY = UUID.randomUUID();
    private static final UUID RIDER = UUID.randomUUID();

    private final AuthService authService = mock(AuthService.class);
    private final InternalServiceProperties properties = new InternalServiceProperties();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        properties.setServiceSecret(SECRET);
        mvc = MockMvcBuilders.standaloneSetup(new InternalRoleController(authService, properties))
            .setControllerAdvice(new RestExceptionHandler())
            .build();
    }

    @Test
    void grantReturnsRolesIncludingRider() throws Exception {
        when(authService.grantRiderRole(IDENTITY, RIDER)).thenReturn(identity("CUSTOMER", "RIDER"));

        mvc.perform(call("grant", SECRET, body(IDENTITY, RIDER)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.identityId").value(IDENTITY.toString()))
            .andExpect(jsonPath("$.roles[0]").value("CUSTOMER"))
            .andExpect(jsonPath("$.roles[1]").value("RIDER"));
        verify(authService).grantRiderRole(IDENTITY, RIDER);
    }

    @Test
    void revokeReturnsRolesWithoutRider() throws Exception {
        when(authService.revokeRiderRole(IDENTITY, RIDER)).thenReturn(identity("CUSTOMER"));

        mvc.perform(call("revoke", SECRET, body(IDENTITY, RIDER)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.identityId").value(IDENTITY.toString()))
            .andExpect(jsonPath("$.roles.length()").value(1))
            .andExpect(jsonPath("$.roles[0]").value("CUSTOMER"));
        verify(authService).revokeRiderRole(IDENTITY, RIDER);
    }

    @Test
    void wrongOrMissingSecretIsRejectedBeforeAnyRoleChange() throws Exception {
        for (String action : List.of("grant", "revoke")) {
            mvc.perform(call(action, "wrong-secret", body(IDENTITY, RIDER)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INTERNAL_SECRET_INVALID"));
            mvc.perform(call(action, null, body(IDENTITY, RIDER)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INTERNAL_SECRET_REQUIRED"));
        }
        properties.setServiceSecret("");
        mvc.perform(call("grant", SECRET, body(IDENTITY, RIDER)))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("INTERNAL_SECRET_NOT_CONFIGURED"));
        verifyNoInteractions(authService);
    }

    @Test
    void missingRiderIdIsAValidationError() throws Exception {
        mvc.perform(call("grant", SECRET, "{\"identityId\":\"" + IDENTITY + "\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        verifyNoInteractions(authService);
    }

    private static MockHttpServletRequestBuilder call(String action, String secret, String body) {
        MockHttpServletRequestBuilder request = post("/internal/v1/roles/rider/" + action)
            .contentType(MediaType.APPLICATION_JSON)
            .content(body);
        return secret == null ? request : request.header("X-Craves-Internal-Secret", secret);
    }

    private static String body(UUID identityId, UUID riderId) {
        return "{\"identityId\":\"" + identityId + "\",\"riderId\":\"" + riderId + "\"}";
    }

    private static IdentityResponse identity(String... roles) {
        return new IdentityResponse(IDENTITY, "synthetic-firebase", "+10000000000", null, false, null, "ACTIVE", List.of(roles), null);
    }
}
