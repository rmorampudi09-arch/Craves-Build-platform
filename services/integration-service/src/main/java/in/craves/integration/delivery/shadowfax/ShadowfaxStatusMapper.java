package in.craves.integration.delivery.shadowfax;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import java.util.Locale;
import org.springframework.util.StringUtils;

public final class ShadowfaxStatusMapper {
    private ShadowfaxStatusMapper() {}

    public static String providerStatus(JsonNode node) {
        String value = text(node, "order_status");
        if (!StringUtils.hasText(value)) value = text(node, "status");
        if (!StringUtils.hasText(value)) value = text(node.path("data"), "order_status");
        if (!StringUtils.hasText(value)) value = text(node.path("data"), "status");
        return StringUtils.hasText(value) ? value.trim().toUpperCase(Locale.ROOT) : "UNKNOWN";
    }

    public static DeliveryStatus map(JsonNode node) {
        return switch (providerStatus(node)) {
            case "ACCEPTED" -> DeliveryStatus.SEARCHING;
            case "ALLOTTED", "ALLOTED" -> DeliveryStatus.COURIER_ASSIGNED;
            case "ARRIVED" -> DeliveryStatus.AT_PICKUP;
            case "DISPATCHED" -> DeliveryStatus.PICKED_UP;
            case "ARRIVED_CUSTOMER_DOORSTEP" -> DeliveryStatus.AT_DROPOFF;
            case "DELIVERED" -> DeliveryStatus.DELIVERED;
            case "CANCELLED" -> DeliveryStatus.CANCELLED;
            case "CANCELLED_BY_CUSTOMER" -> DeliveryStatus.FAILED;
            case "RETURNED_TO_SELLER" -> DeliveryStatus.RETURNED;
            case "UNASSIGNED" -> DeliveryStatus.SEARCHING;
            default -> DeliveryStatus.UNKNOWN;
        };
    }

    public static boolean isAssigned(DeliveryStatus status) {
        return status == DeliveryStatus.COURIER_ASSIGNED
            || status == DeliveryStatus.AT_PICKUP
            || status == DeliveryStatus.PICKED_UP
            || status == DeliveryStatus.IN_TRANSIT
            || status == DeliveryStatus.AT_DROPOFF
            || status == DeliveryStatus.DELIVERED;
    }

    private static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? null : value.asText(null);
    }
}
