package in.craves.integration.fleet;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Grants and revokes the RIDER role through auth-service (POST /internal/v1/roles/rider/grant|revoke, both
 * idempotent). Off until CRAVES_AUTH_INTERNAL_BASE_URL and CRAVES_INTERNAL_SERVICE_KEY are set.
 */
@Component
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetRoleClient {
    private static final Logger LOGGER = LoggerFactory.getLogger(FleetRoleClient.class);

    private final RestClient client;
    private final String secret;

    @Autowired
    public FleetRoleClient(FleetProperties properties, RestClient.Builder builder) {
        this.secret = properties.internalServiceKey();
        if (!StringUtils.hasText(properties.authBaseUrl()) || !StringUtils.hasText(secret)) {
            this.client = null;
            return;
        }
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(5));
        this.client = builder.clone().baseUrl(properties.authBaseUrl()).requestFactory(factory).build();
    }

    FleetRoleClient(RestClient client, String secret) {
        this.client = client;
        this.secret = secret;
    }

    public void grant(UUID identityId, UUID riderId) {
        call("grant", identityId, riderId);
    }

    public void revoke(UUID identityId, UUID riderId) {
        call("revoke", identityId, riderId);
    }

    private void call(String action, UUID identityId, UUID riderId) {
        if (client == null) {
            LOGGER.warn("CRAVES_ALERT alert=FLEET_ROLE_CLIENT_OFF action={} rider={}: auth-service URL or key not set", action, riderId);
            return;
        }
        for (int attempt = 1; ; attempt++) {
            try {
                client.post().uri("/internal/v1/roles/rider/{action}", action)
                    .header("X-Craves-Internal-Secret", secret)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("identityId", identityId, "riderId", riderId))
                    .retrieve().toBodilessEntity();
                return;
            } catch (HttpServerErrorException exception) {
                if (attempt == 1 && exception.getStatusCode().value() == 500) {
                    continue;
                }
                throw failed();
            } catch (RestClientException exception) {
                throw failed();
            }
        }
    }

    private static FleetApiException failed() {
        return new FleetApiException(502, "ROLE_CHANGE_FAILED", "The sign-in service did not confirm the change. Nothing was saved; try again.");
    }
}
