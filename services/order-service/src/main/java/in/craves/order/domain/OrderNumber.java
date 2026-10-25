package in.craves.order.domain;

import java.util.Locale;
import java.util.UUID;

/** The order number customers, chefs and couriers quote; same rule as web shortOrderNumber. Callers add the "#". */
public final class OrderNumber {
    private OrderNumber() {
    }

    public static String of(UUID orderId) {
        return orderId.toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);
    }
}
