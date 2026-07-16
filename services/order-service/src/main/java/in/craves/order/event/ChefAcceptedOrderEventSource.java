package in.craves.order.event;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public record ChefAcceptedOrderEventSource(
    UUID orderId,
    UUID checkoutId,
    Instant acceptedAt,
    Instant readyAt,
    int totalPackageWeightGrams,
    boolean thermoboxRequired,
    String kitchenName,
    String pickupPhoneNumber,
    String pickupAddressLine1,
    String pickupAddressLine2,
    String pickupLandmark,
    String pickupAreaName,
    String pickupCity,
    String pickupState,
    String pickupPostalCode,
    BigDecimal pickupLatitude,
    BigDecimal pickupLongitude,
    String dropoffRecipientName,
    String dropoffPhoneNumber,
    String dropoffAddressLine1,
    String dropoffAddressLine2,
    String dropoffLandmark,
    String dropoffAreaName,
    String dropoffCity,
    String dropoffState,
    String dropoffPostalCode,
    BigDecimal dropoffLatitude,
    BigDecimal dropoffLongitude
) {
}
