package in.craves.order.config;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "craves.delivery-telemetry")
public class DeliveryTelemetryViewProperties {
    private boolean liveLocationExposureEnabled = false;
    private int liveLocationMaxAgeSeconds = 300;

    @PostConstruct
    void validate() {
        if (liveLocationMaxAgeSeconds < 30 || liveLocationMaxAgeSeconds > 3600) {
            throw new IllegalStateException(
                "Delivery liveLocationMaxAgeSeconds must be between 30 and 3600"
            );
        }
    }

    public boolean isLiveLocationExposureEnabled() {
        return liveLocationExposureEnabled;
    }

    public void setLiveLocationExposureEnabled(boolean liveLocationExposureEnabled) {
        this.liveLocationExposureEnabled = liveLocationExposureEnabled;
    }

    public int getLiveLocationMaxAgeSeconds() {
        return liveLocationMaxAgeSeconds;
    }

    public void setLiveLocationMaxAgeSeconds(int liveLocationMaxAgeSeconds) {
        this.liveLocationMaxAgeSeconds = liveLocationMaxAgeSeconds;
    }
}
