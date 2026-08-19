package in.craves.integration.delivery.borzo;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Courier;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class BorzoDeliveryTelemetryExtractorTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final BorzoDeliveryTelemetryExtractor extractor = new BorzoDeliveryTelemetryExtractor();

    @Test
    void extractsCourierCoordinatesAndProviderArrivalWindows() {
        ObjectNode order = objectMapper.createObjectNode();
        ArrayNode points = order.putArray("points");
        points.addObject()
            .put("arrival_start_datetime", "2026-08-20T04:00:00+05:30")
            .put("arrival_finish_datetime", "2026-08-20T04:10:00+05:30");
        points.addObject()
            .put("estimated_arrival_datetime", "2026-08-20T04:35:00+05:30");

        Instant observedAt = Instant.parse("2026-08-19T22:20:00Z");
        TrackingSnapshot snapshot = new TrackingSnapshot(
            new ProviderDelivery(
                "borzo", "12345", "CRV", DeliveryStatus.IN_TRANSIT, "active",
                null, null, "https://tracking.example/12345", order, observedAt
            ),
            new Courier(
                "courier-1", "Courier", "+910000000000", null,
                new BigDecimal("17.443210"), new BigDecimal("78.391234")
            ),
            observedAt
        );

        var telemetry = extractor.extract(snapshot);

        assertThat(telemetry.courierLatitude()).isEqualByComparingTo("17.443210");
        assertThat(telemetry.courierLongitude()).isEqualByComparingTo("78.391234");
        assertThat(telemetry.locationObservedAt()).isEqualTo(observedAt);
        assertThat(telemetry.estimatedPickupStartAt()).isEqualTo(Instant.parse("2026-08-19T22:30:00Z"));
        assertThat(telemetry.estimatedPickupEndAt()).isEqualTo(Instant.parse("2026-08-19T22:40:00Z"));
        assertThat(telemetry.estimatedDropoffStartAt()).isEqualTo(Instant.parse("2026-08-19T23:05:00Z"));
        assertThat(telemetry.estimatedDropoffEndAt()).isEqualTo(Instant.parse("2026-08-19T23:05:00Z"));
    }

    @Test
    void malformedArrivalTimesDoNotBreakTrackingTelemetry() {
        ObjectNode order = objectMapper.createObjectNode();
        order.putArray("points")
            .addObject().put("arrival_start_datetime", "not-a-time");

        Instant observedAt = Instant.parse("2026-08-19T22:20:00Z");
        TrackingSnapshot snapshot = new TrackingSnapshot(
            new ProviderDelivery(
                "borzo", "12345", "CRV", DeliveryStatus.IN_TRANSIT, "active",
                null, null, null, order, observedAt
            ),
            new Courier(
                "courier-1", "Courier", null, null,
                new BigDecimal("17.44"), new BigDecimal("78.39")
            ),
            observedAt
        );

        var telemetry = extractor.extract(snapshot);

        assertThat(telemetry.courierLatitude()).isEqualByComparingTo("17.44");
        assertThat(telemetry.estimatedPickupStartAt()).isNull();
        assertThat(telemetry.estimatedDropoffStartAt()).isNull();
    }
}
