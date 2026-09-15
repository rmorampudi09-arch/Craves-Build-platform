package in.craves.integration.web;

import in.craves.integration.finance.FinanceCalculations;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.security.CravesPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/finance")
public class FinancePolicyController {
    private final FinancePolicyService policies;
    public FinancePolicyController(FinancePolicyService policies) {this.policies=policies;}
    @GetMapping("/settings") public FinancePolicyService.View view(@AuthenticationPrincipal CravesPrincipal actor) {return policies.view(actor);}
    @PostMapping("/policies") public FinancePolicyService.Draft draft(@AuthenticationPrincipal CravesPrincipal actor,@RequestBody FinancePolicyService.DraftRequest request) {return policies.draft(actor,request);}
    @PostMapping("/policies/{id}/activate") public FinancePolicyService.View activate(@AuthenticationPrincipal CravesPrincipal actor,@PathVariable UUID id,@RequestBody FinancePolicyService.ActivateRequest request) {return policies.activate(actor,id,request);}
    public record Preview(FinancePolicy settings,List<FinanceCalculations.MealQuote> occurrences) {}
    @PostMapping("/subscription-preview") public FinanceCalculations.SubscriptionQuote preview(@AuthenticationPrincipal CravesPrincipal actor,@RequestBody Preview request) {
        FinancePolicyService.operator(actor);return FinanceCalculations.subscription(request.occurrences(),request.settings());
    }
}
