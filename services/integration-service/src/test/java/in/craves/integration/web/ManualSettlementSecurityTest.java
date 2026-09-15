package in.craves.integration.web;

import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.payout.ManualChefSettlementService;
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
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ManualChefSettlementController.class)
@ContextConfiguration(classes={ManualChefSettlementController.class,ManualSettlementApiAdvice.class,
    WebSecurityConfiguration.class,CravesJwtAuthenticationFilter.class})
class ManualSettlementSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean ManualChefSettlementService service;
    @MockBean JwtVerifier verifier;
    final String route="/api/v1/admin/finance/manual-settlements";
    final String reserve="/api/v1/admin/finance/chefs/"+UUID.randomUUID()+"/manual-settlements";
    void actor(String role){when(verifier.verify("token")).thenReturn(new CravesPrincipal(UUID.randomUUID(),"",Set.of(role)));}
    @Test void anonymousCannotReadOrWrite()throws Exception {
        mvc.perform(get(route)).andExpect(status().is4xxClientError());
        mvc.perform(post(reserve).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().is4xxClientError());verifyNoInteractions(service);
    }
    @Test void customerAndChefCannotReachAdminSettlement()throws Exception {
        for(String role:List.of("CUSTOMER","CHEF")){actor(role);mvc.perform(get(route).header("Authorization","Bearer token")).andExpect(status().isForbidden());}
        verifyNoInteractions(service);
    }
    @Test void operatorCanReadWithNoStore()throws Exception {
        actor("PAYMENTS_ADMIN");when(service.list(any())).thenReturn(List.of());
        mvc.perform(get(route).header("Authorization","Bearer token")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
    }
    @Test void financeReaderCannotMutate()throws Exception {
        actor("AUDIT_ADMIN");mvc.perform(post(reserve).header("Authorization","Bearer token").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden());verifyNoInteractions(service);
    }
    @Test void oversizedBodyIsRejectedBeforeService()throws Exception {
        actor("PAYMENTS_ADMIN");mvc.perform(post(reserve).header("Authorization","Bearer token").contentType(MediaType.APPLICATION_JSON).content("x".repeat(16385)))
            .andExpect(status().isPayloadTooLarge()).andExpect(header().string("Cache-Control","no-store"));verifyNoInteractions(service);
    }
    @Test void unknownBankFieldsAreRejectedWithoutEcho()throws Exception {
        actor("PAYMENTS_ADMIN");mvc.perform(post(reserve).header("Authorization","Bearer token").contentType(MediaType.APPLICATION_JSON)
            .content("{\"accountNumber\":\"TEST_PRIVATE_VALUE\"}"))
            .andExpect(status().isBadRequest()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("TEST_PRIVATE_VALUE"))));verifyNoInteractions(service);
    }
    @Test void nonJsonIsRejectedBeforeReadingBody()throws Exception {
        actor("PAYMENTS_ADMIN");mvc.perform(post(reserve).header("Authorization","Bearer token").contentType(MediaType.TEXT_PLAIN).content("TEST"))
            .andExpect(status().isUnsupportedMediaType());verifyNoInteractions(service);
    }
}
