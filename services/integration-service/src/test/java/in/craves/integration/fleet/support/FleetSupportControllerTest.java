package in.craves.integration.fleet.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.rider.FleetRiderService;
import in.craves.integration.fleet.support.FleetSupportModels.Issue;
import in.craves.integration.fleet.support.FleetSupportModels.IssueInput;
import in.craves.integration.fleet.support.FleetSupportModels.IssuePage;
import in.craves.integration.fleet.support.FleetSupportModels.SosEvent;
import in.craves.integration.fleet.support.FleetSupportModels.SosInput;
import in.craves.integration.fleet.support.FleetSupportModels.SosPage;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Report a problem and SOS for riders; the issue and SOS lists for operations, support and audit admins. */
@WebMvcTest({FleetSupportController.class, FleetSupportAdminController.class})
@ContextConfiguration(classes = {FleetSupportController.class, FleetSupportAdminController.class, FleetApiAdvice.class,
    WebSecurityConfiguration.class, CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = {"craves.fleet.enabled=true", "craves.fleet.rider-api-enabled=true"})
class FleetSupportControllerTest {
    static final UUID RIDER = UUID.fromString("11111111-1111-4111-8111-111111111111");
    @Autowired MockMvc mvc;
    @MockBean FleetRiderService riders;
    @MockBean FleetSupportService support;
    @MockBean JwtVerifier verifier;
    final UUID identity = UUID.randomUUID();

    @BeforeEach
    void signIn() {
        when(verifier.verify("rider")).thenReturn(new CravesPrincipal(identity, "+919800000001", Set.of("RIDER")));
        when(riders.riderId(identity)).thenReturn(RIDER);
    }

    String as(String role) {
        when(verifier.verify("token-" + role)).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000000", Set.of(role)));
        return "Bearer token-" + role;
    }

    @Test
    void aRiderReportsAProblemAndPressesSos() throws Exception {
        mvc.perform(post("/api/v1/rider/support/issues").header("Authorization", "Bearer rider").contentType(MediaType.APPLICATION_JSON)
            .content("{\"category\":\"MISSING_PAY\",\"tripId\":\"33333333-3333-4333-8333-333333333333\",\"note\":\"No pay for this trip\"}"))
            .andExpect(status().isNoContent());
        verify(support).report(RIDER, new IssueInput("MISSING_PAY", "33333333-3333-4333-8333-333333333333", null, "No pay for this trip"));

        mvc.perform(post("/api/v1/rider/sos").header("Authorization", "Bearer rider").contentType(MediaType.APPLICATION_JSON)
            .content("{\"tripId\":\"33333333-3333-4333-8333-333333333333\",\"fix\":{\"lat\":17.4483,\"lng\":78.3915,\"accuracyM\":12,"
                + "\"at\":\"2026-10-20T09:00:00Z\",\"mock\":false}}")).andExpect(status().isNoContent());
        ArgumentCaptor<SosInput> sos = ArgumentCaptor.forClass(SosInput.class);
        verify(support).sos(eq(RIDER), sos.capture());
        assertThat(sos.getValue().fix().lat()).isEqualTo(17.4483);
        assertThat(sos.getValue().fix().at()).isEqualTo(Instant.parse("2026-10-20T09:00:00Z"));

        mvc.perform(post("/api/v1/rider/sos").header("Authorization", "Bearer rider")).andExpect(status().isNoContent());
        verify(support).sos(eq(RIDER), isNull());
    }

    @Test
    void onlyRidersReachTheRiderRoutes() throws Exception {
        mvc.perform(post("/api/v1/rider/sos")).andExpect(status().is4xxClientError());
        mvc.perform(post("/api/v1/rider/sos").header("Authorization", as("CUSTOMER"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/rider/support/issues").header("Authorization", as("OPERATIONS_ADMIN"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"category\":\"OTHER\"}")).andExpect(status().isForbidden());
        verifyNoInteractions(support);
    }

    @Test
    void operationsSupportAndAuditAdminsReadIssuesAndSosEvents() throws Exception {
        UUID trip = UUID.randomUUID();
        when(support.issues("OPEN")).thenReturn(new IssuePage(List.of(new Issue(UUID.randomUUID(), RIDER, "Ravi Kumar", null, "OTHER", "",
            "OPEN", Instant.parse("2026-10-20T09:00:00Z"), Instant.parse("2026-10-21T09:00:00Z"), Instant.parse("2026-10-23T09:00:00Z")))));
        when(support.sosEvents()).thenReturn(new SosPage(List.of(new SosEvent(UUID.randomUUID(), RIDER, "Ravi Kumar", "+91 98xxxxx210",
            Instant.parse("2026-10-20T09:00:00Z"), null, null, trip))));
        for (String role : List.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(get("/api/v1/admin/fleet/support-issues").header("Authorization", as(role))).andExpect(status().isOk())
                .andExpect(jsonPath("$.issues[0].tripId").isEmpty()).andExpect(jsonPath("$.issues[0].fixBy").value("2026-10-23T09:00:00Z"));
            mvc.perform(get("/api/v1/admin/fleet/sos-events").header("Authorization", as(role))).andExpect(status().isOk())
                .andExpect(jsonPath("$.events[0].lat").isEmpty()).andExpect(jsonPath("$.events[0].tripId").value(trip.toString()))
                .andExpect(jsonPath("$.events[0].phoneMasked").value("+91 98xxxxx210"));
        }
        for (String role : List.of("PAYMENTS_ADMIN", "COMPLIANCE_ADMIN", "ADMIN", "RIDER")) {
            mvc.perform(get("/api/v1/admin/fleet/support-issues").header("Authorization", as(role))).andExpect(status().isForbidden());
            mvc.perform(get("/api/v1/admin/fleet/sos-events").header("Authorization", as(role))).andExpect(status().isForbidden());
        }
        when(support.issues("FIXED")).thenReturn(new IssuePage(List.of()));
        mvc.perform(get("/api/v1/admin/fleet/support-issues").param("state", "FIXED").header("Authorization", as("SUPPORT_ADMIN")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.issues").isEmpty());
    }
}
