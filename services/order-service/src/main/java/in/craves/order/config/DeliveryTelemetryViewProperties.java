package in.craves.order.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DeliveryTelemetryViewProperties {
    private final boolean liveLocationExposureEnabled;
    private final int liveLocationMaxAgeSeconds;

    public DeliveryTelemetryViewProperties(
        @Value("${CRAVES_DELIVERY_LIVE_LOCATION_EXPOSURE_ENABLED:false}") boolean liveLocationExposureEnabled,
        @Value("${CRAVES_DELIVERY_LIVE_LOCATION_MAX_AGE_SECONDS:300}") int liveLocationMaxAgeSeconds
    ) {
        if (liveLocationMaxAgeSeconds < 30 || liveLocationMaxAgeSeconds > 3600) {
            throw new IllegalStateException(
                "CRAVES_DELIVERY_LIVE_LOCATION_MAX_AGE_SECONDS must be between 30 and 3600"
            );
        }
        this.liveLocationExposureEnabled = liveLocationExposureEnabled;
        this.liveLocationMaxAgeSeconds = liveLocationMaxAgeSeconds;
    }

    public boolean isLiveLocationExposureEnabled() {
        return liveLocationExposureEnabled;
    }

    public int getLiveLocationMaxAgeSeconds() {
        return liveLocationMaxAgeSeconds;
    }
}
