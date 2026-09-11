package in.craves.notification.documents;

import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=DocumentController.class)
public class DocumentApiErrors {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String,String>> status(ResponseStatusException ex) {
        String code=ex.getReason();
        if(code==null || !code.matches("[A-Z0-9_]{1,100}")) code="DOCUMENT_REQUEST_FAILED";
        return response(ex.getStatusCode().value(),code);
    }
    @ExceptionHandler({HttpMessageNotReadableException.class,MethodArgumentTypeMismatchException.class,MissingRequestHeaderException.class})
    public ResponseEntity<Map<String,String>> input(Exception ex) { return response(400,"INVALID_DOCUMENT_REQUEST"); }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,String>> unexpected(Exception ex) { return response(500,"DOCUMENT_OPERATION_FAILED"); }
    private static ResponseEntity<Map<String,String>> response(int status,String code) {
        return ResponseEntity.status(status).header(HttpHeaders.CACHE_CONTROL,"private, no-store, max-age=0")
            .header("X-Content-Type-Options","nosniff").body(Map.of("code",code));
    }
}
