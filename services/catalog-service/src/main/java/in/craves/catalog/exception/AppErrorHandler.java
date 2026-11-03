package in.craves.catalog.exception;

import com.azure.storage.blob.models.BlobStorageException;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class AppErrorHandler {
    private static final Logger log = LoggerFactory.getLogger(AppErrorHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ApiErrorResponse> handleApiException(ApiException ex) {
        return ResponseEntity.status(ex.getStatus())
            .body(new ApiErrorResponse(Instant.now(), ex.getCode(), ex.getMessage(), List.of()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<String> details = ex.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .toList();
        return ResponseEntity.badRequest()
            .body(new ApiErrorResponse(Instant.now(), "VALIDATION_FAILED", "Request validation failed", details));
    }

    /** Photo storage refused a read or write: say so, with Azure's code, instead of failing as an unexplained error. */
    @ExceptionHandler(BlobStorageException.class)
    public ResponseEntity<ApiErrorResponse> handleStorage(BlobStorageException ex) {
        log.error("Media storage refused the request: status={} code={}", ex.getStatusCode(), ex.getErrorCode(), ex);
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
            .body(new ApiErrorResponse(
                Instant.now(),
                "MEDIA_STORE_FAILED",
                "Photos can't be saved right now. Please try again later.",
                List.of("storage: " + ex.getErrorCode())
            ));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiErrorResponse> handleTooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
            .body(new ApiErrorResponse(Instant.now(), "PHOTO_TOO_LARGE", "This photo is too large. Choose one under 8 MB.", List.of()));
    }

    public record ApiErrorResponse(Instant timestamp, String code, String message, List<String> details) {
    }
}
