package in.craves.subscription.exception;

import in.craves.subscription.observability.RequestCorrelationFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> handleApi(ApiException ex, HttpServletRequest request) {
        return ResponseEntity.status(ex.getStatus()).body(error(
            ex.getStatus(), ex.getCode(), ex.getMessage(), request, List.of()
        ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
            .map(this::format)
            .toList();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(
            400, "VALIDATION_FAILED", "Request validation failed", request, details
        ));
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiError> handleResponseStatus(ResponseStatusException ex, HttpServletRequest request) {
        HttpStatus resolved = HttpStatus.resolve(ex.getStatusCode().value());
        String code = resolved == null ? "HTTP_" + ex.getStatusCode().value() : resolved.name();
        String message = ex.getReason() == null || ex.getReason().isBlank() ? "Request failed" : ex.getReason();
        return ResponseEntity.status(ex.getStatusCode()).body(error(
            ex.getStatusCode().value(), code, message, request, List.of()
        ));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception ex, HttpServletRequest request) {
        String correlationId = RequestCorrelationFilter.current(request);
        log.error("Unhandled subscription service error correlationId={}", correlationId, ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ApiError(
            Instant.now(),
            500,
            "INTERNAL_SERVER_ERROR",
            "INTERNAL_SERVER_ERROR",
            "Internal server error",
            request == null ? null : request.getRequestURI(),
            List.of(),
            correlationId
        ));
    }

    private static ApiError error(
        int status,
        String code,
        String message,
        HttpServletRequest request,
        List<String> details
    ) {
        return new ApiError(
            Instant.now(),
            status,
            code,
            code,
            message,
            request == null ? null : request.getRequestURI(),
            details,
            RequestCorrelationFilter.current(request)
        );
    }

    private String format(FieldError error) {
        return error.getField() + ": " + error.getDefaultMessage();
    }

    public record ApiError(
        Instant timestamp,
        int status,
        String code,
        String error,
        String message,
        String path,
        List<String> details,
        String correlationId
    ) {
        public ApiError {
            details = details == null ? List.of() : List.copyOf(details);
        }
    }
}
