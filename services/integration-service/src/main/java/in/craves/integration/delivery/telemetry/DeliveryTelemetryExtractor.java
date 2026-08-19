package in.craves.integration.delivery.telemetry;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.TelemetrySnapshot;

public interface DeliveryTelemetryExtractor {
    String providerId();

    TelemetrySnapshot extract(TrackingSnapshot snapshot);

    /**
     * Optional push-telemetry extraction from an already authenticated/normalized provider webhook.
     * Providers that do not expose trustworthy telemetry in callbacks remain tracking-only.
     */
    default TelemetrySnapshot extractWebhook(ProviderStatusUpdate update) {
        return null;
    }
}
