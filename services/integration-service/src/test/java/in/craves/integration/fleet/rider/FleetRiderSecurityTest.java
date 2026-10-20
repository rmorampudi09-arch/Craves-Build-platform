package in.craves.integration.fleet.rider;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Every rider route but GET /me needs the RIDER role. */
@WebMvcTest(FleetRiderController.class)
@ContextConfiguration(classes = {FleetRiderController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true"})
class FleetRiderSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean FleetRiderService service;
    @MockBean JwtVerifier verifier;

    @Test
    void withoutTheRiderRoleEveryRiderRouteIsForbidden() throws Exception {
        for (String role : List.of("CUSTOMER", "CHEF", "PLATFORM_ADMIN", "ADMIN")) {
            when(verifier.verify(role)).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000000", Set.of(role)));
            mvc.perform(get("/api/v1/rider/terms").header("Authorization", "Bearer " + role)).andExpect(status().isForbidden());
            mvc.perform(post("/api/v1/rider/terms/accept").header("Authorization", "Bearer " + role)
                .contentType(MediaType.APPLICATION_JSON).content("{\"version\":\"2026-10-v1\"}")).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/v1/rider/terms")).andExpect(status().is4xxClientError());
        verifyNoInteractions(service);
    }
}
