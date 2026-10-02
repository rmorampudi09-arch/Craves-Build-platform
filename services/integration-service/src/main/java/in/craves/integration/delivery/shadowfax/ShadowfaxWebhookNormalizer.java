package in.craves.integration.delivery.shadowfax;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryWebhookNormalizer;
import java.time.Instant;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class ShadowfaxWebhookNormalizer implements DeliveryWebhookNormalizer {
    @Override public String providerId() { return "shadowfax"; }

    @Override
    public ProviderStatusUpdate normalize(JsonNode payload) {
        String orderId = ShadowfaxApiClient.requireProviderId(payload.path("sfx_order_id").asText(null));
        String providerDeliveryId = payload.path("client_order_id").asText(null);
        if (!StringUtils.hasText(providerDeliveryId)) providerDeliveryId = orderId;
        Instant observedAt = observedAt(payload);
        return new ProviderStatusUpdate(providerId(), orderId, providerDeliveryId,
            ShadowfaxStatusMapper.map(payload), ShadowfaxStatusMapper.providerStatus(payload),
            firstText(payload, "track_url", "track"), observedAt, payload.deepCopy());
    }

    private static Instant observedAt(JsonNode payload) {
        for (String field : java.util.List.of("allot_time", "arrival_time", "dispatch_time",
            "customer_doorstep_arrival_time", "delivery_time", "return_time", "rts_time", "time")) {
            String value = payload.path(field).asText(null);
            if (StringUtils.hasText(value)) return Instant.parse(value);
        }
        return Instant.now();
    }

    private static String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = node.path(field).asText(null);
            if (StringUtils.hasText(value)) return value;
        }
        return null;
    }
}
