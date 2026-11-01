package in.craves.integration.fleet.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetProperties;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Checks the customer's 4-digit delivery code with order-service (POST /internal/v1/orders/{orderId}/delivery-code/verify,
 * orderId = the chef sub-order). Never retried: order-service counts every wrong code, and a retried call could count one
 * twice. The code is never logged.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class DeliveryCodeClient {
    private static final Logger LOGGER = LoggerFactory.getLogger(DeliveryCodeClient.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final RestClient client;
    private final String secret;

    @Autowired
    public DeliveryCodeClient(FleetProperties properties, @Value("${craves.fleet.services.order-base-url:}") String baseUrl,
                              RestClient.Builder builder) {
        this.secret = properties.internalServiceKey();
        if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(secret)) {
            this.client = null;
            return;
        }
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.client = builder.clone().baseUrl(baseUrl).requestFactory(factory).build();
    }

    DeliveryCodeClient(RestClient client, String secret) {
        this.client = client;
        this.secret = secret;
    }

    public Result verify(UUID chefSubOrderId, String code) {
        if (client == null) {
            LOGGER.warn("CRAVES_ALERT alert=FLEET_DELIVERY_CODE_CLIENT_OFF: order-service URL or key not set");
            return new Result(Outcome.UNAVAILABLE, 0);
        }
        try {
            return client.post().uri("/internal/v1/orders/{orderId}/delivery-code/verify", chefSubOrderId)
                .header("X-Craves-Internal-Secret", secret)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("code", code))
                .exchange((request, response) -> switch (response.getStatusCode().value()) {
                    case 200 -> new Result(Outcome.VERIFIED, 0);
                    case 422 -> new Result(Outcome.INVALID, attemptsLeft(response.getBody().readAllBytes()));
                    case 423 -> new Result(Outcome.LOCKED, 0);
                    case 404 -> new Result(Outcome.NOT_FOUND, 0);
                    default -> {
                        LOGGER.warn("FLEET_DELIVERY_CODE_UNAVAILABLE status={}", response.getStatusCode().value());
                        yield new Result(Outcome.UNAVAILABLE, 0);
                    }
                });
        } catch (RestClientException exception) {
            LOGGER.warn("FLEET_DELIVERY_CODE_UNAVAILABLE reason={}", exception.getClass().getSimpleName());
            return new Result(Outcome.UNAVAILABLE, 0);
        }
    }

    private static int attemptsLeft(byte[] body) throws IOException {
        JsonNode reply = JSON.readTree(body);
        return reply == null ? 0 : Math.max(0, reply.path("attemptsLeft").asInt(0));
    }

    public enum Outcome { VERIFIED, INVALID, LOCKED, NOT_FOUND, UNAVAILABLE }

    /** attemptsLeft is set only for INVALID; 0 there means the code is now locked. */
    public record Result(Outcome outcome, int attemptsLeft) {
    }
}
