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
    private static final Set<String> ENVIRONMENTS = Set.of("SANDBOX", "PRODUCTION");
    private static final Set<String> PRODUCTS = Set.of("MARKETPLACE", "DEDICATED_STORE");

    private boolean enabled;
    private boolean createEnabled;
    private boolean productionActivationApproved;
    private boolean accountProductVerified;
    private String environment = "SANDBOX";
    private String product = "MARKETPLACE";
    private String baseUrl = "https://hlbackend.staging.shadowfax.in";
    private String authToken = "";
    private String clientCode = "";
    private String webhookToken = "";
    private int connectTimeoutSeconds = 5;
    private int readTimeoutSeconds = 20;

    @PostConstruct
    void validate() {
        URI uri = parseHttps(baseUrl);
        if (!ENVIRONMENTS.contains(normalizedEnvironment())) {
            throw new IllegalStateException("SHADOWFAX_API_ENVIRONMENT must be SANDBOX or PRODUCTION");
        }
        if (!PRODUCTS.contains(normalizedProduct())) {
            throw new IllegalStateException("SHADOWFAX_PRODUCT must be MARKETPLACE or DEDICATED_STORE");
        }
        if (connectTimeoutSeconds < 1 || connectTimeoutSeconds > 10
            || readTimeoutSeconds < 1 || readTimeoutSeconds > 30) {
            throw new IllegalStateException("Shadowfax request timeouts are out of bounds");
        }
        if (enabled && (!StringUtils.hasText(authToken) || !StringUtils.hasText(clientCode))) {
            throw new IllegalStateException("Shadowfax token and client code are required when enabled");
        }
        if (createEnabled && !createReady()) {
            throw new IllegalStateException("Shadowfax create gates are incomplete");
        }
        if ("PRODUCTION".equals(normalizedEnvironment())) {
            String lowerHost = uri.getHost().toLowerCase(Locale.ROOT);
            if (lowerHost.contains("staging") || lowerHost.contains("sandbox") || lowerHost.contains("test")) {
                throw new IllegalStateException("Shadowfax production cannot use a test/stage/sandbox host");
            }
            if (enabled && !productionActivationApproved) {
                throw new IllegalStateException("Shadowfax production activation must be explicitly approved");
            }
        }
    }

    public boolean credentialReady() {
        return StringUtils.hasText(authToken) && StringUtils.hasText(clientCode);
    }

    public boolean createReady() {
        return enabled && createEnabled && credentialReady() && accountProductVerified
            && ("SANDBOX".equals(normalizedEnvironment()) || productionActivationApproved);
    }

    public String normalizedEnvironment() {
        return environment == null ? "" : environment.trim().toUpperCase(Locale.ROOT);
    }

    public String normalizedProduct() {
        return product == null ? "" : product.trim().toUpperCase(Locale.ROOT);
    }

    public String normalizedBaseUrl() {
        return baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    private static URI parseHttps(String value) {
        try {
            URI uri = URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !StringUtils.hasText(uri.getHost())) {
                throw new IllegalArgumentException();
            }
            return uri;
        } catch (Exception ex) {
            throw new IllegalStateException("Shadowfax baseUrl must be a valid HTTPS URL", ex);
        }
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public boolean isCreateEnabled() { return createEnabled; }
    public void setCreateEnabled(boolean createEnabled) { this.createEnabled = createEnabled; }
    public boolean isProductionActivationApproved() { return productionActivationApproved; }
    public void setProductionActivationApproved(boolean productionActivationApproved) { this.productionActivationApproved = productionActivationApproved; }
    public boolean isAccountProductVerified() { return accountProductVerified; }
    public void setAccountProductVerified(boolean accountProductVerified) { this.accountProductVerified = accountProductVerified; }
    public String getEnvironment() { return environment; }
    public void setEnvironment(String environment) { this.environment = environment; }
    public String getProduct() { return product; }
    public void setProduct(String product) { this.product = product; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getAuthToken() { return authToken; }
    public void setAuthToken(String authToken) { this.authToken = authToken; }
    public String getClientCode() { return clientCode; }
    public void setClientCode(String clientCode) { this.clientCode = clientCode; }
    public String getWebhookToken() { return webhookToken; }
    public void setWebhookToken(String webhookToken) { this.webhookToken = webhookToken; }
    public int getConnectTimeoutSeconds() { return connectTimeoutSeconds; }
    public void setConnectTimeoutSeconds(int connectTimeoutSeconds) { this.connectTimeoutSeconds = connectTimeoutSeconds; }
    public int getReadTimeoutSeconds() { return readTimeoutSeconds; }
    public void setReadTimeoutSeconds(int readTimeoutSeconds) { this.readTimeoutSeconds = readTimeoutSeconds; }
}
