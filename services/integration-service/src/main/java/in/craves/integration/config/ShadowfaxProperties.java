package in.craves.integration.config;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.util.Locale;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@ConfigurationProperties(prefix = "craves.providers.shadowfax")
public class ShadowfaxProperties {
    public static final String STAGING_BASE_URL = "https://hlbackend.staging.shadowfax.in";
    public static final String PRODUCTION_BASE_URL = "https://api.shadowfax.in";
    public static final String PRODUCTION_CALLBACK_URL =
        "https://api.craves.in/api/v1/webhooks/delivery/shadowfax";
    private static final Set<String> ENVIRONMENTS = Set.of("STAGING", "PRODUCTION");

    private boolean enabled;
    private String environment = "STAGING";
    private boolean productionActivationApproved;
    private boolean contractVerified;
    private boolean hyderabadServiceabilityVerified;
    private boolean callbackRegistered;
    private boolean createReconciliationVerified;
    private String baseUrl = STAGING_BASE_URL;
    private String authToken = "";
    private String clientCode = "";
    private String callbackSecret = "";
    private String callbackUrl = "";
    private int maximumAcceptedEtaMinutes;
    private int connectTimeoutSeconds = 5;
    private int readTimeoutSeconds = 20;

    @PostConstruct
    void validate() {
        parseHttps(baseUrl, "Shadowfax baseUrl");
        if (!ENVIRONMENTS.contains(normalizedEnvironment())) {
            throw new IllegalStateException("SHADOWFAX_API_ENVIRONMENT must be STAGING or PRODUCTION");
        }
        if (connectTimeoutSeconds < 1 || readTimeoutSeconds < 1) {
            throw new IllegalStateException("Shadowfax API timeouts must be at least one second");
        }
        if (enabled) {
            requireText(authToken, "SHADOWFAX_API_AUTH_TOKEN");
            requireText(clientCode, "SHADOWFAX_CLIENT_CODE");
            if (maximumAcceptedEtaMinutes < 1) {
                throw new IllegalStateException(
                    "SHADOWFAX_MAX_ACCEPTED_ETA_MINUTES must be configured before enablement"
                );
            }
        }
        if (StringUtils.hasText(callbackUrl)) {
            parseHttps(callbackUrl, "Shadowfax callbackUrl");
        }
        if ("STAGING".equals(normalizedEnvironment()) && !STAGING_BASE_URL.equals(normalizedBaseUrl())) {
            throw new IllegalStateException("Shadowfax staging must use the published HL Marketplace host");
        }
        if ("PRODUCTION".equals(normalizedEnvironment())) {
            if (!PRODUCTION_BASE_URL.equals(normalizedBaseUrl())) {
                throw new IllegalStateException("Shadowfax production must use the published HL Marketplace host");
            }
            if (enabled && !productionReady()) {
                throw new IllegalStateException(
                    "Shadowfax production is blocked until every Hyperlocal activation gate passes"
                );
            }
        }
    }

    public boolean productionReady() {
        return "PRODUCTION".equals(normalizedEnvironment())
            && productionActivationApproved
            && contractVerified
            && hyderabadServiceabilityVerified
            && callbackRegistered
            && createReconciliationVerified
            && PRODUCTION_BASE_URL.equals(normalizedBaseUrl())
            && PRODUCTION_CALLBACK_URL.equals(withoutTrailingSlash(callbackUrl))
            && StringUtils.hasText(authToken)
            && StringUtils.hasText(clientCode)
            && StringUtils.hasText(callbackSecret)
            && maximumAcceptedEtaMinutes > 0;
    }

    public String normalizedEnvironment() {
        return environment == null ? "" : environment.trim().toUpperCase(Locale.ROOT);
    }

    public String normalizedBaseUrl() {
        return withoutTrailingSlash(baseUrl);
    }

    private static void requireText(String value, String name) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalStateException(name + " is required when Shadowfax is enabled");
        }
    }

    private static String withoutTrailingSlash(String value) {
        return value != null && value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private static void parseHttps(String value, String name) {
        URI uri;
        try {
            uri = URI.create(value);
        } catch (Exception ex) {
            throw new IllegalStateException(name + " must be a valid HTTPS URL", ex);
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !StringUtils.hasText(uri.getHost())) {
            throw new IllegalStateException(name + " must be an HTTPS URL");
        }
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getEnvironment() { return environment; }
    public void setEnvironment(String environment) { this.environment = environment; }
    public boolean isProductionActivationApproved() { return productionActivationApproved; }
    public void setProductionActivationApproved(boolean value) { this.productionActivationApproved = value; }
    public boolean isContractVerified() { return contractVerified; }
    public void setContractVerified(boolean value) { this.contractVerified = value; }
    public boolean isHyderabadServiceabilityVerified() { return hyderabadServiceabilityVerified; }
    public void setHyderabadServiceabilityVerified(boolean value) { this.hyderabadServiceabilityVerified = value; }
    public boolean isCallbackRegistered() { return callbackRegistered; }
    public void setCallbackRegistered(boolean value) { this.callbackRegistered = value; }
    public boolean isCreateReconciliationVerified() { return createReconciliationVerified; }
    public void setCreateReconciliationVerified(boolean value) { this.createReconciliationVerified = value; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getAuthToken() { return authToken; }
    public void setAuthToken(String authToken) { this.authToken = authToken; }
    public String getClientCode() { return clientCode; }
    public void setClientCode(String clientCode) { this.clientCode = clientCode; }
    public String getCallbackSecret() { return callbackSecret; }
    public void setCallbackSecret(String callbackSecret) { this.callbackSecret = callbackSecret; }
    public String getCallbackUrl() { return callbackUrl; }
    public void setCallbackUrl(String callbackUrl) { this.callbackUrl = callbackUrl; }
    public int getMaximumAcceptedEtaMinutes() { return maximumAcceptedEtaMinutes; }
    public void setMaximumAcceptedEtaMinutes(int value) { this.maximumAcceptedEtaMinutes = value; }
    public int getConnectTimeoutSeconds() { return connectTimeoutSeconds; }
    public void setConnectTimeoutSeconds(int value) { this.connectTimeoutSeconds = value; }
    public int getReadTimeoutSeconds() { return readTimeoutSeconds; }
    public void setReadTimeoutSeconds(int value) { this.readTimeoutSeconds = value; }
}
