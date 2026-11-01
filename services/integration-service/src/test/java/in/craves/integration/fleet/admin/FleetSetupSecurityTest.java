package in.craves.integration.fleet.admin;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.admin.FleetAdminModels.FleetSetup;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** The pilot setup routes: reads for ops, support and audit; changes for operations only, each with an Idempotency-Key. */
@WebMvcTest(FleetSetupController.class)
@ContextConfiguration(classes = {FleetSetupController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = "craves.fleet.enabled=true")
class FleetSetupSecurityTest {
    static final String FLEET = "/api/v1/admin/fleet";
    @Autowired MockMvc mvc;
    @MockBean FleetSetupService service;
    @MockBean JwtVerifier verifier;
    final UUID rider = UUID.randomUUID();
    final UUID chef = UUID.randomUUID();

    MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String role) {
        when(verifier.verify("token-" + role)).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000000", Set.of(role)));
        return request.header("Authorization", "Bearer token-" + role);
    }

    /** Every change, with a body where it takes one. */
    List<MockHttpServletRequestBuilder> changes() {
        return List.of(
            post(FLEET + "/rate-cards").contentType(MediaType.APPLICATION_JSON).content("{\"basePaise\":4000}"),
            post(FLEET + "/rate-cards/2026-10-v2/publish"),
            post(FLEET + "/dispatch-policies").contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"off\"}"),
            put(FLEET + "/rain-mode").contentType(MediaType.APPLICATION_JSON).content("{\"level\":\"on\"}"),
            put(FLEET + "/pilot/riders/" + rider), delete(FLEET + "/pilot/riders/" + rider),
            put(FLEET + "/pilot/kitchens/" + chef), delete(FLEET + "/pilot/kitchens/" + chef));
    }

    @Test
    void opsSupportAndAuditReadTheSetupWithTheVersionsInForceAlwaysPresent() throws Exception {
        when(service.setup()).thenReturn(new FleetSetup(true, null, List.of(), null, List.of(), List.of(), List.of()));
        for (String role : List.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(as(get(FLEET + "/setup"), role)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.testMode").value(true)).andExpect(content().string(containsString("\"rateCard\":null")))
                .andExpect(content().string(containsString("\"dispatchPolicy\":null")));
        }
        for (String role : List.of("COMPLIANCE_ADMIN", "PAYMENTS_ADMIN", "ADMIN", "RIDER")) {
            mvc.perform(as(get(FLEET + "/setup"), role)).andExpect(status().isForbidden());
        }
    }

    @Test
    void theLegacyAdminSupportAuditComplianceAndPaymentsChangeNothing() throws Exception {
        for (String role : List.of("ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN", "COMPLIANCE_ADMIN", "PAYMENTS_ADMIN")) {
            for (MockHttpServletRequestBuilder change : changes()) {
                mvc.perform(as(change, role).header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isForbidden());
            }
        }
        verifyNoInteractions(service);
    }

    @Test
    void everyChangeNeedsAnIdempotencyKey() throws Exception {
        for (MockHttpServletRequestBuilder change : changes()) {
            mvc.perform(as(change, "OPERATIONS_ADMIN")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        }
        verifyNoInteractions(service);
    }

    @Test
    void operatorsChangeTheSetup() throws Exception {
        String key = UUID.randomUUID().toString();
        mvc.perform(as(post(FLEET + "/rate-cards"), "OPERATIONS_ADMIN").header("Idempotency-Key", key)
            .contentType(MediaType.APPLICATION_JSON).content("{\"basePaise\":4000}")).andExpect(status().isCreated());
        mvc.perform(as(post(FLEET + "/dispatch-policies"), "PLATFORM_ADMIN").header("Idempotency-Key", key)
            .contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"off\"}")).andExpect(status().isCreated());
        mvc.perform(as(put(FLEET + "/pilot/riders/" + rider), "OPERATIONS_ADMIN").header("Idempotency-Key", key))
            .andExpect(status().isOk());
        verify(service).addPilotRider(any(), eq(UUID.fromString(key)), eq(rider), isNull());
        mvc.perform(as(put(FLEET + "/pilot/kitchens/" + chef), "OPERATIONS_ADMIN").header("Idempotency-Key", key)
            .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Amma's Kitchen\"}")).andExpect(status().isOk());
        verify(service).addPilotKitchen(any(), eq(UUID.fromString(key)), eq(chef), eq(new FleetAdminModels.PilotNote("Amma's Kitchen")));
        mvc.perform(as(delete(FLEET + "/pilot/riders/" + rider), "OPERATIONS_ADMIN").header("Idempotency-Key", key))
            .andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"));
        verify(service).removePilotRider(any(), eq(UUID.fromString(key)), eq(rider));
    }

    /** Rain mode (R16 19): ops, support and audit read it; only operations switch it, each switch with its key. */
    @Test
    void readersSeeRainModeAndOperatorsSwitchIt() throws Exception {
        when(service.rainMode()).thenReturn(new FleetAdminModels.RainMode("off", "on", true, null, null, 2000));
        for (String role : List.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(as(get(FLEET + "/rain-mode"), role)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.level").value("off")).andExpect(jsonPath("$.inForce").value("on"))
                .andExpect(jsonPath("$.rainTopUpPaise").value(2000));
        }
        for (String role : List.of("COMPLIANCE_ADMIN", "PAYMENTS_ADMIN", "ADMIN", "RIDER")) {
            mvc.perform(as(get(FLEET + "/rain-mode"), role)).andExpect(status().isForbidden());
        }
        String key = UUID.randomUUID().toString();
        mvc.perform(as(put(FLEET + "/rain-mode"), "OPERATIONS_ADMIN").header("Idempotency-Key", key)
            .contentType(MediaType.APPLICATION_JSON).content("{\"level\":\"severe\"}")).andExpect(status().isOk());
        verify(service).setRainMode(any(), eq(UUID.fromString(key)), eq(new FleetAdminModels.RainModeInput("severe")));
    }

    @Test
    void refusalsKeepTheirStatusAndCode() throws Exception {
        UUID key = UUID.randomUUID();
        when(service.publishRateCard(any(), eq(key), eq("2026-10-v2")))
            .thenThrow(FleetApiException.unprocessable("VERSION_REFUSED", "It must start at least 14 days after it is published."));
        mvc.perform(as(post(FLEET + "/rate-cards/2026-10-v2/publish"), "OPERATIONS_ADMIN").header("Idempotency-Key", key.toString()))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VERSION_REFUSED"));
        when(service.setDispatchPolicy(any(), eq(key), any()))
            .thenThrow(FleetApiException.unprocessable("RATE_CARD_REQUIRED", "Publish a rate card before switching dispatch to live."));
        mvc.perform(as(post(FLEET + "/dispatch-policies"), "OPERATIONS_ADMIN").header("Idempotency-Key", key.toString())
                .contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"live\"}"))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("RATE_CARD_REQUIRED"));
    }
}
