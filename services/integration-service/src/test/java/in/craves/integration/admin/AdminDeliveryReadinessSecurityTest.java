package in.craves.integration.admin;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.delivery.production.DeliveryProviderReadinessService;
import in.craves.integration.delivery.production.HyperlocalProviderContractReadinessService;
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
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({
    AdminDeliveryProviderReadinessController.class,
    AdminHyperlocalProviderContractReadinessController.class
})
@ContextConfiguration(classes = {
    AdminDeliveryProviderReadinessController.class,
    AdminHyperlocalProviderContractReadinessController.class,
    WebSecurityConfiguration.class,
    CravesJwtAuthenticationFilter.class
})
class AdminDeliveryReadinessSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean DeliveryProviderReadinessService deliveryProviderReadinessService;
    @MockBean HyperlocalProviderContractReadinessService contractReadinessService;
    @MockBean JwtVerifier verifier;

    void actor(String token, String role) {
        when(verifier.verify(token)).thenReturn(new CravesPrincipal(UUID.randomUUID(), "", Set.of(role)));
    }

    @Test
    void adminCanReadDeliveryProviderReadiness() throws Exception {
        actor("admin-token", "ADMIN");
        when(deliveryProviderReadinessService.matrix())
            .thenReturn(new DeliveryProviderReadinessService.ReadinessMatrix(List.of(), List.of()));

        mvc.perform(get("/api/v1/admin/operations/delivery-providers/readiness")
                .header("Authorization", "Bearer admin-token"))
            .andExpect(status().isOk());
    }

    @Test
    void adminCanReadDeliveryProviderContractReadiness() throws Exception {
        actor("admin-token", "ADMIN");
        when(contractReadinessService.matrix())
            .thenReturn(new HyperlocalProviderContractReadinessService.ContractReadinessMatrix(List.of()));

        mvc.perform(get("/api/v1/admin/operations/delivery-provider-contracts/readiness")
                .header("Authorization", "Bearer admin-token"))
            .andExpect(status().isOk());
    }

    @Test
    void customerCannotReadDeliveryReadiness() throws Exception {
        actor("customer-token", "CUSTOMER");

        mvc.perform(get("/api/v1/admin/operations/delivery-providers/readiness")
                .header("Authorization", "Bearer customer-token"))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/operations/delivery-provider-contracts/readiness")
                .header("Authorization", "Bearer customer-token"))
            .andExpect(status().isForbidden());
    }
}
