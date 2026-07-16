package in.craves.integration.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PaymentProviderPropertiesTest {

    @Test
    void sandboxEnvironmentUsesSandboxEndpointAndSimulationStatus() {
        PaymentProviderProperties properties = new PaymentProviderProperties(
            "sandbox",
            "2025-01-01",
            "client-id",
            "client-secret",
            "https://sandbox.cashfree.test",
            "https://api.cashfree.test",
            "https://craves.in/payment/return",
            "https://api.craves.in/webhooks/cashfree",
            "PENDING"
        );

        assertThat(properties.sandbox()).isTrue();
        assertThat(properties.baseUrl()).isEqualTo("https://sandbox.cashfree.test");
        assertThat(properties.sandboxRefundSimulationStatus()).isEqualTo("PENDING");
    }

    @Test
    void productionEnvironmentCannotUseSandboxEndpoint() {
        PaymentProviderProperties properties = new PaymentProviderProperties(
            "production",
            "2025-01-01",
            "client-id",
            "client-secret",
            "https://sandbox.cashfree.test",
            "https://api.cashfree.test",
            "https://craves.in/payment/return",
            "https://api.craves.in/webhooks/cashfree",
            "SUCCESS"
        );

        assertThat(properties.sandbox()).isFalse();
        assertThat(properties.baseUrl()).isEqualTo("https://api.cashfree.test");
    }
}
