package in.craves.integration.fleet.money;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
import in.craves.integration.fleet.money.FleetMoneyModels.HoldPage;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import java.util.List;
import java.util.Map;
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

/** Money routes of the ops console: each operation's scoped roles (admin-fleet-v1 x-roles); riders and the legacy ADMIN get nothing. */
@WebMvcTest(FleetMoneyAdminController.class)
@ContextConfiguration(classes = {FleetMoneyAdminController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = "craves.fleet.enabled=true")
class FleetMoneyAdminSecurityTest {
    static final String HOLDS = "/api/v1/admin/fleet/holds";
    static final String HOLD = "{\"tripId\":\"" + UUID.randomUUID() + "\",\"reason\":\"Customer says not delivered\",\"releaseOn\":\"2026-10-22\"}";
    @Autowired MockMvc mvc;
    @MockBean FleetEarnings earnings;
    @MockBean JwtVerifier verifier;

    MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder request, String role) {
        when(verifier.verify("token-" + role)).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000000", Set.of(role)));
        return request.header("Authorization", "Bearer token-" + role);
    }

    @Test
    void holdsAreReadByPaymentsOperationsAndAuditAndChangedOnlyByPayments() throws Exception {
        when(earnings.holds("ACTIVE")).thenReturn(new HoldPage(List.of()));
        for (String role : List.of("PLATFORM_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN")) {
            mvc.perform(as(get(HOLDS), role)).andExpect(status().isOk()).andExpect(jsonPath("$.holds").isArray());
        }
        when(earnings.placeHold(any(), any(), any())).thenReturn(Map.of("holdId", "x"));
        for (String role : List.of("PLATFORM_ADMIN", "PAYMENTS_ADMIN")) {
            mvc.perform(as(post(HOLDS), role).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(HOLD)).andExpect(status().isCreated());
        }
    }

    @Test
    void everyoneElseIsRefused() throws Exception {
        for (String role : List.of("SUPPORT_ADMIN", "COMPLIANCE_ADMIN", "ADMIN", "RIDER", "CUSTOMER")) {
            mvc.perform(as(get(HOLDS), role)).andExpect(status().isForbidden());
        }
        for (String role : List.of("OPERATIONS_ADMIN", "AUDIT_ADMIN", "SUPPORT_ADMIN")) {
            mvc.perform(as(post(HOLDS), role).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content(HOLD)).andExpect(status().isForbidden());
            mvc.perform(as(post(HOLDS + "/" + UUID.randomUUID() + "/release"), role).header("Idempotency-Key", UUID.randomUUID().toString()))
                .andExpect(status().isForbidden());
        }
        verifyNoInteractions(earnings);
    }

    @Test
    void changesNeedAnIdempotencyKey() throws Exception {
        mvc.perform(as(post(HOLDS), "PAYMENTS_ADMIN").contentType(MediaType.APPLICATION_JSON).content(HOLD))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REQUIRED"));
        when(earnings.releaseHold(any(), any(), eq(UUID.fromString("44444444-4444-4444-8444-444444444444")))).thenReturn(Map.of("state", "RELEASED"));
        mvc.perform(as(post(HOLDS + "/44444444-4444-4444-8444-444444444444/release"), "PAYMENTS_ADMIN")
            .header("Idempotency-Key", UUID.randomUUID().toString())).andExpect(status().isOk()).andExpect(jsonPath("$.state").value("RELEASED"));
    }
}
