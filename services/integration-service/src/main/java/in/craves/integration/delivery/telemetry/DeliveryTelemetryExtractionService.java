package in.craves.integration.delivery.telemetry;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Courier;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.TelemetrySnapshot;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class DeliveryTelemetryExtractionService {
    private final Map<String, DeliveryTelemetryExtractor> extractors;

    public DeliveryTelemetryExtractionService(List<DeliveryTelemetryExtractor> extractors) {
        Map<String, DeliveryTelemetryExtractor> indexed = new HashMap<>();
        for (DeliveryTelemetryExtractor extractor : extractors) {
            String providerId = normalize(extractor.providerId());
            if (indexed.put(providerId, extractor) != null) {
                throw new IllegalStateException("Duplicate delivery telemetry extractor " + providerId);
            }
        }
        this.extractors = Map.copyOf(indexed);
    }

    public TelemetrySnapshot extract(String providerId, TrackingSnapshot snapshot) {
        if (snapshot == null) {
            return empty(Instant.now());
        }
        DeliveryTelemetryExtractor extractor = extractors.get(normalize(providerId));
        if (extractor != null) {
            TelemetrySnapshot extracted = extractor.extract(snapshot);
            if (extracted != null) {
                return extracted;
            }
        }
        return courierOnly(snapshot);
    }

    private static TelemetrySnapshot courierOnly(TrackingSnapshot snapshot) {
        Courier courier = snapshot.courier();
        Instant observedAt = snapshot.observedAt() == null ? Instant.now() : snapshot.observedAt();
        if (courier == null || courier.latitude() == null || courier.longitude() == null) {
            return empty(observedAt);
        }
        return new TelemetrySnapshot(
            courier.latitude(),
            courier.longitude(),
            observedAt,
            null,
            null,
            null,
            null,
            observedAt,
            "TRACK"
        );
    }

    private static TelemetrySnapshot empty(Instant observedAt) {
        return new TelemetrySnapshot(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            observedAt,
            "TRACK"
        );
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
