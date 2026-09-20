package in.craves.integration.referrals.payout;
import in.craves.integration.security.CravesPrincipal;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/v1/admin/finance/referrals")
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralFinanceController {
    private final ReferralFinanceReviewService reviews;private final ReferralPayoutWorker payouts;
    public ReferralFinanceController(ReferralFinanceReviewService reviews,ReferralPayoutWorker payouts){this.reviews=reviews;this.payouts=payouts;}
    @GetMapping("/reviews") public List<Map<String,Object>> reviews(@AuthenticationPrincipal CravesPrincipal actor,@RequestParam(defaultValue="50") int limit){return reviews.list(actor,limit);}
    @PostMapping("/reviews") public Map<String,Object> draft(@AuthenticationPrincipal CravesPrincipal actor,@RequestBody ReferralFinanceReviewService.Draft body){return reviews.draft(actor,body);}
    @PostMapping("/reviews/{id}/approve") public Map<String,Object> approve(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID id,@RequestBody ReferralFinanceReviewService.Approval body){return reviews.approve(actor,id,body);}
    @GetMapping("/payouts") public List<Map<String,Object>> payouts(@AuthenticationPrincipal CravesPrincipal actor,@RequestParam(defaultValue="50") int limit){return payouts.list(actor,limit);}
    @PostMapping("/payouts/{id}/reconcile") public Map<String,String> reconcile(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID id,@RequestBody ReferralPayoutWorker.Reconcile body){return payouts.reconcile(actor,id,body);}
}
