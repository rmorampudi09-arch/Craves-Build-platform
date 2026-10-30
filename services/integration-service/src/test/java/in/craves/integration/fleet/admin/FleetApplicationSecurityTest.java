package in.craves.integration.fleet.admin;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.fleet.FleetApiAdvice;
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

/** The application decision: operations admins decide; the service is told whether the admin may confirm payout accounts. */
@WebMvcTest(FleetApplicationController.class)
@ContextConfiguration(classes = {FleetApplicationController.class, FleetApiAdvice.class, WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class})
@TestPropertySource(properties = "craves.fleet.enabled=true")
class FleetApplicationSecurityTest {
    static final String FLEET = "/api/v1/admin/fleet";
    @Autowired MockMvc mvc;
    @MockBean FleetApplicationService service;
    @MockBean JwtVerifier verifier;
    final UUID rider = UUID.randomUUID();

    MockHttpServletRequestBuilder decisionAs(String role) {
        when(verifier.verify("token-" + role)).thenReturn(new CravesPrincipal(UUID.randomUUID(), "+919000000000", Set.of(role)));
        return post(FLEET + "/riders/" + rider + "/application/decision").header("Authorization", "Bearer token-" + role)
            .header("Idempotency-Key", UUID.randomUUID().toString()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"decision\":\"APPROVE\",\"documents\":[],\"payoutAccount\":\"CONFIRM\","
                + "\"applicationVersion\":\"0123456789abcdef0123456789abcdef\"}");
    }

    @Test
    void onlyOperationsAdminsDecide() throws Exception {
        for (String role : List.of("PAYMENTS_ADMIN", "SUPPORT_ADMIN", "COMPLIANCE_ADMIN", "AUDIT_ADMIN", "RIDER", "ADMIN")) {
            mvc.perform(decisionAs(role)).andExpect(status().isForbidden());
        }
        verifyNoInteractions(service);
    }

    @Test
    void theServiceLearnsWhetherTheAdminMayConfirmPayoutAccounts() throws Exception {
        when(service.decide(any(), anyBoolean(), any(), eq(rider), any())).thenReturn(Map.of("status", "ACTIVE"));
        mvc.perform(decisionAs("OPERATIONS_ADMIN")).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.status").value("ACTIVE"));
        verify(service).decide(any(), eq(false), any(), eq(rider), any());
        mvc.perform(decisionAs("PLATFORM_ADMIN")).andExpect(status().isOk());
        verify(service).decide(any(), eq(true), any(), eq(rider), any());
    }
}
