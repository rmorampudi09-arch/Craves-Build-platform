package in.craves.integration.payment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class RazorpayRequestSafetyTest {

    @Test
    void convertsRupeesToSubunitsExactly() {
        assertEquals(12345L, RazorpayRequestSafety.toSubunits(new BigDecimal("123.45")));
        assertEquals(new BigDecimal("123.45"), RazorpayRequestSafety.fromSubunits(12345L));
    }

    @Test
    void rejectsUnsupportedMoneyPrecision() {
        assertThrows(
            ResponseStatusException.class,
            () -> RazorpayRequestSafety.toSubunits(new BigDecimal("10.001"))
        );
    }

    @Test
    void rejectsNonPositiveAmount() {
        assertThrows(
            ResponseStatusException.class,
            () -> RazorpayRequestSafety.toSubunits(BigDecimal.ZERO)
        );
    }

    @Test
    void validatesAmountAndCurrencyTogether() {
        RazorpayRequestSafety.requireMoney(new BigDecimal("99.50"), "INR", 9950L, "inr", "test");
        assertThrows(
            ResponseStatusException.class,
            () -> RazorpayRequestSafety.requireMoney(new BigDecimal("99.50"), "INR", 9951L, "INR", "test")
        );
        assertThrows(
            ResponseStatusException.class,
            () -> RazorpayRequestSafety.requireMoney(new BigDecimal("99.50"), "INR", 9950L, "USD", "test")
        );
    }
}
