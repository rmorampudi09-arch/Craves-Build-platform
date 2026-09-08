package in.craves.supportassistant.web;

import in.craves.supportassistant.observability.RequestCorrelationFilter;
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
public class ApiErrorHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .toList();
        return ResponseEntity.badRequest().body(error(400, "VALIDATION_FAILED", "Request validation failed", details, request));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiError> status(ResponseStatusException ex, HttpServletRequest request) {
        HttpStatus resolved = HttpStatus.resolve(ex.getStatusCode().value());
        String code = resolved == null ? "HTTP_" + ex.getStatusCode().value() : resolved.name();
        String message = ex.getReason() == null || ex.getReason().isBlank() ? "Request failed" : ex.getReason();
        return ResponseEntity.status(ex.getStatusCode()).body(error(
            ex.getStatusCode().value(), code, message, List.of(), request
        ));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception ex, HttpServletRequest request) {
        String correlationId = RequestCorrelationFilter.current(request);
        log.error("Unhandled support assistant error correlationId={}", correlationId, ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error(
            500, "INTERNAL_SERVER_ERROR", "Unexpected service error", List.of(), request
        ));
    }

    private static ApiError error(
        int status,
        String code,
        String message,
        List<String> details,
        HttpServletRequest request
    ) {
        return new ApiError(
            Instant.now(), status, code, code, message, details,
            request == null ? null : request.getRequestURI(),
            RequestCorrelationFilter.current(request)
        );
    }

    public record ApiError(
        Instant timestamp,
        int status,
        String code,
        String error,
        String message,
        List<String> details,
        String path,
        String correlationId
    ) {
        public ApiError {
            details = details == null ? List.of() : List.copyOf(details);
        }
    }
}
