package in.craves.userchef.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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
import in.craves.userchef.location.OlaMapsClient.RoadDistance;
import in.craves.userchef.location.RoadDistanceService;
import in.craves.userchef.security.CravesJwtAuthenticationFilter;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.security.JwtVerifier;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.util.Base64;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

@SpringJUnitConfig({InternalRoadDistanceHttpTest.TestWebConfig.class, SecurityConfig.class})
@WebAppConfiguration
class InternalRoadDistanceHttpTest {
    private static final String SECRET = "synthetic-internal-secret";
    private static final String PATH = "/internal/v1/maps/road-distance";
    @Autowired WebApplicationContext context;
    @Autowired RoadDistanceService distances;
    MockMvc mvc;
    final UUID kitchenId = UUID.randomUUID();
    final UUID addressId = UUID.randomUUID();

    @BeforeEach void setup() {
        reset(distances);
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test void secretHolderGetsDistanceWithoutSignIn() throws Exception {
        when(distances.distance(kitchenId, addressId, new BigDecimal("17.4483"), new BigDecimal("78.3915"),
            new BigDecimal("17.4374"), new BigDecimal("78.3897"))).thenReturn(new RoadDistance(1900, 480L, "OLA"));

        mvc.perform(request(body(kitchenId, "17.4483")).header("X-Craves-Internal-Secret", SECRET))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.meters").value(1900))
            .andExpect(jsonPath("$.seconds").value(480))
            .andExpect(jsonPath("$.source").value("OLA"));
    }

    @Test void fallbackIsStill200WithNoSeconds() throws Exception {
        when(distances.distance(eq(null), eq(addressId), any(), any(), any(), any()))
            .thenReturn(new RoadDistance(1595, null, "FALLBACK"));

        mvc.perform(request(body(null, "17.4483")).header("X-Craves-Internal-Secret", SECRET))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.meters").value(1595))
            .andExpect(jsonPath("$.seconds").isEmpty())
            .andExpect(jsonPath("$.source").value("FALLBACK"));
    }

    @Test void missingOrWrongSecretIs401BeforeAnyLookup() throws Exception {
        mvc.perform(request(body(kitchenId, "17.4483"))).andExpect(status().isUnauthorized());
        mvc.perform(request(body(kitchenId, "17.4483")).header("X-Craves-Internal-Secret", "wrong"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(distances);
    }

    @Test void outOfRangePointIs400() throws Exception {
        mvc.perform(request(body(kitchenId, "95")).header("X-Craves-Internal-Secret", SECRET))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(distances);
    }

    private static MockHttpServletRequestBuilder request(String json) {
        return post(PATH).contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content(json);
    }

    private String body(UUID kitchen, String fromLat) {
        return """
            {"kitchenId": %s, "addressId": "%s",
             "from": {"lat": %s, "lng": 78.3915}, "to": {"lat": 17.4374, "lng": 78.3897}}
            """.formatted(kitchen == null ? "null" : "\"" + kitchen + "\"", addressId, fromLat);
    }

    @Configuration
    @EnableWebMvc
    static class TestWebConfig {
        @Bean RoadDistanceService distances() { return mock(RoadDistanceService.class); }
        @Bean InternalRequestAuthorizer authorizer() {
            var properties = new AuthInternalClientProperties();
            properties.setServiceSecret(SECRET);
            return new InternalRequestAuthorizer(properties);
        }
        @Bean InternalRoadDistanceController controller(RoadDistanceService distances, InternalRequestAuthorizer authorizer) {
            return new InternalRoadDistanceController(distances, authorizer);
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
