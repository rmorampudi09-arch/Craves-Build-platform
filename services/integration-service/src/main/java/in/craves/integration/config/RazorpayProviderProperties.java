package in.craves.integration.config;

import jakarta.annotation.PostConstruct;
import java.net.URI;
import java.util.Locale;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class RazorpayProviderProperties {
    private static final String PRODUCTION_API_HOST = "api.razorpay.com";
    private static final String PRODUCTION_WEBHOOK_HOST = "api.craves.in";

    private final String environment;
    private final boolean productionActivationApproved;
    private final boolean productionPaymentExecutionEnabled;
    private final String keyId;
    private final String keySecret;
    private final String webhookSecret;
    private final String previousWebhookSecret;
    private final String baseUrl;
    private final String webhookUrl;
    private final boolean autoCapture;

    public RazorpayProviderProperties(
        @Value("${RAZORPAY_ENVIRONMENT:SANDBOX}") String environment,
        @Value("${RAZORPAY_PRODUCTION_ACTIVATION_APPROVED:false}") boolean productionActivationApproved,
        @Value("${RAZORPAY_PRODUCTION_PAYMENT_EXECUTION_ENABLED:false}") boolean productionPaymentExecutionEnabled,
        @Value("${RAZORPAY_KEY_ID:}") String keyId,
        @Value("${RAZORPAY_KEY_SECRET:}") String keySecret,
        @Value("${RAZORPAY_WEBHOOK_SECRET:}") String webhookSecret,
        @Value("${RAZORPAY_PREVIOUS_WEBHOOK_SECRET:}") String previousWebhookSecret,
        @Value("${RAZORPAY_BASE_URL:https://api.razorpay.com}") String baseUrl,
        @Value("${RAZORPAY_WEBHOOK_URL:https://api.craves.in/api/v1/payments/webhooks/razorpay}") String webhookUrl,
        @Value("${RAZORPAY_AUTO_CAPTURE:true}") boolean autoCapture
    ) {
        this.environment = environment;
        this.productionActivationApproved = productionActivationApproved;
        this.productionPaymentExecutionEnabled = productionPaymentExecutionEnabled;
        this.keyId = keyId;
        this.keySecret = keySecret;
        this.webhookSecret = webhookSecret;
        this.previousWebhookSecret = previousWebhookSecret;
        this.baseUrl = baseUrl;
        this.webhookUrl = webhookUrl;
        this.autoCapture = autoCapture;
    }

    @PostConstruct
    void validate() {
        if (!Set.of("SANDBOX", "PRODUCTION").contains(environment())) {
            throw new IllegalStateException("RAZORPAY_ENVIRONMENT must be SANDBOX or PRODUCTION");
        }
        URI apiUri = requireHttps(baseUrl, "RAZORPAY_BASE_URL");
        URI webhookUri = requireHttps(webhookUrl, "RAZORPAY_WEBHOOK_URL");
        if (production() && !productionActivationApproved) {
            throw new IllegalStateException("RAZORPAY_PRODUCTION_ACTIVATION_APPROVED must be true for production");
        }
        if (StringUtils.hasText(keyId) != StringUtils.hasText(keySecret)) {
            throw new IllegalStateException("Razorpay key id and key secret must be configured together");
        }
        if (production() && (!hasCredentials() || !hasWebhookSecret())) {
            throw new IllegalStateException("Razorpay production credentials and webhook secret are required");
        }
        if (!production() && productionPaymentExecutionEnabled) {
            throw new IllegalStateException("Razorpay production execution cannot be enabled in sandbox");
        }
        if (StringUtils.hasText(keyId)) {
            String expectedPrefix = production() ? "rzp_live_" : "rzp_test_";
            if (!keyId.startsWith(expectedPrefix)) {
                throw new IllegalStateException("RAZORPAY_KEY_ID does not match the selected environment");
            }
        }
        if (production() && !PRODUCTION_API_HOST.equalsIgnoreCase(apiUri.getHost())) {
            throw new IllegalStateException("RAZORPAY_BASE_URL must use api.razorpay.com in production");
        }
        if (production() && !PRODUCTION_WEBHOOK_HOST.equalsIgnoreCase(webhookUri.getHost())) {
            throw new IllegalStateException("RAZORPAY_WEBHOOK_URL must use api.craves.in in production");
        }
        if (StringUtils.hasText(previousWebhookSecret)
            && StringUtils.hasText(webhookSecret)
            && previousWebhookSecret.equals(webhookSecret)) {
            throw new IllegalStateException("RAZORPAY_PREVIOUS_WEBHOOK_SECRET must differ from the active webhook secret");
        }
    }

    public String environment() {
        return environment == null ? "" : environment.trim().toUpperCase(Locale.ROOT);
    }
    public boolean production() { return "PRODUCTION".equals(environment()); }
    public boolean sandbox() { return !production(); }
    public boolean productionActivationApproved() { return productionActivationApproved; }
    public boolean productionPaymentExecutionEnabled() { return productionPaymentExecutionEnabled; }
    public boolean paymentExecutionAllowed() { return sandbox() || productionPaymentExecutionEnabled; }
    public boolean hasCredentials() { return StringUtils.hasText(keyId) && StringUtils.hasText(keySecret); }
    public boolean hasWebhookSecret() { return StringUtils.hasText(webhookSecret); }
    public boolean hasPreviousWebhookSecret() { return StringUtils.hasText(previousWebhookSecret); }
    public boolean productionExecutionReady() {
        return production() && productionActivationApproved && productionPaymentExecutionEnabled
            && hasCredentials() && hasWebhookSecret();
    }
    public String keyId() { return keyId; }
    public String keySecret() { return keySecret; }
    public String webhookSecret() { return webhookSecret; }
    public String previousWebhookSecret() { return previousWebhookSecret; }
    public String baseUrl() { return baseUrl; }
    public String webhookUrl() { return webhookUrl; }
    public boolean autoCapture() { return autoCapture; }

    private static URI requireHttps(String value, String name) {
        URI uri;
        try {
            uri = URI.create(value);
        } catch (Exception exception) {
            throw new IllegalStateException(name + " must be a valid HTTPS URL", exception);
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !StringUtils.hasText(uri.getHost())) {
            throw new IllegalStateException(name + " must be an HTTPS URL");
        }
        return uri;
    }
}
