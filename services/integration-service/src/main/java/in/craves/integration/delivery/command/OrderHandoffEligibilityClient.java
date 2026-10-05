package in.craves.integration.delivery.command;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.config.OrderClientProperties;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Cross-service commercial order check immediately before provider side effects. */
@Component
public class OrderHandoffEligibilityClient {
    private final RestClient client;
    private final String internalKey;

    @Autowired
    public OrderHandoffEligibilityClient(OrderClientProperties config,
                                         RestClient.Builder builder) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build()
        );
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.client = builder.clone().baseUrl(config.internalBaseUrl())
            .requestFactory(factory).build();
        this.internalKey = config.internalKey();
    }

    OrderHandoffEligibilityClient(RestClient client, String internalKey) {
        this.client = client;
        this.internalKey = internalKey;
    }

    public boolean eligible(UUID chefSubOrderId, UUID orderId,
                            UUID deliveryJobId, String borzoProviderDeliveryId) {
        if (internalKey == null || internalKey.isBlank()) {
            throw new IllegalStateException("Order internal service credential is unavailable");
        }
        if (chefSubOrderId == null || orderId == null || deliveryJobId == null
            || borzoProviderDeliveryId == null || borzoProviderDeliveryId.isBlank()) {
            throw new IllegalArgumentException("Handoff eligibility identity is incomplete");
        }
        JsonNode reply = client.get()
            .uri(uri -> uri.path("/delivery-handoff-eligibility/{chefSubOrderId}")
                .queryParam("checkoutId", orderId)
                .queryParam("deliveryJobId", deliveryJobId)
                .queryParam("borzoProviderDeliveryId", borzoProviderDeliveryId)
                .build(chefSubOrderId))
            .header("X-Craves-Internal-Secret", internalKey)
            .retrieve().body(JsonNode.class);
        if (reply == null || !reply.path("eligible").isBoolean()) {
            throw new IllegalStateException("Order handoff eligibility reply is invalid");
        }
        return reply.path("eligible").asBoolean();
    }
}
