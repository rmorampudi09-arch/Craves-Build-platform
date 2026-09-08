package in.craves.integration.delivery.shadowfax;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import java.util.Locale;
import org.springframework.stereotype.Component;

@Component
public class ShadowfaxStatusMapper {
    public DeliveryStatus fromProvider(String status) {
        return switch (normalize(status)) {
            case "ACCEPTED" -> DeliveryStatus.SEARCHING;
            case "ALLOTTED" -> DeliveryStatus.COURIER_ASSIGNED;
            case "ARRIVED" -> DeliveryStatus.AT_PICKUP;
            case "DISPATCHED" -> DeliveryStatus.IN_TRANSIT;
            case "ARRIVED_CUSTOMER_DOORSTEP", "ARRIVAL_CUSTOMER_DOORSTEP" -> DeliveryStatus.AT_DROPOFF;
            case "DELIVERED" -> DeliveryStatus.DELIVERED;
            case "CANCELLED" -> DeliveryStatus.CANCELLED;
            case "CANCELLED_BY_CUSTOMER" -> DeliveryStatus.RETURNING;
            case "RETURNED_TO_SELLER" -> DeliveryStatus.RETURNED;
            default -> DeliveryStatus.UNKNOWN;
        };
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }
}
