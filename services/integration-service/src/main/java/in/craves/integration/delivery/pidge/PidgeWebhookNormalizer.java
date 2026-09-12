package in.craves.integration.delivery.pidge;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryWebhookNormalizer;
import java.time.Instant;
import org.springframework.stereotype.Component;

@Component
public class PidgeWebhookNormalizer implements DeliveryWebhookNormalizer {
    @Override public String providerId() { return "pidge"; }
    @Override public ProviderStatusUpdate normalize(JsonNode payload) {
        String id = PidgeApiClient.requiredId(payload.path("id").asText(null));
        return new ProviderStatusUpdate(providerId(), id, id, PidgeStatusMapper.map(payload),
            PidgeStatusMapper.providerStatus(payload), null, Instant.parse(payload.path("updated_at").asText()), payload.deepCopy());
    }
}
