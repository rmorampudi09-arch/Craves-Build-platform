package in.craves.integration.web;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes=BankOnboardingController.class)
public class BankOnboardingAdvice {
    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail invalid(IllegalArgumentException ignored) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Check consent, matching bank numbers, IFSC and the account holder name from your saved chef application.");
    }
    @ExceptionHandler(IllegalStateException.class)
    public ProblemDetail unavailable(IllegalStateException ignored) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "Bank enrollment cannot be confirmed right now. Do not assume the account is payout-ready.");
    }
    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail database(DataAccessException error) {return new ChefFinancialConflictAdvice().financialConflict(error);}
}
