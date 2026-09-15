package in.craves.integration.referrals.checkout;
import in.craves.integration.security.CravesPrincipal;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController
@ConditionalOnProperty(name="CRAVES_REFERRAL_CHECKOUT_BENEFITS_ENABLED",havingValue="true")
public class ReferralCheckoutRecoveryController {
    private final ReferralCheckoutFundingService funding;
    public ReferralCheckoutRecoveryController(ReferralCheckoutFundingService funding){this.funding=funding;}
    @PostMapping("/api/v1/admin/finance/referrals/checkouts/{id}/recover-provider-order")
    public Map<String,String> recover(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID id,@RequestBody ReferralCheckoutFundingService.Recovery request){return funding.recover(actor,id,request);}
    @PostMapping("/api/v1/payments/referral-checkouts/{id}/cancel")
    public Map<String,String> cancel(@AuthenticationPrincipal CravesPrincipal actor,@RequestHeader("Authorization") String authorization,@PathVariable UUID id){return funding.cancel(actor,authorization,id);}

}
