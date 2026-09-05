package in.craves.integration.delivery.borzo;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Courier;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryExtractor;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.TelemetrySnapshot;
import java.math.BigDecimal;
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
        JsonNode order = snapshot.delivery() == null ? null : snapshot.delivery().providerMetadata();
        return telemetry(order, courier, observedAt, "TRACK");
    }

    @Override
    public TelemetrySnapshot extractWebhook(ProviderStatusUpdate update) {
        JsonNode payload = update.providerMetadata();
        if (payload == null || !payload.isObject()) {
            return null;
        }
        JsonNode order = payload.path("order").isObject() ? payload.path("order") : payload;
        JsonNode courierNode = order.path("courier");
        if (!courierNode.isObject()) {
            courierNode = payload.path("courier");
        }
        if (!courierNode.isObject() && payload.path("delivery").isObject()) {
            courierNode = payload.path("delivery").path("courier");
        }
        Courier courier = courier(courierNode);
        return telemetry(order, courier, update.observedAt(), "WEBHOOK");
    }

    private static TelemetrySnapshot telemetry(
        JsonNode order,
        Courier courier,
        Instant observedAt,
        String source
    ) {
        Instant safeObservedAt = observedAt == null ? Instant.now() : observedAt;
        JsonNode points = order == null ? null : order.path("points");
        JsonNode pickup = points != null && points.isArray() && !points.isEmpty()
            ? points.get(0)
            : null;
        JsonNode dropoff = points != null && points.isArray() && !points.isEmpty()
            ? points.get(points.size() - 1)
            : null;

        ArrivalEstimate pickupEstimate = arrivalEstimate(pickup);
        ArrivalEstimate dropoffEstimate = arrivalEstimate(dropoff);
        boolean hasLocation = courier != null
            && validCoordinatePair(courier.latitude(), courier.longitude());

        return new TelemetrySnapshot(
            hasLocation ? courier.latitude() : null,
            hasLocation ? courier.longitude() : null,
            hasLocation ? safeObservedAt : null,
            pickupEstimate.exact(),
            pickupEstimate.start(),
            pickupEstimate.end(),
            dropoffEstimate.exact(),
            dropoffEstimate.start(),
            dropoffEstimate.end(),
            safeObservedAt,
            source
        );
    }

    private static ArrivalEstimate arrivalEstimate(JsonNode point) {
        if (point == null || !point.isObject()) {
            return ArrivalEstimate.EMPTY;
        }
        return new ArrivalEstimate(
            instant(point, "estimated_arrival_datetime"),
            instant(point, "arrival_start_datetime"),
            instant(point, "arrival_finish_datetime")
        );
    }

    private static Courier courier(JsonNode courier) {
        if (courier == null || !courier.isObject()) {
            return null;
        }
        BigDecimal latitude = decimal(courier, "latitude");
        BigDecimal longitude = decimal(courier, "longitude");
        if (!validCoordinatePair(latitude, longitude)) {
            latitude = null;
            longitude = null;
        }
        return new Courier(
            text(courier, "courier_id"),
            text(courier, "name"),
            text(courier, "phone"),
            text(courier, "photo_url"),
            latitude,
            longitude
        );
    }

    private static boolean validCoordinatePair(BigDecimal latitude, BigDecimal longitude) {
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

    private static String text(JsonNode object, String field) {
        String value = object.path(field).asText(null);
        return StringUtils.hasText(value) ? value.trim() : null;
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

    private record ArrivalEstimate(Instant exact, Instant start, Instant end) {
        private static final ArrivalEstimate EMPTY = new ArrivalEstimate(null, null, null);
    }
}
