package in.craves.integration.delivery.telemetry;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.TelemetrySnapshot;

public interface DeliveryTelemetryExtractor {
    String providerId();

    TelemetrySnapshot extract(TrackingSnapshot snapshot);
}
