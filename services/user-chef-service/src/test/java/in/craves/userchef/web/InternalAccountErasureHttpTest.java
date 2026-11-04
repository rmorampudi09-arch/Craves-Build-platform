package in.craves.userchef.web;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.config.AuthInternalClientProperties;
import in.craves.userchef.config.CravesJwtProperties;
import in.craves.userchef.config.SecurityConfig;
import in.craves.userchef.exception.AppErrorHandler;
import in.craves.userchef.security.CravesJwtAuthenticationFilter;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.security.JwtVerifier;
import in.craves.userchef.service.AccountErasureService;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

/** The real security chain: auth-service has no user token, so the route must be open to the secret holder only. */
@SpringJUnitConfig({InternalAccountErasureHttpTest.TestWebConfig.class, SecurityConfig.class})
@WebAppConfiguration
class InternalAccountErasureHttpTest {
    private static final String SECRET = "synthetic-internal-secret";
    @Autowired WebApplicationContext context;
    @Autowired AccountErasureService erasure;
    MockMvc mvc;
    final UUID identityId = UUID.randomUUID();
    final String body = "{\"requestId\":\"" + UUID.randomUUID() + "\",\"identityId\":\"" + identityId + "\",\"scope\":\"CHEF\"}";

    @BeforeEach void setup() {
        reset(erasure);
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test void secretHolderErasesWithoutSignIn() throws Exception {
        when(erasure.erase(any(), any(), any())).thenReturn(Map.of("chef_application", 1));
        mvc.perform(post("/internal/v1/account-erasure").contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON)
                .header("X-Craves-Internal-Secret", SECRET).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DONE"))
            .andExpect(jsonPath("$.counts.chef_application").value(1));
        mvc.perform(post("/internal/v1/account-erasure/blockers").contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON)
                .header("X-Craves-Internal-Secret", SECRET).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.blockers").isEmpty());
    }

    @Test void noOrWrongSecretIs401BeforeAnyWork() throws Exception {
        mvc.perform(post("/internal/v1/account-erasure").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/v1/account-erasure/prepare").contentType(MediaType.APPLICATION_JSON)
                .header("X-Craves-Internal-Secret", "wrong").content(body))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(erasure);
    }

    @Test void theSignedCallerDefaultNamesAuthForTheRoute() throws Exception {
        String yml = Files.readString(Path.of("src/main/resources/application.yml"));
        assertTrue(yml.contains(";/internal/v1/account-erasure/**=auth"), "allowed-callers default must name auth for the route");
    }

    @Configuration
    @EnableWebMvc
    static class TestWebConfig {
        @Bean AccountErasureService erasure() { return mock(AccountErasureService.class); }
        @Bean InternalRequestAuthorizer authorizer() {
            var properties = new AuthInternalClientProperties();
            properties.setServiceSecret(SECRET);
            return new InternalRequestAuthorizer(properties);
        }
        @Bean InternalAccountErasureController controller(AccountErasureService erasure, InternalRequestAuthorizer authorizer) {
            return new InternalAccountErasureController(erasure, authorizer);
        }
        @Bean AppErrorHandler errors() { return new AppErrorHandler(); }
        @Bean CravesJwtAuthenticationFilter tokenFilter() throws Exception {
            var generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            var properties = new CravesJwtProperties();
            String pem = "-----BEGIN PUBLIC KEY-----\n" + Base64.getEncoder().encodeToString(generator.generateKeyPair().getPublic().getEncoded()) + "\n-----END PUBLIC KEY-----";
            properties.setVerificationPemBase64(Base64.getEncoder().encodeToString(pem.getBytes(StandardCharsets.UTF_8)));
            return new CravesJwtAuthenticationFilter(new JwtVerifier(properties, new ObjectMapper()));
        }
    }
}
