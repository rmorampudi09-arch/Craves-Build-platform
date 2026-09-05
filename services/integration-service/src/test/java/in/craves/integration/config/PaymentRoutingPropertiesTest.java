package in.craves.integration.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PaymentRoutingPropertiesTest {

    @Test
    void razorpayCanBePrimaryWhileCashfreeIsDisabled() {
        PaymentRoutingProperties properties = new PaymentRoutingProperties("RAZORPAY", false, false, true);
        assertDoesNotThrow(properties::validate);
        assertTrue(properties.razorpay());
    }

    @Test
    void cashfreeCannotReceiveTrafficWithoutExplicitTrafficGate() {
        PaymentRoutingProperties properties = new PaymentRoutingProperties("CASHFREE", true, false, true);
        assertThrows(IllegalStateException.class, properties::validate);
    }

    @Test
    void activeRazorpayRequiresApiEnablement() {
        PaymentRoutingProperties properties = new PaymentRoutingProperties("RAZORPAY", false, false, false);
        assertThrows(IllegalStateException.class, properties::validate);
    }
}
