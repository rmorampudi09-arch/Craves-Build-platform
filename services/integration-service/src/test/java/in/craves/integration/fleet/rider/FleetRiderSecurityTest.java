package in.craves.integration.fleet.rider;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Every rider route but GET /me needs the RIDER role (403 without it); /me needs only a sign-in. */
@WebMvcTest(FleetRiderController.class)
@ContextConfiguration(classes = {FleetRiderController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true"})
class FleetRiderSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean FleetRiderService service;
    @MockBean FleetShiftService shifts;
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
        for (String path : List.of("/api/v1/rider/profile", "/api/v1/rider/home")) {
            mvc.perform(get(path).header("Authorization", "Bearer CUSTOMER")).andExpect(status().isForbidden());
        }
        mvc.perform(multipart("/api/v1/rider/documents").file(new MockMultipartFile("photo", new byte[] {1})).param("type", "DL")
            .header("Authorization", "Bearer CUSTOMER")).andExpect(status().isForbidden());
        mvc.perform(multipart("/api/v1/rider/shift/start").file(new MockMultipartFile("selfie", new byte[] {1}))
            .header("Authorization", "Bearer CUSTOMER")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/rider/shift/end").header("Authorization", "Bearer CUSTOMER")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/rider/devices").header("Authorization", "Bearer CUSTOMER").contentType(MediaType.APPLICATION_JSON)
            .content("{\"installationId\":\"9774d56d682e549c\",\"fcmToken\":\"t\",\"appVersion\":\"1.0.0\",\"model\":\"Redmi\"}"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        verifyNoInteractions(service, shifts);
    }

    @Test
    void meNeedsOnlyASignIn() throws Exception {
        when(verifier.verify("customer")).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000000", Set.of("CUSTOMER")));
        when(service.me(any())).thenReturn(new FleetRiderModels.RiderMe("", "", "+91 90xxxxx000", null, "NOT_RIDER", null, null, null,
            "2026-10-v1", null, "en", "1.0.0", "+914012345678", null, new FleetRiderModels.Features(false, false)));
        mvc.perform(get("/api/v1/rider/me").header("Authorization", "Bearer customer")).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("NOT_RIDER")).andExpect(jsonPath("$.notice").doesNotExist());
        mvc.perform(get("/api/v1/rider/me")).andExpect(status().is4xxClientError());
    }
}
