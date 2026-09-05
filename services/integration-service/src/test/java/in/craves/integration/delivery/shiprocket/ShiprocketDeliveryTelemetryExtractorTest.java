package in.craves.integration.delivery.shiprocket;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class ShiprocketDeliveryTelemetryExtractorTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ShiprocketDeliveryTelemetryExtractor extractor = new ShiprocketDeliveryTelemetryExtractor();

    @Test
    void extractsLatestGpsScanAndExactEtdFromWebhook() {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("current_timestamp", "2026-08-20 04:30:00");
        payload.put("etd", "2026-08-20 05:10:00");
        var scans = payload.putArray("scans");
        scans.addObject()
            .put("date", "2026-08-20 04:29:00")
            .put("latitude", 17.440001)
            .put("longitude", 78.390001);
        scans.addObject()
            .put("date", "2026-08-20 04:30:00")
            .put("latitude", 17.450001)
            .put("longitude", 78.400001);

        Instant fallback = Instant.parse("2026-08-19T23:00:00Z");
        ProviderStatusUpdate update = new ProviderStatusUpdate(
            "shiprocket", "AWB123", "AWB123", DeliveryStatus.IN_TRANSIT,
            "IN TRANSIT", "https://tracking.example/AWB123", fallback, payload
        );

        var telemetry = extractor.extractWebhook(update);

        assertThat(telemetry.courierLatitude()).isEqualByComparingTo("17.450001");
        assertThat(telemetry.courierLongitude()).isEqualByComparingTo("78.400001");
        assertThat(telemetry.locationObservedAt()).isEqualTo(Instant.parse("2026-08-19T23:00:00Z"));
        assertThat(telemetry.estimatedDropoffAt()).isEqualTo(Instant.parse("2026-08-19T23:40:00Z"));
        assertThat(telemetry.source()).isEqualTo("WEBHOOK");
    }

    @Test
    void ignoresDestinationCoordinatesAndZeroZeroOutsideTrustedScans() {
        ObjectNode payload = objectMapper.createObjectNode();
        payload.put("latitude", 17.500000);
        payload.put("longitude", 78.500000);
        payload.putArray("scans")
            .addObject()
            .put("date", "2026-08-20 04:30:00")
            .put("latitude", 0)
            .put("longitude", 0);

        ProviderStatusUpdate update = new ProviderStatusUpdate(
            "shiprocket", "AWB123", "AWB123", DeliveryStatus.IN_TRANSIT,
            "IN TRANSIT", null, Instant.parse("2026-08-19T23:00:00Z"), payload
        );

        var telemetry = extractor.extractWebhook(update);

        assertThat(telemetry.courierLatitude()).isNull();
        assertThat(telemetry.courierLongitude()).isNull();
        assertThat(telemetry.locationObservedAt()).isNull();
    }

    @Test
    void extractsNestedTrackingScansFromPollResponseMetadata() {
        ObjectNode payload = objectMapper.createObjectNode();
        ObjectNode trackingData = payload.putObject("tracking_data");
        trackingData.put("etd", "2026-08-20 05:20:00");
        trackingData.putArray("scans")
            .addObject()
            .put("date", "2026-08-20 04:35:00")
            .put("latitude", "17.460001")
            .put("longitude", "78.410001");
        Instant observedAt = Instant.parse("2026-08-19T23:05:00Z");
        TrackingSnapshot snapshot = new TrackingSnapshot(
            new ProviderDelivery(
                "shiprocket", "AWB123", "CRV", DeliveryStatus.IN_TRANSIT, "IN TRANSIT",
                null, null, "https://tracking.example/AWB123", payload, observedAt
            ),
            null,
            observedAt
        );

        var telemetry = extractor.extract(snapshot);

        assertThat(telemetry.courierLatitude()).isEqualByComparingTo("17.460001");
        assertThat(telemetry.courierLongitude()).isEqualByComparingTo("78.410001");
        assertThat(telemetry.estimatedDropoffAt()).isEqualTo(Instant.parse("2026-08-19T23:50:00Z"));
        assertThat(telemetry.source()).isEqualTo("TRACK");
    }
}
