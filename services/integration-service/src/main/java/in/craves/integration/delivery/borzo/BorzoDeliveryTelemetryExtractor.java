package in.craves.integration.delivery.borzo;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Courier;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryExtractor;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.TelemetrySnapshot;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class BorzoDeliveryTelemetryExtractor implements DeliveryTelemetryExtractor {
    @Override
    public String providerId() {
        return BorzoApiClient.PROVIDER_ID;
    }

    @Override
    public TelemetrySnapshot extract(TrackingSnapshot snapshot) {
        Instant observedAt = snapshot.observedAt() == null ? Instant.now() : snapshot.observedAt();
        Courier courier = snapshot.courier();

        JsonNode order = snapshot.delivery() == null
            ? null
            : snapshot.delivery().providerMetadata();
        JsonNode points = order == null ? null : order.path("points");
        JsonNode pickup = points != null && points.isArray() && !points.isEmpty()
            ? points.get(0)
            : null;
        JsonNode dropoff = points != null && points.isArray() && !points.isEmpty()
            ? points.get(points.size() - 1)
            : null;

        ArrivalWindow pickupWindow = arrivalWindow(pickup);
        ArrivalWindow dropoffWindow = arrivalWindow(dropoff);
        boolean hasLocation = courier != null
            && courier.latitude() != null
            && courier.longitude() != null;

        return new TelemetrySnapshot(
            hasLocation ? courier.latitude() : null,
            hasLocation ? courier.longitude() : null,
            hasLocation ? observedAt : null,
            pickupWindow.start(),
            pickupWindow.end(),
            dropoffWindow.start(),
            dropoffWindow.end(),
            observedAt,
            "TRACK"
        );
    }

    private static ArrivalWindow arrivalWindow(JsonNode point) {
        if (point == null || !point.isObject()) {
            return ArrivalWindow.EMPTY;
        }
        Instant start = instant(point, "arrival_start_datetime");
        Instant end = instant(point, "arrival_finish_datetime");
        Instant estimated = instant(point, "estimated_arrival_datetime");
        if (start == null && end == null && estimated != null) {
            return new ArrivalWindow(estimated, estimated);
        }
        return new ArrivalWindow(start, end);
    }

    private static Instant instant(JsonNode object, String field) {
        String value = object.path(field).asText(null);
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return OffsetDateTime.parse(value.trim()).toInstant();
        } catch (DateTimeParseException ignored) {
            try {
                return Instant.parse(value.trim());
            } catch (DateTimeParseException ignoredAgain) {
                return null;
            }
        }
    }

    private record ArrivalWindow(Instant start, Instant end) {
        private static final ArrivalWindow EMPTY = new ArrivalWindow(null, null);
    }
}
