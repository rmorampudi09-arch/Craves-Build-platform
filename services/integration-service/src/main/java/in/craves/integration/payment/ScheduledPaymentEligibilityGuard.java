package in.craves.integration.payment;

import in.craves.integration.config.OrderClientProperties;
import in.craves.integration.config.ScheduledPaymentGuardProperties;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ScheduledPaymentEligibilityGuard {
    private final JdbcTemplate jdbc;
    private final ScheduledPaymentGuardProperties properties;
    private final OrderClientProperties orderProperties;
    private final RestClient customerOrderClient;
    private final RestClient internalOrderClient;

    public ScheduledPaymentEligibilityGuard(
        JdbcTemplate jdbc,
        ScheduledPaymentGuardProperties properties,
        OrderClientProperties orderProperties,
        RestClient.Builder builder
    ) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.orderProperties = orderProperties;
        this.customerOrderClient = builder.clone().baseUrl(orderProperties.baseUrl()).build();
        this.internalOrderClient = builder.clone().baseUrl(orderProperties.internalBaseUrl()).build();
    }

    public void requireEligibleForNewPayment(
        String authorizationHeader,
        UUID checkoutId
    ) {
        if (!properties.enabled()) {
            return;
        }
        requireBearer(authorizationHeader);
        if (checkoutId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "checkoutId is required");
        }

        Integer existing = jdbc.queryForObject(
            "SELECT COUNT(*) FROM payment_schema.payment_order WHERE checkout_id = ?",
            Integer.class,
            checkoutId
        );
        if (existing != null && existing > 0) {
            // Existing provider orders must remain recoverable/idempotent even if schedule state changes later.
            return;
        }

        validateOwnedCheckout(authorizationHeader, checkoutId);
        if (!StringUtils.hasText(orderProperties.internalKey())) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Scheduled payment guard is enabled but the internal Order Service key is unavailable"
            );
        }

        try {
            PaymentEligibilityResponse response = internalOrderClient.get()
                .uri("/checkouts/{checkoutId}/schedule-payment-eligibility", checkoutId)
                .header("X-Craves-Internal-" + "Secret", orderProperties.internalKey())
                .retrieve()
                .body(PaymentEligibilityResponse.class);
            validateEligibility(checkoutId, response);
        } catch (RestClientResponseException exception) {
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Order scheduling eligibility could not be verified"
            );
        }
    }

    private void validateOwnedCheckout(String authorizationHeader, UUID checkoutId) {
        try {
            OwnedCheckoutResponse response = customerOrderClient.get()
                .uri("/checkout/{checkoutId}", checkoutId)
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader)
                .retrieve()
                .body(OwnedCheckoutResponse.class);
            if (response == null || response.id() == null || !checkoutId.equals(response.id())) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout was not found");
            }
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 401 || exception.getStatusCode().value() == 403) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Customer access token is invalid");
            }
            if (exception.getStatusCode().value() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout was not found");
            }
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Checkout ownership could not be verified"
            );
        }
    }

    static void validateEligibility(UUID checkoutId, PaymentEligibilityResponse response) {
        if (response == null
            || response.checkoutId() == null
            || !checkoutId.equals(response.checkoutId())
            || !StringUtils.hasText(response.fulfilmentMode())
            || !StringUtils.hasText(response.reasonCode())) {
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Order scheduling eligibility response was invalid"
            );
        }
        if (!"ASAP".equals(response.fulfilmentMode())
            && !"SCHEDULED".equals(response.fulfilmentMode())) {
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Order scheduling eligibility response was invalid"
            );
        }
        if (!response.paymentEligible()) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Checkout is not currently eligible for payment: " + safeReason(response.reasonCode())
            );
        }
    }

    private static void requireBearer(String authorizationHeader) {
        if (!StringUtils.hasText(authorizationHeader)
            || !authorizationHeader.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Missing or invalid access token");
        }
    }

    private static String safeReason(String value) {
        String normalized = value == null ? "SCHEDULE_NOT_ELIGIBLE" : value.trim();
        if (!normalized.matches("[A-Z0-9_]{1,80}")) {
            return "SCHEDULE_NOT_ELIGIBLE";
        }
        return normalized;
    }

    record OwnedCheckoutResponse(UUID id, UUID customerIdentityId, String status) {
    }

    public record PaymentEligibilityResponse(
        UUID checkoutId,
        String fulfilmentMode,
        boolean paymentEligible,
        String reasonCode,
        UUID scheduleRequestId,
        String scheduleStatus
    ) {
    }
}
