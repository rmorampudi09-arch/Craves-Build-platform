package in.craves.userchef.web;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.config.CravesJwtProperties;
import in.craves.userchef.config.SecurityConfig;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.exception.AppErrorHandler;
import in.craves.userchef.security.CravesJwtAuthenticationFilter;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.security.JwtVerifier;
import in.craves.userchef.service.AuthInternalClient;
import in.craves.userchef.service.ChefApplicationReadinessService;
import in.craves.userchef.service.ChefApplicationService;
import in.craves.userchef.web.ApiDtos.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

@SpringJUnitConfig({ChefApplicationReadinessHttpTest.TestWebConfig.class, SecurityConfig.class})
@WebAppConfiguration
class ChefApplicationReadinessHttpTest {
    private static final String PATH = "/api/v1/chef/application/readiness";
    private static final KeyPair KEYS = keys();
    @Autowired WebApplicationContext context;
    @Autowired ChefApplicationService applications;
    @Autowired AuthInternalClient auth;
    MockMvc mvc;
    final CurrentUser user = new CurrentUser(UUID.randomUUID(), "synthetic-user", "+910000000001", List.of("CUSTOMER"));

    @BeforeEach void setup() {
        reset(applications, auth);
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        when(applications.getMyApplication(user)).thenReturn(new ChefApplicationResponse(UUID.randomUUID(), user.identityId(),
            user.phoneNumber(), "chef@example.test", "Test", "Chef", "Road", null, null, "Hyderabad", "Telangana", "500081",
            null, null, ChefApplicationStatus.PENDING, null, Instant.now(), null, null, List.of()));
        when(applications.listMyApplicationEvidence(user)).thenReturn(List.of(KycDocumentType.APPLICANT_PHOTO,
            KycDocumentType.GOVERNMENT_ID_FRONT, KycDocumentType.GOVERNMENT_ID_BACK, KycDocumentType.TAX_ID_CARD).stream()
            .map(type -> new KycDocumentResponse(UUID.randomUUID(), type, "private.png", "private", "private/blob", "image/png",
                20, "APPROVED", null, Instant.now(), Instant.now(), Instant.now())).toList());
        when(auth.requireVerifiedEmail(user.identityId(), "chef@example.test")).thenReturn("chef@example.test");
    }

    @Test void unsignedRequestIs401BeforeReadingAnyPrivateData() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        verifyNoInteractions(applications, auth);
    }

    @Test void signedCustomerCanReadOwnReadinessWithNoStoreAndCannotChooseAnotherOwner() throws Exception {
        mvc.perform(get(PATH).accept("application/json").header("Authorization", "Bearer " + token(KEYS, Instant.now().plusSeconds(60)))
            .param("identityId", UUID.randomUUID().toString()).header("X-Identity-Id", UUID.randomUUID().toString()))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.contractVersion").value(1)).andExpect(jsonPath("$.approvalReady").value(true))
            .andExpect(jsonPath("$.applicationStatus").value("PENDING"))
            .andExpect(jsonPath("$.approvedDocumentCount").value(4))
            .andExpect(jsonPath("$.documents.length()").value(4))
            .andExpect(jsonPath("$.documents[0].blobName").doesNotExist())
            .andExpect(jsonPath("$.identityId").doesNotExist()).andExpect(jsonPath("$.roles").doesNotExist())
            .andExpect(jsonPath("$.payoutEnabled").doesNotExist());
        verify(applications).getMyApplication(user);
        verify(applications).listMyApplicationEvidence(user);
        verify(auth).requireVerifiedEmail(user.identityId(), "chef@example.test");
        verifyNoMoreInteractions(applications, auth);
    }

    @Test void malformedExpiredAndWrongSignatureTokensAre401WithoutDataAccess() throws Exception {
        for (String invalid : List.of("malformed", token(KEYS, Instant.now().minusSeconds(60)), token(keys(), Instant.now().plusSeconds(60)))) {
            mvc.perform(get(PATH).header("Authorization", "Bearer " + invalid))
                .andExpect(status().isUnauthorized()).andExpect(header().string("Cache-Control", containsString("no-store")));
        }
        verifyNoInteractions(applications, auth);
    }

    @Test void authAuthorityOutageRemains503AndNeverReturnsReadiness() throws Exception {
        when(auth.requireVerifiedEmail(user.identityId(), "chef@example.test"))
            .thenThrow(new ApiException(503, "EMAIL_AUTHORITY_UNAVAILABLE", "Email authority unavailable"));
        mvc.perform(get(PATH).accept("application/json").header("Authorization", "Bearer " + token(KEYS, Instant.now().plusSeconds(60))))
            .andExpect(status().isServiceUnavailable()).andExpect(header().string("Cache-Control", containsString("no-store")))
            .andExpect(jsonPath("$.code").value("EMAIL_AUTHORITY_UNAVAILABLE"))
            .andExpect(jsonPath("$.approvalReady").doesNotExist());
        verify(auth, never()).grantChefRole(any(), any());
    }

    private String token(KeyPair keys, Instant expires) throws Exception {
        var encoder = Base64.getUrlEncoder().withoutPadding();
        String header = encoder.encodeToString("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String payload = encoder.encodeToString(new ObjectMapper().writeValueAsBytes(Map.of(
            "iss", "https://api.craves.in/auth", "aud", "craves-api", "sub", user.identityId().toString(),
            "firebase_uid", user.firebaseUid(), "phone_number", user.phoneNumber(), "roles", user.roles(), "exp", expires.getEpochSecond())));
        String input = header + "." + payload;
        Signature signature = Signature.getInstance("SHA256withRSA");
        signature.initSign(keys.getPrivate());
        signature.update(input.getBytes(StandardCharsets.UTF_8));
        return input + "." + encoder.encodeToString(signature.sign());
    }

    private static KeyPair keys() {
        try { var generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(2048); return generator.generateKeyPair(); }
        catch (Exception ex) { throw new IllegalStateException(ex); }
    }

    @Configuration
    @EnableWebMvc
    static class TestWebConfig {
        @Bean ChefApplicationService applications() { return mock(ChefApplicationService.class); }
        @Bean AuthInternalClient auth() { return mock(AuthInternalClient.class); }
        @Bean ChefApplicationReadinessService readiness(ChefApplicationService apps, AuthInternalClient auth) {
            return new ChefApplicationReadinessService(apps, auth);
        }
        @Bean ChefApplicationReadinessController controller(ChefApplicationReadinessService service) {
            return new ChefApplicationReadinessController(service);
        }
        @Bean AppErrorHandler errors() { return new AppErrorHandler(); }
        @Bean CravesJwtAuthenticationFilter tokenFilter() {
            var properties = new CravesJwtProperties();
            String pem = "-----BEGIN PUBLIC KEY-----\n" + Base64.getEncoder().encodeToString(KEYS.getPublic().getEncoded()) + "\n-----END PUBLIC KEY-----";
            properties.setVerificationPemBase64(Base64.getEncoder().encodeToString(pem.getBytes(StandardCharsets.UTF_8)));
            return new CravesJwtAuthenticationFilter(new JwtVerifier(properties, new ObjectMapper()));
        }
    }
}
