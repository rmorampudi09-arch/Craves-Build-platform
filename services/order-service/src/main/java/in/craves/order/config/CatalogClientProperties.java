package in.craves.order.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "craves.catalog")
public class CatalogClientProperties {
    private String baseUrl;
    private String internalAccessValue;
    // Catalog calls run on the single scheduler thread and inside order transactions: bound them (craves.catalog.*-timeout).
    private Duration connectTimeout = Duration.ofSeconds(2);
    private Duration readTimeout = Duration.ofSeconds(5);

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getInternalAccessValue() {
        return internalAccessValue;
    }

    public void setInternalAccessValue(String internalAccessValue) {
        this.internalAccessValue = internalAccessValue;
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public void setConnectTimeout(Duration connectTimeout) {
        this.connectTimeout = connectTimeout;
    }

    public Duration getReadTimeout() {
        return readTimeout;
    }

    public void setReadTimeout(Duration readTimeout) {
        this.readTimeout = readTimeout;
    }
}
