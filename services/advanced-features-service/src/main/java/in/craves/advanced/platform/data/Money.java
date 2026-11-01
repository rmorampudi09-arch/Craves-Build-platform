package in.craves.advanced.platform.data;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class Money {
    private Money() { }

    /** Catalog prices are rupees with up to two decimals; everything here is integer paise. */
    public static long paise(BigDecimal rupees) {
        if (rupees == null) return 0;
        return rupees.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact();
    }
}
