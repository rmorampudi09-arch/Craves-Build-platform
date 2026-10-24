package in.craves.userchef.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** The job that tells customers who tapped Notify me when a home kitchen starts delivering to their spot. */
@ConfigurationProperties(prefix = "craves.kitchen-launch-alerts")
public class KitchenLaunchAlertProperties {
    private boolean enabled = false;
    /** Origin that serves the public catalog discovery route, such as https://api.craves.in. */
    private String discoveryBaseUrl = "";
    /** Same radius as the customer Home "Kitchens near you" query. */
    private int radiusMeters = 10_000;
    private int batchSize = 100;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getDiscoveryBaseUrl() {
        return discoveryBaseUrl;
    }

    public void setDiscoveryBaseUrl(String discoveryBaseUrl) {
        this.discoveryBaseUrl = discoveryBaseUrl;
    }

    public int getRadiusMeters() {
        return radiusMeters;
    }

    public void setRadiusMeters(int radiusMeters) {
        this.radiusMeters = radiusMeters;
    }

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }
}
