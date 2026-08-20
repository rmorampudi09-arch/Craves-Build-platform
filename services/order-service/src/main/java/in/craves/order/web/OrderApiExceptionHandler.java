package in.craves.order.web;

import in.craves.order.exception.OrderApiException;
import in.craves.order.observability.RequestCorrelationFilter;
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
public class OrderApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(OrderApiExceptionHandler.class);

    @ExceptionHandler(OrderApiException.class)
    public ResponseEntity<StandardApiErrorResponse> handleOrderApiException(
        OrderApiException exception,
        HttpServletRequest request
    ) {
        return ResponseEntity.status(exception.status())
            .body(error(
                exception.status().value(),
                exception.code(),
                exception.getMessage(),
                List.of(),
                request
            ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<StandardApiErrorResponse> handleValidation(
        MethodArgumentNotValidException exception,
        HttpServletRequest request
    ) {
        List<String> details = exception.getBindingResult().getFieldErrors().stream()
            .map(fieldError -> fieldError.getField() + ": " + fieldError.getDefaultMessage())
            .toList();
        return ResponseEntity.badRequest()
            .body(error(400, "VALIDATION_FAILED", "Request validation failed", details, request));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<StandardApiErrorResponse> handleResponseStatus(
        ResponseStatusException exception,
        HttpServletRequest request
    ) {
        HttpStatus resolved = HttpStatus.resolve(exception.getStatusCode().value());
        String code = resolved == null ? "HTTP_" + exception.getStatusCode().value() : resolved.name();
        String message = exception.getReason() == null || exception.getReason().isBlank()
            ? "Request failed"
            : exception.getReason();
        return ResponseEntity.status(exception.getStatusCode())
            .body(error(exception.getStatusCode().value(), code, message, List.of(), request));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<StandardApiErrorResponse> handleUnexpected(
        Exception exception,
        HttpServletRequest request
    ) {
        String correlationId = RequestCorrelationFilter.current(request);
        log.error("Unhandled order service error correlationId={}", correlationId, exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new StandardApiErrorResponse(
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

    private static StandardApiErrorResponse error(
        int status,
        String code,
        String message,
        List<String> details,
        HttpServletRequest request
    ) {
        return new StandardApiErrorResponse(
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
}
