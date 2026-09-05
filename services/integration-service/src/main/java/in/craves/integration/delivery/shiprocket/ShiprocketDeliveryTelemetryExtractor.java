package in.craves.integration.delivery.shiprocket;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryExtractor;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.TelemetrySnapshot;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class ShiprocketDeliveryTelemetryExtractor implements DeliveryTelemetryExtractor {
    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final List<DateTimeFormatter> LOCAL_FORMATTERS = List.of(
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"),
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"),
        DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm:ss"),
        DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm")
    );

    @Override
    public String providerId() {
        return ShiprocketApiClient.PROVIDER_ID;
    }

    @Override
    public TelemetrySnapshot extract(TrackingSnapshot snapshot) {
        Instant observedAt = snapshot.observedAt() == null ? Instant.now() : snapshot.observedAt();
        JsonNode payload = snapshot.delivery() == null ? null : snapshot.delivery().providerMetadata();
        return telemetry(payload, observedAt, "TRACK");
    }

    @Override
    public TelemetrySnapshot extractWebhook(ProviderStatusUpdate update) {
        return telemetry(update.providerMetadata(), update.observedAt(), "WEBHOOK");
    }

    private static TelemetrySnapshot telemetry(JsonNode payload, Instant fallbackObservedAt, String source) {
        Instant observedAt = providerObservedAt(payload, fallbackObservedAt);
        ScanPoint scan = latestGpsScan(payload, observedAt);
        Instant dropoffEta = parseInstant(recursiveText(payload, "etd"));

        return new TelemetrySnapshot(
            scan == null ? null : scan.latitude(),
            scan == null ? null : scan.longitude(),
            scan == null ? null : scan.observedAt(),
            null,
            null,
            null,
            dropoffEta,
            null,
            null,
            observedAt,
            source
        );
    }

    private static Instant providerObservedAt(JsonNode payload, Instant fallback) {
        Instant provider = parseInstant(recursiveText(payload, "current_timestamp"));
        Instant safeFallback = fallback == null ? Instant.now() : fallback;
        if (provider == null || provider.isAfter(Instant.now().plusSeconds(120))) {
            return safeFallback;
        }
        return provider;
    }

    private static ScanPoint latestGpsScan(JsonNode payload, Instant fallbackObservedAt) {
        if (payload == null || payload.isNull() || payload.isMissingNode()) {
            return null;
        }
        List<ScanPoint> candidates = new ArrayList<>();
        collectScans(payload, candidates, fallbackObservedAt);
        return candidates.stream()
            .max(Comparator.comparing(ScanPoint::observedAt))
            .orElse(null);
    }

    private static void collectScans(JsonNode node, List<ScanPoint> target, Instant fallbackObservedAt) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return;
        }
        if (node.isObject()) {
            JsonNode scans = node.get("scans");
            if (scans != null && scans.isArray()) {
                for (JsonNode scan : scans) {
                    ScanPoint candidate = scanPoint(scan, fallbackObservedAt);
                    if (candidate != null) {
                        target.add(candidate);
                    }
                }
            }
            node.fields().forEachRemaining(entry -> collectScans(entry.getValue(), target, fallbackObservedAt));
        } else if (node.isArray()) {
            node.forEach(child -> collectScans(child, target, fallbackObservedAt));
        }
    }

    private static ScanPoint scanPoint(JsonNode scan, Instant fallbackObservedAt) {
        if (scan == null || !scan.isObject()) {
            return null;
        }
        BigDecimal latitude = decimal(scan, "latitude");
        BigDecimal longitude = decimal(scan, "longitude");
        if (!validCoordinates(latitude, longitude)) {
            return null;
        }
        Instant observedAt = firstInstant(
            scan.path("date").asText(null),
            scan.path("timestamp").asText(null),
            scan.path("current_timestamp").asText(null)
        );
        if (observedAt == null) {
            observedAt = fallbackObservedAt == null ? Instant.now() : fallbackObservedAt;
        }
        if (observedAt.isAfter(Instant.now().plusSeconds(120))) {
            return null;
        }
        return new ScanPoint(latitude, longitude, observedAt);
    }

    private static boolean validCoordinates(BigDecimal latitude, BigDecimal longitude) {
        return latitude != null
            && longitude != null
            && latitude.compareTo(BigDecimal.valueOf(-90)) >= 0
            && latitude.compareTo(BigDecimal.valueOf(90)) <= 0
            && longitude.compareTo(BigDecimal.valueOf(-180)) >= 0
            && longitude.compareTo(BigDecimal.valueOf(180)) <= 0
            && !(latitude.signum() == 0 && longitude.signum() == 0);
    }

    private static BigDecimal decimal(JsonNode object, String field) {
        JsonNode value = object.path(field);
        if (value.isNumber()) {
            return value.decimalValue();
        }
        String text = value.asText(null);
        if (!StringUtils.hasText(text)) {
            return null;
        }
        try {
            return new BigDecimal(text.trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String recursiveText(JsonNode node, String field) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return null;
        }
        if (node.isObject()) {
            JsonNode direct = node.get(field);
            if (direct != null && !direct.isContainerNode()) {
                String value = direct.asText(null);
                if (StringUtils.hasText(value)) {
                    return value.trim();
                }
            }
            var iterator = node.elements();
            while (iterator.hasNext()) {
                String nested = recursiveText(iterator.next(), field);
                if (StringUtils.hasText(nested)) {
                    return nested;
                }
            }
        } else if (node.isArray()) {
            for (JsonNode child : node) {
                String nested = recursiveText(child, field);
                if (StringUtils.hasText(nested)) {
                    return nested;
                }
            }
        }
        return null;
    }

    private static Instant firstInstant(String... values) {
        for (String value : values) {
            Instant parsed = parseInstant(value);
            if (parsed != null) {
                return parsed;
            }
        }
        return null;
    }

    private static Instant parseInstant(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String normalized = value.trim();
        try {
            return Instant.parse(normalized);
        } catch (DateTimeParseException ignored) {
            try {
                return OffsetDateTime.parse(normalized).toInstant();
            } catch (DateTimeParseException ignoredAgain) {
                for (DateTimeFormatter formatter : LOCAL_FORMATTERS) {
                    try {
                        return LocalDateTime.parse(normalized, formatter).atZone(INDIA).toInstant();
                    } catch (DateTimeParseException ignoredLocal) {
                        // Try the next provider timestamp shape.
                    }
                }
                return null;
            }
        }
    }

    private record ScanPoint(BigDecimal latitude, BigDecimal longitude, Instant observedAt) {
    }
}
