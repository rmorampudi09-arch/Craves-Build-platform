package in.craves.integration.ledger;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.pricing.ChefFeePreviewService;
import in.craves.integration.security.CravesPrincipal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class ChefFeePreviewServiceTest {
    final ChefFeePreviewService service=new ChefFeePreviewService();
    CravesPrincipal actor(String role) {return new CravesPrincipal(UUID.randomUUID(),"",Set.of(role));}
    ChefFeePreviewService.Request flat(String amount) {
        return new ChefFeePreviewService.Request("chef-flat-7-v1","INR","PROGRESSIVE",
            List.of(new ChefFeePreviewService.TierInput(null,"7")),null,List.of(amount));
    }
    @Test void sevenPercentPreviewIsClearlyNotActivation() {
        var result=service.preview(actor("PAYMENTS_ADMIN"),flat("369.00"));
        assertTrue(result.simulation());assertFalse(result.activated());
        assertEquals("25.83",result.results().getFirst().fee());
        assertEquals("343.17",result.results().getFirst().estimatedPayableBeforeTaxAndAdjustments());
        assertEquals("CHEF_ORDER_GROSS",result.basis());
    }
    @Test void monetaryResponseValuesAreDecimalStrings() throws Exception {
        var node=new ObjectMapper().valueToTree(service.preview(actor("PLATFORM_ADMIN"),flat("1.50")));
        assertTrue(node.path("results").path(0).path("fee").isTextual());
        assertEquals("0.11",node.path("results").path(0).path("fee").asText());
    }
    @Test void customerChefAuditorAndSupportCannotUseFinanceMutationScope() {
        for(String role:List.of("CUSTOMER","CHEF","AUDIT_ADMIN","SUPPORT_ADMIN","OPERATIONS_ADMIN")) {
            var error=assertThrows(ResponseStatusException.class,()->service.preview(actor(role),flat("369")));
            assertEquals(HttpStatus.FORBIDDEN,error.getStatusCode());
        }
        assertEquals(HttpStatus.FORBIDDEN,assertThrows(ResponseStatusException.class,()->service.preview(null,flat("369"))).getStatusCode());
    }
    @Test void invalidInputIsBadRequestNotInternalError() {
        for(String amount:List.of("0.001","-1","NaN","1e2"))
            assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,()->service.preview(actor("PAYMENTS_ADMIN"),flat(amount))).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST,assertThrows(ResponseStatusException.class,()->service.preview(actor("PAYMENTS_ADMIN"),null)).getStatusCode());
    }
}
