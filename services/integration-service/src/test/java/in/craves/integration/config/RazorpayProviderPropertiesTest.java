package in.craves.integration.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RazorpayProviderPropertiesTest {

    @Test
    void productionRequiresLiveKeysWebhookSecretAndApprovedHosts() {
        RazorpayProviderProperties properties = new RazorpayProviderProperties(
            "PRODUCTION",
            true,
            true,
            "rzp_live_example",
            "secret-value",
            "webhook-secret",
            "",
            "https://api.razorpay.com",
            "https://api.craves.in/api/v1/payments/webhooks/razorpay",
            true
        );
        assertDoesNotThrow(properties::validate);
        assertTrue(properties.productionExecutionReady());
    }

    @Test
    void productionRejectsTestKey() {
        RazorpayProviderProperties properties = new RazorpayProviderProperties(
            "PRODUCTION",
            true,
            true,
            "rzp_test_example",
            "secret-value",
            "webhook-secret",
            "",
            "https://api.razorpay.com",
            "https://api.craves.in/api/v1/payments/webhooks/razorpay",
            true
        );
        assertThrows(IllegalStateException.class, properties::validate);
    }

    @Test
    void productionRejectsUnapprovedApiHost() {
        RazorpayProviderProperties properties = new RazorpayProviderProperties(
            "PRODUCTION",
            true,
            true,
            "rzp_live_example",
            "secret-value",
            "webhook-secret",
            "",
            "https://example.com",
            "https://api.craves.in/api/v1/payments/webhooks/razorpay",
            true
        );
        assertThrows(IllegalStateException.class, properties::validate);
    }

    @Test
    void previousWebhookSecretMustDifferFromActiveSecret() {
        RazorpayProviderProperties properties = new RazorpayProviderProperties(
            "PRODUCTION",
            true,
            true,
            "rzp_live_example",
            "secret-value",
            "same-secret",
            "same-secret",
            "https://api.razorpay.com",
            "https://api.craves.in/api/v1/payments/webhooks/razorpay",
            true
        );
        assertThrows(IllegalStateException.class, properties::validate);
    }
}
