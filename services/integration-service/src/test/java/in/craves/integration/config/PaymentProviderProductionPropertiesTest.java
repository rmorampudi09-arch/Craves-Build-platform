package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class PaymentProviderProductionPropertiesTest {
    @Test
    void productionRequiresExplicitApproval() {
        PaymentProviderProperties properties = properties("production", false, "", "");
        assertThatThrownBy(properties::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("CRAVES_CASHFREE_PRODUCTION_ACTIVATION_APPROVED");
    }

    @Test
    void completeProductionConfigurationIsReady() {
        PaymentProviderProperties properties = properties("production", true, "client", "secret");
        properties.validate();
        assertThat(properties.productionReady()).isTrue();
        assertThat(properties.allowedWebhookVersions()).contains("2025-01-01");
    }

    private static PaymentProviderProperties properties(
        String environment,
        boolean approved,
        String clientId,
        String clientKey
    ) {
        return new PaymentProviderProperties(
            environment,
            approved,
            "2025-01-01",
            clientId,
            clientKey,
            "https://sandbox.cashfree.com",
            "https://api.cashfree.com",
            "https://craves.in/payment/return",
            "https://api.craves.in/api/v1/payments/webhooks/cashfree",
            "",
            300,
            "2025-01-01,2023-08-01"
        );
    }
}
