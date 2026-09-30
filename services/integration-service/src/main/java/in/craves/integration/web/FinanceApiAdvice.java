package in.craves.integration.web;

import in.craves.integration.payout.ManualSettlementException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes={FinancePolicyController.class,ChefPayoutController.class,RazorpayXPayoutWebhookController.class,
    FinancePayoutReconciliationController.class,ChefTaxProfileController.class,InternalOrderFinanceController.class,FinanceSourceOperationsController.class})
public class FinanceApiAdvice {
    @ExceptionHandler(ManualSettlementException.class)
    public ResponseEntity<ProblemDetail> manualOperation(ManualSettlementException error) {
        var result=ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,error.operationReason().detail());
        result.setProperty("code",error.operationReason().name());
        return ResponseEntity.status(HttpStatus.CONFLICT).header("Cache-Control","no-store").header("Pragma","no-cache").body(result);
    }
    @ExceptionHandler({IllegalArgumentException.class,NullPointerException.class})
    public ProblemDetail invalid(RuntimeException exception){var result=ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,"Invalid finance request. Check exact-paise amounts, required fields and policy limits.");result.setProperty("code","INVALID_FINANCE_REQUEST");return result;}
    @ExceptionHandler(IllegalStateException.class)
    public ProblemDetail state(IllegalStateException exception){var result=ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,"Finance context or provider evidence cannot be verified; no money movement was confirmed.");result.setProperty("code","FINANCE_CONTEXT_UNVERIFIED");return result;}
    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail database(DataAccessException exception){return new ChefFinancialConflictAdvice().financialConflict(exception);}
}
