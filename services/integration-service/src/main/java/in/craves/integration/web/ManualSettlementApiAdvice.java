package in.craves.integration.web;

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
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ProblemDetail> rejected(ResponseStatusException error) {
        return response(error.getStatusCode().value(),"Manual settlement request was rejected. Refresh the instruction before retrying.");
    }
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ProblemDetail> conflict(DataAccessException error) {
        return response(409,"Settlement evidence or financial state conflicts. No new bank outcome was recorded.");
    }
    @ExceptionHandler({IllegalArgumentException.class,NullPointerException.class})
    public ResponseEntity<ProblemDetail> invalid(RuntimeException error) {
        return response(400,"Invalid manual settlement request.");
    }
    private static ResponseEntity<ProblemDetail> response(int status,String detail) {
        var body=ProblemDetail.forStatusAndDetail(HttpStatus.valueOf(status),detail);
        return ResponseEntity.status(status).header("Cache-Control","no-store").body(body);
    }
}
