package in.craves.order.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "craves.catalog")
public class CatalogClientProperties {
    private String baseUrl;
    private String internalAccessValue;

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
}
