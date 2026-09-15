package in.craves.integration.web;

import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.payout.ChefPayoutService;
import in.craves.integration.payout.RazorpayXPayoutClient;
import in.craves.integration.security.CravesPrincipal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class ChefPayoutController {
    private final ChefPayoutService payouts;private final RazorpayXPayoutClient provider;
    public ChefPayoutController(ChefPayoutService payouts,RazorpayXPayoutClient provider) {this.payouts=payouts;this.provider=provider;}
    @GetMapping("/api/v1/chef/finance/balance") public ChefPayoutService.Balance balance(@AuthenticationPrincipal CravesPrincipal actor) {return payouts.balance(actor);}
    @PostMapping("/api/v1/chef/finance/withdrawals") public ChefPayoutService.Payout withdraw(@AuthenticationPrincipal CravesPrincipal actor,@RequestBody ChefPayoutService.Withdrawal request) {return payouts.withdraw(actor,request);}
    @GetMapping("/api/v1/admin/finance/payouts") public List<ChefPayoutService.Payout> list(@AuthenticationPrincipal CravesPrincipal actor) {return payouts.listAdmin(actor);}
    @PostMapping("/api/v1/admin/finance/chefs/{chef}/beneficiary") public Map<String,String> beneficiary(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID chef,@RequestBody ChefPayoutService.Binding request) {
        FinancePolicyService.operator(actor);
        provider.verifyFundAccount(request.fundAccountId(),request.contactId());
        payouts.bindVerifiedBeneficiary(actor,chef,request);
        return Map.of("status","BOUND_ON_HOLD","notice","Bank ownership evidence must be reviewed before release; existing instructions retain their original beneficiary");
    }
    @PostMapping("/api/v1/admin/finance/chefs/{chef}/hold") public Map<String,String> hold(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID chef,@RequestBody ChefPayoutService.Hold request) {
        payouts.hold(actor,chef,request);return Map.of("status",request.onHold()?"ON_HOLD":"HOLD_RELEASED");
    }
}
