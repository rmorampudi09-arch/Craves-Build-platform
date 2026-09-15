package in.craves.integration.web;

import in.craves.integration.payout.FinancePayoutReconciliationService;
import in.craves.integration.security.CravesPrincipal;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class FinancePayoutReconciliationController {
    private final FinancePayoutReconciliationService service;
    public FinancePayoutReconciliationController(FinancePayoutReconciliationService service) {this.service=service;}
    @PostMapping("/api/v1/admin/finance/payouts/{id}/reconcile")
    public FinancePayoutReconciliationService.Result reconcile(@AuthenticationPrincipal CravesPrincipal actor,
        @PathVariable UUID id,@RequestBody FinancePayoutReconciliationService.Request request) {
        return service.reconcile(actor,id,request);
    }
}
