package in.craves.integration.fleet;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

/** Fleet errors are always {code, message}, never request values or SQL. */
@RestControllerAdvice(basePackages = "in.craves.integration.fleet")
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetApiAdvice {
    @ExceptionHandler(FleetApiException.class)
    public ResponseEntity<ErrorBody> refused(FleetApiException error) {
        return body(error.status(), error.code(), error.getMessage());
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ErrorBody> missingHeader(MissingRequestHeaderException error) {
        return "Idempotency-Key".equalsIgnoreCase(error.getHeaderName())
            ? body(400, "IDEMPOTENCY_KEY_REQUIRED", "Reload the page and try again.")
            : body(400, "VALIDATION_FAILED", "Check the details and try again.");
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
        MissingServletRequestParameterException.class, MissingServletRequestPartException.class})
    public ResponseEntity<ErrorBody> unreadable(Exception error) {
        return body(400, "VALIDATION_FAILED", "Check the details and try again.");
    }

    static ResponseEntity<ErrorBody> body(int status, String code, String message) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(new ErrorBody(code, message));
    }

    public record ErrorBody(String code, String message) {
    }
}
