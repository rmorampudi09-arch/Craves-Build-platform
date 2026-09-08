package in.craves.integration.web;

import in.craves.integration.delivery.borzo.BorzoApiClient.BorzoApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = BorzoInternalController.class)
public class BorzoControllerAdvice {
    private static final Logger log = LoggerFactory.getLogger(BorzoControllerAdvice.class);

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<IntegrationApiErrorResponse> invalidRequest(IllegalArgumentException ex, HttpServletRequest request) {
        return ResponseEntity.badRequest().body(IntegrationApiErrorHandler.error(
            400,
            "INVALID_DELIVERY_REQUEST",
            "Invalid delivery request",
            List.of(),
            request
        ));
    }

    @ExceptionHandler(BorzoApiException.class)
    ResponseEntity<IntegrationApiErrorResponse> providerFailure(BorzoApiException ex, HttpServletRequest request) {
        HttpStatus status = isConfigurationFailure(ex) ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;
        log.warn(
            "Borzo provider operation failed providerStatus={} message={}",
            ex.getProviderStatus(),
            ex.getMessage()
        );
        return ResponseEntity.status(status).body(IntegrationApiErrorHandler.error(
            status.value(),
            isConfigurationFailure(ex) ? "DELIVERY_PROVIDER_UNAVAILABLE" : "DELIVERY_PROVIDER_FAILURE",
            "Delivery provider operation failed",
            List.of(),
            request
        ));
    }

    private static boolean isConfigurationFailure(BorzoApiException ex) {
        String message = ex.getMessage();
        return message != null
            && (message.contains("disabled") || message.contains("not configured"));
    }
}
