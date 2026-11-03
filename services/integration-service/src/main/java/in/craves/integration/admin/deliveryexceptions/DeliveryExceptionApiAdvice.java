package in.craves.integration.admin.deliveryexceptions;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

/** M25 errors as {code, message}, so the console can say why a step was refused. Messages are the service's fixed texts. */
@RestControllerAdvice(assignableTypes = AdminDeliveryExceptionController.class)
public class DeliveryExceptionApiAdvice {
    public record ErrorBody(String code, String message) {}

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorBody> refused(ResponseStatusException error) {
        int status = error.getStatusCode().value();
        String reason = error.getReason() == null ? "" : error.getReason();
        String code = AdminDeliveryExceptionController.DISABLED.equals(reason) ? "DELIVERY_EXCEPTIONS_DISABLED" : switch (status) {
            case 400 -> "INVALID_REQUEST";
            case 401 -> "AUTHENTICATION_REQUIRED";
            case 403 -> "ADMIN_ROLE_REQUIRED";
            case 404 -> "NOT_FOUND";
            case 409 -> "CONFLICT";
            default -> "REQUEST_FAILED";
        };
        return body(status, code, reason);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ErrorBody> unreadable(Exception error) {
        return body(400, "INVALID_REQUEST", "Check the details and try again.");
    }

    private static ResponseEntity<ErrorBody> body(int status, String code, String message) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(new ErrorBody(code, message));
    }
}
