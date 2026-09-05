package in.craves.integration.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class RazorpayWebhookInboxServiceCompatibilityTest {

    @Test
    void derivedIdentityIsStableForExactRawBody() {
        String first = RazorpayWebhookInboxService.derivedEventIdentity("{\"event\":\"payment.captured\"}");
        String second = RazorpayWebhookInboxService.derivedEventIdentity("{\"event\":\"payment.captured\"}");
        assertEquals(first, second);
        assertTrue(first.startsWith("derived-"));
    }

    @Test
    void derivedIdentityChangesWhenPayloadChanges() {
        assertNotEquals(
            RazorpayWebhookInboxService.derivedEventIdentity("{\"event\":\"payment.captured\"}"),
            RazorpayWebhookInboxService.derivedEventIdentity("{\"event\":\"payment.failed\"}")
        );
    }
}
