package in.craves.integration.web;

import in.craves.integration.payout.ManualSettlementException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/** Never expose bank references, SQL values or request bodies through finance error responses. */
@RestControllerAdvice(assignableTypes=ManualChefSettlementController.class)
public class ManualSettlementApiAdvice {
    @ExceptionHandler(ManualSettlementException.class)
    public ResponseEntity<ProblemDetail> operation(ManualSettlementException error) {
        return response(409,error.operationReason().name(),error.operationReason().detail());
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ProblemDetail> rejected(ResponseStatusException error) {
        return response(error.getStatusCode().value(),"MANUAL_SETTLEMENT_REQUEST_REJECTED","Manual settlement request was rejected. Refresh the instruction before retrying.");
    }
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ProblemDetail> conflict(DataAccessException error) {
        return response(409,"MANUAL_SETTLEMENT_STATE_CONFLICT","Settlement evidence or financial state conflicts. No new bank outcome was recorded.");
    }
    @ExceptionHandler({IllegalArgumentException.class,NullPointerException.class})
    public ResponseEntity<ProblemDetail> invalid(RuntimeException error) {
        return response(400,"INVALID_MANUAL_SETTLEMENT_REQUEST","Invalid manual settlement request.");
    }
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ProblemDetail> unverified(IllegalStateException error) {
        return response(409,"MANUAL_SETTLEMENT_CONTEXT_UNVERIFIED","The payment's accounting context could not be verified. No new bank outcome was recorded.");
    }
    private static ResponseEntity<ProblemDetail> response(int status,String code,String detail) {
        var body=ProblemDetail.forStatusAndDetail(HttpStatus.valueOf(status),detail);
        body.setProperty("code",code);
        return ResponseEntity.status(status).header("Cache-Control","no-store").header("Pragma","no-cache").body(body);
    }
}
