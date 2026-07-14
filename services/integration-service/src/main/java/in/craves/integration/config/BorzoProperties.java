package in.craves.integration.config;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "craves.providers.borzo")
public class BorzoProperties {
    private boolean enabled = false;
    private String baseUrl = "https://robotapitest-in.borzodelivery.com/api/business/1.8";
    private String authToken = "";
    private String callbackSecret = "";
    private int connectTimeoutSeconds = 5;
    private int readTimeoutSeconds = 20;

    @PostConstruct
    void validate() {
        URI uri;
        try {
            uri = URI.create(baseUrl);
        } catch (Exception ex) {
            throw new IllegalStateException("Borzo baseUrl must be a valid HTTPS URL", ex);
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !StringUtils.hasText(uri.getHost())) {
            throw new IllegalStateException("Borzo baseUrl must be an HTTPS URL");
        }
        if (connectTimeoutSeconds < 1) {
            throw new IllegalStateException("Borzo connectTimeoutSeconds must be at least 1");
        }
        if (readTimeoutSeconds < 1) {
            throw new IllegalStateException("Borzo readTimeoutSeconds must be at least 1");
        }
        if (enabled && !StringUtils.hasText(authToken)) {
            throw new IllegalStateException("BORZO_API_AUTH_TOKEN is required when Borzo API is enabled");
        }
    }

    public String normalizedBaseUrl() {
        return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getAuthToken() { return authToken; }
    public void setAuthToken(String authToken) { this.authToken = authToken; }
    public String getCallbackSecret() { return callbackSecret; }
    public void setCallbackSecret(String callbackSecret) { this.callbackSecret = callbackSecret; }
    public int getConnectTimeoutSeconds() { return connectTimeoutSeconds; }
    public void setConnectTimeoutSeconds(int connectTimeoutSeconds) {
        this.connectTimeoutSeconds = connectTimeoutSeconds;
    }
    public int getReadTimeoutSeconds() { return readTimeoutSeconds; }
    public void setReadTimeoutSeconds(int readTimeoutSeconds) {
        this.readTimeoutSeconds = readTimeoutSeconds;
    }
}
