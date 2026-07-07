package in.craves.integration.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PaymentProviderProperties {
    private final String environment;
    private final String apiVersion;
    private final String clientId;
    private final String clientKey;
    private final String sandboxBaseUrl;
    private final String productionBaseUrl;
    private final String defaultReturnUrl;
    private final String webhookUrl;

    public PaymentProviderProperties(
        @Value("${PAYMENT_PROVIDER_ENVIRONMENT:sandbox}") String environment,
        @Value("${PAYMENT_PROVIDER_API_VERSION:2025-01-01}") String apiVersion,
        @Value("${PAYMENT_PROVIDER_CLIENT_ID:}") String clientId,
        @Value("${PAYMENT_PROVIDER_CLIENT_KEY:}") String clientKey,
        @Value("${PAYMENT_PROVIDER_SANDBOX_BASE_URL:https://sandbox.cashfree.com}") String sandboxBaseUrl,
        @Value("${PAYMENT_PROVIDER_PRODUCTION_BASE_URL:https://api.cashfree.com}") String productionBaseUrl,
        @Value("${PAYMENT_PROVIDER_DEFAULT_RETURN_URL:https://craves.in/payment/return}") String defaultReturnUrl,
        @Value("${PAYMENT_PROVIDER_WEBHOOK_URL:https://apim-craves-prodlow-l3ing6.azure-api.net/api/v1/payments/webhooks/cashfree}") String webhookUrl
    ) {
        this.environment = environment;
        this.apiVersion = apiVersion;
        this.clientId = clientId;
        this.clientKey = clientKey;
        this.sandboxBaseUrl = sandboxBaseUrl;
        this.productionBaseUrl = productionBaseUrl;
        this.defaultReturnUrl = defaultReturnUrl;
        this.webhookUrl = webhookUrl;
    }

    public String environment() { return environment; }
    public String apiVersion() { return apiVersion; }
    public String clientId() { return clientId; }
    public String clientKey() { return clientKey; }
    public String defaultReturnUrl() { return defaultReturnUrl; }
    public String webhookUrl() { return webhookUrl; }
    public String baseUrl() { return "production".equalsIgnoreCase(environment) ? productionBaseUrl : sandboxBaseUrl; }
}
