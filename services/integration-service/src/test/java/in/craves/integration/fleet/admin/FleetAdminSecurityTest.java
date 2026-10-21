package in.craves.integration.fleet.admin;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.FleetApiException;
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

/** Each operation's scoped admin roles; the legacy ADMIN role and riders get nothing. */
@WebMvcTest(FleetAdminController.class)
@ContextConfiguration(classes = {FleetAdminController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = "craves.fleet.enabled=true")
class FleetAdminSecurityTest {
    static final String RIDERS = "/api/v1/admin/fleet/riders";
    @Autowired MockMvc mvc;
    @MockBean FleetAdminService service;
    @MockBean RiderJoinsExitsExport joinsExits;
    @MockBean JwtVerifier verifier;
    final UUID rider = UUID.randomUUID();

    MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String role) {
        when(verifier.verify("token-" + role)).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000000", Set.of(role)));
        return request.header("Authorization", "Bearer token-" + role);
    }

    @Test
    void anonymousCustomersRidersAndTheLegacyAdminGetNothing() throws Exception {
        mvc.perform(get(RIDERS)).andExpect(status().is4xxClientError());
        for (String role : List.of("CUSTOMER", "CHEF", "RIDER", "ADMIN")) {
            mvc.perform(as(get(RIDERS), role)).andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }

    @Test
    void readersListButOnlyOperatorsCreateRiders() throws Exception {
        when(service.listRiders(null, null, null)).thenReturn(new FleetAdminModels.RiderPage(List.of(), null));
        for (String role : List.of("PLATFORM_ADMIN", "OPERATIONS_ADMIN", "COMPLIANCE_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(as(get(RIDERS), role)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.nextCursor").isEmpty());
        }
        for (String role : List.of("COMPLIANCE_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN", "PAYMENTS_ADMIN")) {
            mvc.perform(as(post(RIDERS), role).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Ravi Kumar\",\"phone\":\"+919876543210\",\"language\":\"en\"}"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        }
    }

    @Test
    void onlyPaymentsAndPlatformSetPayoutAccountsAndOnlyOperatorsChangeStatus() throws Exception {
        String account = "{\"method\":\"UPI\",\"upiId\":\"ravi@okaxis\",\"holderName\":\"Ravi Kumar\",\"verifiedInPerson\":true}";
        mvc.perform(as(put(RIDERS + "/" + rider + "/payout-account"), "OPERATIONS_ADMIN").header("Idempotency-Key", UUID.randomUUID().toString())
            .contentType(MediaType.APPLICATION_JSON).content(account)).andExpect(status().isForbidden());
        mvc.perform(as(post(RIDERS + "/" + rider + "/status-events"), "PAYMENTS_ADMIN").header("Idempotency-Key", UUID.randomUUID().toString())
            .contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"NOTICE\"}")).andExpect(status().isForbidden());
        mvc.perform(as(get(RIDERS + "/" + rider + "/documents/" + UUID.randomUUID() + "/content"), "SUPPORT_ADMIN"))
            .andExpect(status().isForbidden());
        mvc.perform(as(get("/api/v1/admin/fleet/exports/rider-joins-exits").param("date", "2026-10-20"), "SUPPORT_ADMIN"))
            .andExpect(status().isForbidden());
        verifyNoInteractions(service, joinsExits);
    }

    @Test
    void mutationsNeedAnIdempotencyKey() throws Exception {
        mvc.perform(as(post(RIDERS), "OPERATIONS_ADMIN").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Ravi Kumar\",\"phone\":\"+919876543210\",\"language\":\"en\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        verifyNoInteractions(service);
    }

    @Test
    void refusalsKeepTheirStatusAndCode() throws Exception {
        UUID key = UUID.randomUUID();
        when(service.createStatusEvent(any(), eq(key), eq(rider), any()))
            .thenThrow(FleetApiException.unprocessable("NOTICE_DEADLINE_TOO_SOON", "The notice deadline must be at least 7 days from now."));
        mvc.perform(as(post(RIDERS + "/" + rider + "/status-events"), "OPERATIONS_ADMIN").header("Idempotency-Key", key.toString())
                .contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"NOTICE\",\"reason\":\"Late\",\"evidenceSummary\":\"Reports\"}"))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("NOTICE_DEADLINE_TOO_SOON"));
    }
}
