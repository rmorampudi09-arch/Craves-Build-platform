package in.craves.integration.subscription;

import in.craves.integration.subscription.SubscriptionPaymentModels.SubscriptionPaymentResponse;
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
public class SubscriptionPaymentLookupService {
    private final JdbcTemplate jdbcTemplate;
    private final SubscriptionPaymentRepository repository;
    private final RestClient subscriptionClient;

    public SubscriptionPaymentLookupService(
        JdbcTemplate jdbcTemplate,
        SubscriptionPaymentRepository repository,
        SubscriptionPaymentProperties properties,
        RestClient.Builder builder
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.repository = repository;
        this.subscriptionClient = StringUtils.hasText(properties.getSubscriptionServiceBaseUrl())
            ? builder.clone().baseUrl(properties.getSubscriptionServiceBaseUrl()).build()
            : null;
    }

    public SubscriptionPaymentResponse getLatestOwned(String authorization, UUID subscriptionId) {
        requireAuthorization(authorization);
        validateOwnership(authorization, subscriptionId);

        UUID invoiceId = jdbcTemplate.query(
            "SELECT invoice_id FROM payment_schema.subscription_payment_intent " +
                "WHERE subscription_id = ? ORDER BY cycle_start DESC, created_at DESC LIMIT 1",
            (rs, rowNum) -> rs.getObject("invoice_id", UUID.class),
            subscriptionId
        ).stream().findFirst().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription payment invoice is not ready")
        );

        return repository.findByInvoice(invoiceId)
            .map(repository::response)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription payment was not found"));
    }

    private void validateOwnership(String authorization, UUID subscriptionId) {
        if (subscriptionClient == null) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Subscription ownership validation is unavailable"
            );
        }
        try {
            subscriptionClient.get()
                .uri("/api/v1/subscriptions/{subscriptionId}", subscriptionId)
                .header(HttpHeaders.AUTHORIZATION, authorization)
                .retrieve()
                .toBodilessEntity();
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 401 || exception.getStatusCode().value() == 403) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Customer access token is invalid");
            }
            if (exception.getStatusCode().value() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription payment was not found");
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Subscription ownership validation failed");
        }
    }

    private static void requireAuthorization(String authorization) {
        if (!StringUtils.hasText(authorization) || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves access token is required");
        }
    }
}
