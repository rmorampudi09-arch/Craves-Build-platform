package in.craves.order.referrals;
import com.fasterxml.jackson.databind.JsonNode;
import in.craves.order.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/checkout")
@ConditionalOnProperty(name="CRAVES_REFERRAL_CHECKOUT_BENEFITS_ENABLED",havingValue="true")
public class ReferralCheckoutBenefitsController {
    private final ReferralCheckoutBenefits benefits;
    public ReferralCheckoutBenefitsController(ReferralCheckoutBenefits benefits){this.benefits=benefits;}
    @GetMapping("/{id}/referral-benefits") public JsonNode read(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID id){return benefits.read(actor,id);}
}
