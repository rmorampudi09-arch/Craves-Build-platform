package in.craves.catalog.exception;

import in.craves.catalog.observability.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class AppErrorHandler {
    private static final Logger log = LoggerFactory.getLogger(AppErrorHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorResponse> handleApiException(ApiException ex, HttpServletRequest request) {
        return ResponseEntity.status(ex.getStatus())
            .body(error(ex.getStatus(), ex.getCode(), ex.getMessage(), List.of(), request));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(
        MethodArgumentNotValidException ex,
        HttpServletRequest request
    ) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .toList();
        return ResponseEntity.badRequest()
            .body(error(400, "VALIDATION_FAILED", "Request validation failed", details, request));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiErrorResponse> handleResponseStatus(
        ResponseStatusException ex,
        HttpServletRequest request
    ) {
        HttpStatus resolved = HttpStatus.resolve(ex.getStatusCode().value());
        String code = resolved == null ? "HTTP_" + ex.getStatusCode().value() : resolved.name();
        String message = ex.getReason() == null || ex.getReason().isBlank() ? "Request failed" : ex.getReason();
        return ResponseEntity.status(ex.getStatusCode())
            .body(error(ex.getStatusCode().value(), code, message, List.of(), request));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(Exception ex, HttpServletRequest request) {
        String correlationId = RequestCorrelationFilter.current(request);
        log.error("Unhandled catalog service error correlationId={}", correlationId, ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ApiErrorResponse(
                Instant.now(),
                500,
                "INTERNAL_SERVER_ERROR",
                "INTERNAL_SERVER_ERROR",
                "Unexpected service error",
                List.of(),
                safePath(request),
                correlationId
            ));
    }

    private static ApiErrorResponse error(
        int status,
        String code,
        String message,
        List<String> details,
        HttpServletRequest request
    ) {
        return new ApiErrorResponse(
            Instant.now(),
            status,
            code,
            code,
            message,
            details,
            safePath(request),
            RequestCorrelationFilter.current(request)
        );
    }

    private static String safePath(HttpServletRequest request) {
        return request == null ? null : request.getRequestURI();
    }

    public record ApiErrorResponse(
        Instant timestamp,
        int status,
        String code,
        String error,
        String message,
        List<String> details,
        String path,
        String correlationId
    ) {
        public ApiErrorResponse {
            details = details == null ? List.of() : List.copyOf(details);
        }
    }
}
