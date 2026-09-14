package in.craves.integration.payout.bank;

import in.craves.integration.config.BankOnboardingSecurityConfiguration;
import in.craves.integration.config.WebSecurityConfiguration;
import in.craves.integration.security.CravesJwtAuthenticationFilter;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.security.JwtVerifier;
import in.craves.integration.web.BankOnboardingController;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(BankOnboardingController.class)
@Import({BankOnboardingSecurityConfiguration.class,WebSecurityConfiguration.class,CravesJwtAuthenticationFilter.class})
class BankOnboardingSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean BankOnboardingService service;
    @MockBean JwtVerifier verifier;
    @Test void anonymousReadCannotReachBankService()throws Exception {
        mvc.perform(get("/api/v1/chef-onboarding/bank")).andExpect(status().is4xxClientError());verifyNoInteractions(service);
    }
    @Test void anonymousSubmissionCannotReachBankService()throws Exception {
        mvc.perform(post("/api/v1/chef-onboarding/bank").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().is4xxClientError());verifyNoInteractions(service);
    }
    @Test void signedInApplicantCanReachOwnEnrollmentBeforeChefRole()throws Exception {
        var actor=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CUSTOMER"));when(verifier.verify("applicant-token")).thenReturn(actor);
        when(service.status(actor)).thenReturn(new BankOnboardingModels.Status(null,"NOT_SUBMITTED",null,null,false,false,true,"Pending",null));
        mvc.perform(get("/api/v1/chef-onboarding/bank").header("Authorization","Bearer applicant-token"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));verify(service).status(actor);
    }
    @Test void customerCannotReachAdminAutomation()throws Exception {
        when(verifier.verify("customer-token")).thenReturn(new CravesPrincipal(UUID.randomUUID(),"",Set.of("CUSTOMER")));
        mvc.perform(get("/api/v1/admin/finance/bank-onboarding").header("Authorization","Bearer customer-token"))
            .andExpect(status().isForbidden());verify(service,never()).controls(any());
    }
    @Test void applicantExceptionDoesNotOpenExistingChefOnlyRoutes()throws Exception {
        when(verifier.verify("customer-token")).thenReturn(new CravesPrincipal(UUID.randomUUID(),"",Set.of("CUSTOMER")));
        mvc.perform(get("/api/v1/chef/finance/balance").header("Authorization","Bearer customer-token"))
            .andExpect(status().isForbidden());
    }
}
