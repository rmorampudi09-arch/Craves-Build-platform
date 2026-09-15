package in.craves.notification.email;

import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/** Do not expose SDK, JSON, persistence details or request material through the internal email boundary. */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=VerificationEmailController.class)
public class VerificationEmailErrors {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String,String>> rejected(ResponseStatusException error) {
        String code=error.getReason();if(code==null || !code.matches("[A-Z_]{1,64}"))code="EMAIL_REQUEST_REJECTED";
        return response(error.getStatusCode().value(),code);
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,String>> unavailable(Exception ignored) {return response(503,"EMAIL_TRANSPORT_UNAVAILABLE");}
    private ResponseEntity<Map<String,String>> response(int status,String code) {
        return ResponseEntity.status(status).contentType(org.springframework.http.MediaType.APPLICATION_JSON).header("Cache-Control","private, no-store, max-age=0")
            .header("Pragma","no-cache").header("X-Content-Type-Options","nosniff").body(Map.of("code",code));
    }
}
