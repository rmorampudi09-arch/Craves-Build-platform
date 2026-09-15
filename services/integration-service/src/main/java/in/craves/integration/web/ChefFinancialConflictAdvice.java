package in.craves.integration.web;

import java.sql.SQLException;
import java.util.Set;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Never leak SQL, account values or another chef's existence from a database guard. */
@RestControllerAdvice(assignableTypes = ChefFinancialController.class)
public class ChefFinancialConflictAdvice {
    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail financialConflict(DataAccessException exception) {
        Throwable cause=exception;
        while(cause!=null) {
            if(cause instanceof SQLException sql && sql.getSQLState()!=null
                && Set.of("23505","23514","55000","40001","40P01").contains(sql.getSQLState())) {
                var detail=ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                    "The financial state cannot accept this operation. Preserve settled history, use one beneficiary per legacy batch, and refresh the current reservation state.");
                detail.setTitle("Financial state conflict");
                detail.setProperty("code","FINANCIAL_STATE_CONFLICT");
                return detail;
            }
            cause=cause.getCause();
        }
        var detail=ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,"Financial operation could not be completed.");
        detail.setProperty("code","FINANCIAL_OPERATION_FAILED");
        return detail;
    }
}
