package in.craves.integration.admin.deliveryintelligence;

import in.craves.integration.config.WebSecurityConfiguration;
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
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AdminDeliveryIntelligenceController.class)
@ContextConfiguration(classes={AdminDeliveryIntelligenceController.class,WebSecurityConfiguration.class,CravesJwtAuthenticationFilter.class})
class DeliveryIntelligenceSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean DeliveryIntelligenceReadRepository repository;
    @MockBean DeliveryIntelligenceHistoryReadRepository historyRepository;
    @MockBean JwtVerifier verifier;
    final String route="/api/v1/admin/operations/delivery-intelligence/overview";
    void actor(Set<String> roles){when(verifier.verify("token")).thenReturn(new CravesPrincipal(UUID.randomUUID(),"",roles));}
    @Test void retiredAdminRoleCannotReadDeliveryIntelligence()throws Exception {
        for(Set<String> roles:List.of(Set.of("ADMIN"),Set.of("CUSTOMER","ADMIN"))){actor(roles);mvc.perform(get(route).header("Authorization","Bearer token")).andExpect(status().isForbidden());}
        verifyNoInteractions(repository,historyRepository);
    }
    @Test void operationsAdminCanReadDeliveryIntelligence()throws Exception {
        actor(Set.of("OPERATIONS_ADMIN"));mvc.perform(get(route).header("Authorization","Bearer token")).andExpect(status().isOk());
    }
}
