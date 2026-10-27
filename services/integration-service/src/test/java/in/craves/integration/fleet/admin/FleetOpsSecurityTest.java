package in.craves.integration.fleet.admin;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.dispatch.FleetOpsService;
import in.craves.integration.fleet.dispatch.FleetOpsService.OpsTrip;
import in.craves.integration.fleet.dispatch.FleetOpsService.PositionList;
import in.craves.integration.fleet.dispatch.FleetOpsService.QueueList;
import in.craves.integration.fleet.dispatch.FleetOpsService.ReassignInput;
import in.craves.integration.fleet.dispatch.FleetOpsService.TripList;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.time.Instant;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** admin-fleet-v1 /trips: reads for support and audit too, reassign and cancel for operations only; mutations need a key. */
@WebMvcTest(FleetOpsController.class)
@ContextConfiguration(classes = {FleetOpsController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = "craves.fleet.enabled=true")
class FleetOpsSecurityTest {
    static final String TRIPS = "/api/v1/admin/fleet/trips";
    @Autowired MockMvc mvc;
    @MockBean FleetOpsService ops;
    @MockBean FleetPilotHealth health;
    @MockBean JwtVerifier verifier;
    final UUID trip = UUID.randomUUID();

    MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String role) {
        when(verifier.verify("token-" + role)).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000000", Set.of(role)));
        return request.header("Authorization", "Bearer token-" + role);
    }

    @Test
    void readersSeeTripsAndEveryoneElseGetsNothing() throws Exception {
        when(ops.trips()).thenReturn(new TripList(List.of(new OpsTrip(trip, "#0A1B2C3D", "Amma's Kitchen", "Kondapur", "SEARCHING",
            "PIDGE", null, null, Instant.parse("2026-10-20T06:00:00Z"), Instant.parse("2026-10-20T06:01:00Z")))));
        for (String role : List.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(as(get(TRIPS), role)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.trips[0].provider").value("PIDGE")).andExpect(jsonPath("$.trips[0].riderId").isEmpty());
        }
        for (String role : List.of("COMPLIANCE_ADMIN", "PAYMENTS_ADMIN", "ADMIN", "RIDER", "CUSTOMER")) {
            mvc.perform(as(get(TRIPS), role)).andExpect(status().isForbidden());
        }
        mvc.perform(get(TRIPS)).andExpect(status().is4xxClientError());
    }

    @Test
    void theDispatchQueueIsForReadersOnly() throws Exception {
        when(ops.dispatchQueue()).thenReturn(new QueueList(List.of()));
        for (String role : List.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(as(get("/api/v1/admin/fleet/dispatch-queue"), role)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.items").isArray());
        }
        for (String role : List.of("COMPLIANCE_ADMIN", "PAYMENTS_ADMIN", "RIDER")) {
            mvc.perform(as(get("/api/v1/admin/fleet/dispatch-queue"), role)).andExpect(status().isForbidden());
        }
    }

    @Test
    void pilotHealthIsForTripReadersOnly() throws Exception {
        when(health.report()).thenReturn(new FleetPilotHealth.Report(Instant.parse("2026-10-20T06:00:00Z"), List.of(
            new FleetPilotHealth.Result("offer_to_ring", "Seconds from offer to ring.", List.of("channel", "p95_s"),
                List.of(List.of("all", 4.2)), false, null))));
        for (String role : List.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(as(get("/api/v1/admin/fleet/pilot-health"), role)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.results[0].name").value("offer_to_ring"))
                .andExpect(jsonPath("$.results[0].rows[0][1]").value(4.2));
        }
        for (String role : List.of("COMPLIANCE_ADMIN", "PAYMENTS_ADMIN", "ADMIN", "RIDER")) {
            mvc.perform(as(get("/api/v1/admin/fleet/pilot-health"), role)).andExpect(status().isForbidden());
        }
    }

    @Test
    void livePositionsAreForOperationsOnly() throws Exception {
        when(ops.positions()).thenReturn(new PositionList(List.of()));
        for (String role : List.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN")) {
            mvc.perform(as(get("/api/v1/admin/fleet/positions"), role)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.positions").isArray());
        }
        for (String role : List.of("SUPPORT_ADMIN", "AUDIT_ADMIN", "COMPLIANCE_ADMIN", "PAYMENTS_ADMIN", "RIDER")) {
            mvc.perform(as(get("/api/v1/admin/fleet/positions"), role)).andExpect(status().isForbidden());
        }
    }

    @Test
    void onlyOperatorsReassignOrCancelAndAlwaysWithAKey() throws Exception {
        String reassign = "{\"provider\":\"PIDGE\",\"reason\":\"Rider's bike broke down\"}";
        for (String role : List.of("SUPPORT_ADMIN", "AUDIT_ADMIN", "COMPLIANCE_ADMIN", "PAYMENTS_ADMIN")) {
            mvc.perform(as(post(TRIPS + "/" + trip + "/reassign"), role).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(reassign)).andExpect(status().isForbidden());
            mvc.perform(as(post(TRIPS + "/" + trip + "/cancel"), role).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Customer cancelled\"}")).andExpect(status().isForbidden());
        }
        mvc.perform(as(post(TRIPS + "/" + trip + "/cancel"), "OPERATIONS_ADMIN").contentType(MediaType.APPLICATION_JSON)
            .content("{\"reason\":\"Customer cancelled\"}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        verifyNoInteractions(ops);
    }

    @Test
    void refusalsKeepTheirStatusAndCode() throws Exception {
        UUID key = UUID.randomUUID();
        when(ops.reassign(any(), eq(key), eq(trip), eq(new ReassignInput(null, "BORZO", "Rider's bike broke down"))))
            .thenThrow(FleetApiException.conflict("TRIP_NOT_REASSIGNABLE", "The rider has the food. Cancel the trip instead."));
        mvc.perform(as(post(TRIPS + "/" + trip + "/reassign"), "OPERATIONS_ADMIN").header("Idempotency-Key", key.toString())
                .contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"BORZO\",\"reason\":\"Rider's bike broke down\"}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TRIP_NOT_REASSIGNABLE"));
    }
}
