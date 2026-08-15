package in.craves.integration.delivery.shiprocket;

import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import java.util.Locale;

final class ShiprocketStatusMapper {
    private ShiprocketStatusMapper() {}

    static DeliveryStatus map(Integer statusCode, String statusText) {
        if (statusCode != null) {
            return switch (statusCode) {
                case 7 -> DeliveryStatus.DELIVERED;
                case 8, 16, 45 -> DeliveryStatus.CANCELLED;
                case 9, 14, 40, 41, 46, 78 -> DeliveryStatus.RETURNING;
                case 10 -> DeliveryStatus.RETURNED;
                case 12, 24, 25, 47, 76 -> DeliveryStatus.FAILED;
                case 13, 15, 20, 21, 22, 39, 71, 72, 77 -> DeliveryStatus.DELAYED;
                case 17 -> DeliveryStatus.AT_DROPOFF;
                case 6, 18, 38, 48, 49, 50, 51, 54, 55, 56, 57, 68 -> DeliveryStatus.IN_TRANSIT;
                case 19 -> DeliveryStatus.COURIER_TO_PICKUP;
                case 27, 52 -> DeliveryStatus.COURIER_ASSIGNED;
                case 42 -> DeliveryStatus.PICKED_UP;
                case 43 -> DeliveryStatus.IN_TRANSIT;
                case 26 -> DeliveryStatus.DELIVERED;
                case 59, 60, 61, 62, 63, 67 -> DeliveryStatus.AT_PICKUP;
                default -> byText(statusText);
            };
        }
        return byText(statusText);
    }

    private static DeliveryStatus byText(String statusText) {
        if (statusText == null || statusText.isBlank()) {
            return DeliveryStatus.UNKNOWN;
        }
        String value = statusText.trim().toUpperCase(Locale.ROOT)
            .replace('-', '_')
            .replace(' ', '_');
        if (value.contains("DELIVERED") && !value.contains("UNDELIVERED")) {
            return value.contains("RTO") ? DeliveryStatus.RETURNED : DeliveryStatus.DELIVERED;
        }
        if (value.contains("CANCEL")) {
            return DeliveryStatus.CANCELLED;
        }
        if (value.contains("RTO") || value.contains("RETURN")) {
            return DeliveryStatus.RETURNING;
        }
        if (value.contains("PICKED_UP")) {
            return DeliveryStatus.PICKED_UP;
        }
        if (value.contains("OUT_FOR_PICKUP")) {
            return DeliveryStatus.COURIER_TO_PICKUP;
        }
        if (value.contains("PICKUP_BOOKED") || value.contains("SHIPMENT_BOOKED")) {
            return DeliveryStatus.COURIER_ASSIGNED;
        }
        if (value.contains("OUT_FOR_DELIVERY")) {
            return DeliveryStatus.AT_DROPOFF;
        }
        if (value.contains("IN_TRANSIT") || value.contains("SHIPPED")) {
            return DeliveryStatus.IN_TRANSIT;
        }
        if (value.contains("DELAY") || value.contains("EXCEPTION") || value.contains("UNDELIVERED")) {
            return DeliveryStatus.DELAYED;
        }
        if (value.contains("LOST") || value.contains("DAMAGED") || value.contains("DESTROYED")
            || value.contains("FAILED") || value.contains("UNTRACEABLE")) {
            return DeliveryStatus.FAILED;
        }
        return DeliveryStatus.UNKNOWN;
    }
}
