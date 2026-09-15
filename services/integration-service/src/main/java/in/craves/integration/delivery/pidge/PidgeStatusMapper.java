package in.craves.integration.delivery.pidge;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import java.util.Locale;

public final class PidgeStatusMapper {
    private PidgeStatusMapper() {}
    public static String providerStatus(JsonNode order) {
        String parent = order.path("status").asText("").toUpperCase(Locale.ROOT);
        if ("0".equals(parent) || "CANCELLED".equals(parent)) return "ORDER_CANCELLED";
        if ("1".equals(parent) || "PENDING".equals(parent)) return "PENDING";
        return order.path("fulfillment").path("status").asText(parent).toUpperCase(Locale.ROOT);
    }
    public static DeliveryStatus map(JsonNode order) {
        return switch (providerStatus(order)) {
            case "ORDER_CANCELLED" -> DeliveryStatus.CANCELLED;
            case "PENDING", "CANCELLED" -> DeliveryStatus.PENDING;
            case "CREATED", "FULFILLED", "3" -> order.path("fulfillment").path("rider").hasNonNull("name")
                ? DeliveryStatus.COURIER_ASSIGNED : DeliveryStatus.SEARCHING;
            case "OUT_FOR_PICKUP" -> DeliveryStatus.COURIER_TO_PICKUP;
            case "REACHED_PICKUP" -> DeliveryStatus.AT_PICKUP;
            case "PICKED_UP" -> DeliveryStatus.PICKED_UP;
            case "IN_TRANSIT", "OUT_FOR_DELIVERY" -> DeliveryStatus.IN_TRANSIT;
            case "REACHED_DELIVERY" -> DeliveryStatus.AT_DROPOFF;
            case "DELIVERED" -> order.hasNonNull("return_order_info") ? DeliveryStatus.DELAYED : DeliveryStatus.DELIVERED;
            case "RTO_OUT_FOR_DELIVERY" -> DeliveryStatus.RETURNING;
            case "RTO_DELIVERED" -> DeliveryStatus.RETURNED;
            case "UNDELIVERED", "RTO_UNDELIVERED" -> DeliveryStatus.DELAYED;
            case "DISPOSED", "LOST", "DAMAGED" -> DeliveryStatus.FAILED;
            default -> DeliveryStatus.UNKNOWN;
        };
    }
}
