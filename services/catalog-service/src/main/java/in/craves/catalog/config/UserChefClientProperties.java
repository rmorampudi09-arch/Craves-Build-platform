package in.craves.catalog.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** How catalog reaches user-chef-service's internal routes (blank = kitchen photo import is off). */
@Component
@ConfigurationProperties(prefix = "craves.user-chef")
public class UserChefClientProperties {
    private String internalBaseUrl = "";
    private String internalSecret = "";

    public String getInternalBaseUrl() {
        return internalBaseUrl;
    }

    public void setInternalBaseUrl(String internalBaseUrl) {
        this.internalBaseUrl = internalBaseUrl;
    }

    public String getInternalSecret() {
        return internalSecret;
    }

    public void setInternalSecret(String internalSecret) {
        this.internalSecret = internalSecret;
    }
}
