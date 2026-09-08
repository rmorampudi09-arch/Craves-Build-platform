package in.craves.integration.delivery.shadowfax;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryWebhookNormalizer;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class ShadowfaxWebhookNormalizer implements DeliveryWebhookNormalizer {
    private final ShadowfaxStatusMapper statusMapper;

    public ShadowfaxWebhookNormalizer(ShadowfaxStatusMapper statusMapper) {
        this.statusMapper = statusMapper;
    }

    @Override
    public String providerId() {
        return ShadowfaxApiClient.PROVIDER_ID;
    }

    @Override
    public ProviderStatusUpdate normalize(JsonNode payload) {
        if (payload == null || !payload.isObject()) {
            throw new IllegalArgumentException("Shadowfax webhook payload must be a JSON object");
        }
        String orderId = requiredText(payload, "sfx_order_id");
        String status = requiredText(payload, "order_status");
        return new ProviderStatusUpdate(
            providerId(), orderId, orderId, statusMapper.fromProvider(status), status,
            firstText(payload, "track_url", "track"), observedAt(payload), payload.deepCopy()
        );
    }

    private static Instant observedAt(JsonNode payload) {
        String value = ShadowfaxWebhookService.eventTimestamp(payload);
        if ("timestamp-not-supplied".equals(value)) {
            return Instant.now();
        }
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("Shadowfax callback timestamp is invalid", ex);
        }
    }

    private static String requiredText(JsonNode payload, String field) {
        String value = payload.path(field).asText(null);
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("Shadowfax webhook is missing " + field);
        }
        return value;
    }

    private static String firstText(JsonNode payload, String... fields) {
        for (String field : fields) {
            String value = payload.path(field).asText(null);
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }
}
