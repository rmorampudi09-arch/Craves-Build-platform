package in.craves.auth.web;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.auth.api.InternalIdentityContactResponse;
import in.craves.auth.config.InternalServiceProperties;
import in.craves.auth.exception.RestExceptionHandler;
import in.craves.auth.service.AuthService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class InternalIdentityControllerTest {
    private static final UUID IDENTITY = UUID.randomUUID();
    private final AuthService authService = mock(AuthService.class);

    private MockMvc mvc() {
        var properties = new InternalServiceProperties();
        properties.setServiceSecret("synthetic-internal-secret");
        return MockMvcBuilders.standaloneSetup(new InternalIdentityController(authService, properties))
            .setControllerAdvice(new RestExceptionHandler()).build();
    }

    @Test
    void contactNeedsTheInternalSecretAndReturnsTheSignInPhone() throws Exception {
        mvc().perform(get("/internal/v1/identities/" + IDENTITY + "/contact")).andExpect(status().isUnauthorized());
        mvc().perform(get("/internal/v1/identities/" + IDENTITY + "/contact").header("X-Craves-Internal-Secret", "wrong"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(authService);
        when(authService.internalIdentityContact(IDENTITY)).thenReturn(new InternalIdentityContactResponse(IDENTITY, "+919000000000", "Asha"));
        mvc().perform(get("/internal/v1/identities/" + IDENTITY + "/contact").header("X-Craves-Internal-Secret", "synthetic-internal-secret"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.phoneNumber").value("+919000000000"))
            .andExpect(jsonPath("$.displayName").value("Asha"));
    }
}
