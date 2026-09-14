package in.craves.userchef.email;

import in.craves.userchef.exception.ApiException;
import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=AuthEmailProjectionController.class)
public class AuthEmailProjectionErrors {
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String,String>> rejected(ApiException error) {
        String code=error.getCode();
        if(code==null || !code.matches("[A-Z_]{1,64}")) code="EMAIL_REQUEST_REJECTED";
        return response(error.getStatus(),code);
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,String>> unavailable(Exception ignored) { return response(503,"EMAIL_PROJECTION_UNAVAILABLE"); }
    private ResponseEntity<Map<String,String>> response(int status,String code) {
        return ResponseEntity.status(status).contentType(org.springframework.http.MediaType.APPLICATION_JSON).header("Cache-Control","private, no-store, max-age=0")
            .header("Pragma","no-cache").header("X-Content-Type-Options","nosniff").body(Map.of("code",code));
    }
}
