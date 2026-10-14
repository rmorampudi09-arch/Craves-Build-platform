package in.craves.userchef.web;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.config.AuthInternalClientProperties;
import in.craves.userchef.config.CravesJwtProperties;
import in.craves.userchef.config.SecurityConfig;
import in.craves.userchef.exception.AppErrorHandler;
import in.craves.userchef.security.CravesJwtAuthenticationFilter;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.security.JwtVerifier;
import in.craves.userchef.service.BlobDocumentStorageService.StoredDocumentBytes;
import in.craves.userchef.service.RegistrationKitchenPhotoService;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.util.Base64;
import java.util.Optional;
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

@SpringJUnitConfig({InternalChefKitchenPhotoHttpTest.TestWebConfig.class, SecurityConfig.class})
@WebAppConfiguration
class InternalChefKitchenPhotoHttpTest {
    private static final String SECRET = "synthetic-internal-secret";
    @Autowired WebApplicationContext context;
    @Autowired RegistrationKitchenPhotoService photos;
    MockMvc mvc;
    final UUID identityId = UUID.randomUUID();

    @BeforeEach void setup() {
        reset(photos);
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test void secretHolderGetsPhotoWithoutSignIn() throws Exception {
        when(photos.approvedKitchenPhoto(identityId, 1)).thenReturn(Optional.of(new StoredDocumentBytes("k.jpg", "image/jpeg", new byte[] {1, 2})));

        mvc.perform(get("/internal/v1/chef-kitchen-photos/1").param("identityId", identityId.toString())
                .header("X-Craves-Internal-Secret", SECRET))
            .andExpect(status().isOk())
            .andExpect(content().contentType("image/jpeg"))
            .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test void wrongSecretIs401BeforeAnyRead() throws Exception {
        mvc.perform(get("/internal/v1/chef-kitchen-photos/1").param("identityId", identityId.toString())
                .header("X-Craves-Internal-Secret", "wrong"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(photos);
    }

    @Configuration
    @EnableWebMvc
    static class TestWebConfig {
        @Bean RegistrationKitchenPhotoService photos() { return mock(RegistrationKitchenPhotoService.class); }
        @Bean InternalRequestAuthorizer authorizer() {
            var properties = new AuthInternalClientProperties();
            properties.setServiceSecret(SECRET);
            return new InternalRequestAuthorizer(properties);
        }
        @Bean InternalChefKitchenPhotoController controller(RegistrationKitchenPhotoService photos, InternalRequestAuthorizer authorizer) {
            return new InternalChefKitchenPhotoController(photos, authorizer);
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
