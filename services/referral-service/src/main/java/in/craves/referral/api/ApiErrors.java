package in.craves.referral.api;

import in.craves.referral.ReferralProblem;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.MethodParameter;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

@RestControllerAdvice
public class ApiErrors implements ResponseBodyAdvice<Object> {
    @Override public boolean supports(MethodParameter parameter,Class<? extends HttpMessageConverter<?>> converter) { return true; }
    @Override public Object beforeBodyWrite(Object body,MethodParameter parameter,MediaType contentType,Class<? extends HttpMessageConverter<?>> converter,ServerHttpRequest request,ServerHttpResponse response) {
        response.getHeaders().set("Cache-Control","private, no-store, max-age=0");
        response.getHeaders().set("X-Content-Type-Options","nosniff"); return body;
    }
    @ExceptionHandler(ReferralProblem.class) ResponseEntity<?> problem(ReferralProblem ex) { return error(ex.status(),ex.getMessage()); }
    @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<?> invariant(DataIntegrityViolationException ex) { return error(409,"REFERRAL_INVARIANT_PROTECTED"); }
    @ExceptionHandler(DataAccessException.class) ResponseEntity<?> database(DataAccessException ex) { return error(503,"REFERRAL_DATABASE_UNAVAILABLE"); }
    @ExceptionHandler({IllegalArgumentException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    ResponseEntity<?> invalid(Exception ex) { return error(422,"INVALID_REQUEST_VALUE"); }
    @ExceptionHandler(Exception.class) ResponseEntity<?> unexpected(Exception ex) { return error(500,"REFERRAL_OPERATION_UNCERTAIN"); }
    private static ResponseEntity<?> error(int status,String code) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(Map.of("code",code,"requestId",UUID.randomUUID().toString()));
    }
}
