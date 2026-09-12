package in.craves.integration.config;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "craves.providers.pidge")
public class PidgeProperties {
    private boolean enabled;
    private boolean createEnabled;
    private boolean productionActivationApproved;
    private boolean manualAllocationVerified;
    private boolean webhookVerified;
    private String environment = "PRODUCTION";
    private String baseUrl = "https://api.pidge.in";
    private String authToken = "";
    private String channel = "Craves Hyperlocal";
    private String webhookToken = "";
    private String callbackUrl = "https://api.craves.in/api/v1/webhooks/delivery/pidge";
    private int connectTimeoutSeconds = 5;
    private int readTimeoutSeconds = 20;

    @PostConstruct
    public void validate() {
        if (!enabled) return;
        URI base = URI.create(baseUrl);
        if (!"https".equals(base.getScheme()) || base.getUserInfo() != null || base.getQuery() != null
            || base.getFragment() != null || !"api.pidge.in".equals(base.getHost())
            || (base.getPort() != -1 && base.getPort() != 443)
            || !(base.getPath().isEmpty() || "/".equals(base.getPath()))
            || !"PRODUCTION".equals(environment)) {
            throw new IllegalStateException("Pidge requires the verified production HTTPS API origin");
        }
        if (!credentialReady() || !StringUtils.hasText(channel))
            throw new IllegalStateException("Pidge API token and channel must be configured");
        if (connectTimeoutSeconds < 1 || connectTimeoutSeconds > 10 || readTimeoutSeconds < 1 || readTimeoutSeconds > 30)
            throw new IllegalStateException("Pidge request timeouts are out of bounds");
        if (createEnabled && !productionCreateReady())
            throw new IllegalStateException("Pidge production creation prerequisites are incomplete");
    }

    public boolean credentialReady() { return StringUtils.hasText(authToken); }
    public boolean productionCreateReady() {
        return enabled && createEnabled && productionActivationApproved && manualAllocationVerified
            && webhookVerified && credentialReady() && StringUtils.hasText(webhookToken)
            && "PRODUCTION".equals(environment) && callbackUrl.startsWith("https://api.craves.in/");
    }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean value) { enabled = value; }
    public boolean isCreateEnabled() { return createEnabled; }
    public void setCreateEnabled(boolean value) { createEnabled = value; }
    public boolean isProductionActivationApproved() { return productionActivationApproved; }
    public void setProductionActivationApproved(boolean value) { productionActivationApproved = value; }
    public boolean isManualAllocationVerified() { return manualAllocationVerified; }
    public void setManualAllocationVerified(boolean value) { manualAllocationVerified = value; }
    public boolean isWebhookVerified() { return webhookVerified; }
    public void setWebhookVerified(boolean value) { webhookVerified = value; }
    public String getEnvironment() { return environment; }
    public void setEnvironment(String value) { environment = value; }
    public String getBaseUrl() { return baseUrl.replaceAll("/+$", ""); }
    public void setBaseUrl(String value) { baseUrl = value; }
    public String getAuthToken() { return authToken; }
    public void setAuthToken(String value) { authToken = value; }
    public String getChannel() { return channel; }
    public void setChannel(String value) { channel = value; }
    public String getWebhookToken() { return webhookToken; }
    public void setWebhookToken(String value) { webhookToken = value; }
    public String getCallbackUrl() { return callbackUrl; }
    public void setCallbackUrl(String value) { callbackUrl = value; }
    public int getConnectTimeoutSeconds() { return connectTimeoutSeconds; }
    public void setConnectTimeoutSeconds(int value) { connectTimeoutSeconds = value; }
    public int getReadTimeoutSeconds() { return readTimeoutSeconds; }
    public void setReadTimeoutSeconds(int value) { readTimeoutSeconds = value; }
}
