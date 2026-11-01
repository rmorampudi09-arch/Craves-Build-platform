package in.craves.advanced.platform.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiErrorHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

    @ExceptionHandler(ApiProblem.class)
    ResponseEntity<ErrorBody> problem(ApiProblem problem, HttpServletRequest request) {
        if (problem.status() >= 500) log.warn("{} {}: {}", problem.status(), problem.code(), problem.getMessage());
        return body(problem.status(), problem.code(), problem.getMessage(), problem.details(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorBody> invalid(MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage()).sorted().toList();
        return body(400, "VALIDATION_FAILED", "Request validation failed", details, request);
    }

    @ExceptionHandler({HandlerMethodValidationException.class, ConstraintViolationException.class})
    ResponseEntity<ErrorBody> invalidParameters(Exception ex, HttpServletRequest request) {
        return body(400, "VALIDATION_FAILED", "Request validation failed", List.of(), request);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class, MissingRequestHeaderException.class})
    ResponseEntity<ErrorBody> malformed(Exception ex, HttpServletRequest request) {
        return body(400, "MALFORMED_REQUEST", "The request could not be read", List.of(), request);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ErrorBody> mediaType(HttpMediaTypeNotSupportedException ex, HttpServletRequest request) {
        return body(415, "UNSUPPORTED_MEDIA_TYPE", "Send application/json", List.of(), request);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ErrorBody> method(HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        return body(405, "METHOD_NOT_ALLOWED", "Method not allowed", List.of(), request);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ErrorBody> notFound(NoResourceFoundException ex, HttpServletRequest request) {
        return body(404, "NOT_FOUND", "Not found", List.of(), request);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ErrorBody> integrity(DataIntegrityViolationException ex, HttpServletRequest request) {
        log.warn("Data integrity violation: {}", ex.getMostSpecificCause().getMessage());
        return body(409, "CONFLICT", "The change conflicts with existing data", List.of(), request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorBody> unexpected(Exception ex, HttpServletRequest request) {
        log.error("Unhandled error", ex);
        return body(500, "INTERNAL_ERROR", "Something went wrong", List.of(), request);
    }

    private static ResponseEntity<ErrorBody> body(int status, String code, String message, List<String> details, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.valueOf(status)).header("Cache-Control", "no-store")
                .body(ErrorBody.of(code, message, details, request));
    }
}
