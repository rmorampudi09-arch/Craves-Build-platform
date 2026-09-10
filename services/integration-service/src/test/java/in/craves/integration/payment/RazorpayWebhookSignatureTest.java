package in.craves.integration.payment;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.integration.config.RazorpayProviderProperties;
import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class RazorpayWebhookSignatureTest {

    @Test
    void acceptsActiveAndPreviousWebhookSecretsDuringRotation() throws Exception {
        RazorpayProviderProperties properties = new RazorpayProviderProperties(
            "SANDBOX",
            false,
            false,
            "rzp_test_example",
            "api-secret",
            "active-webhook-secret",
            "previous-webhook-secret",
            "https://api.razorpay.com",
            "https://api.craves.in/api/v1/payments/webhooks/razorpay",
            true
        );
        RazorpayPaymentClient client = new RazorpayPaymentClient(properties, RestClient.builder());
        String body = "{\"event\":\"payment.captured\"}";

        assertTrue(client.verifyWebhook(body, hmac(body, "active-webhook-secret")));
        assertTrue(client.verifyWebhook(body, hmac(body, "previous-webhook-secret")));
        assertFalse(client.verifyWebhook(body, hmac(body, "wrong-secret")));
    }

    private static String hmac(String body, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] digest = mac.doFinal(body.getBytes(StandardCharsets.UTF_8));
        StringBuilder value = new StringBuilder(digest.length * 2);
        for (byte item : digest) value.append(String.format("%02x", item & 0xff));
        return value.toString();
    }
}
