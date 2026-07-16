package in.craves.order.event;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

public record ChefAcceptedOrderEventData(
    UUID orderId,
    UUID chefSubOrderId,
    Instant readyAt,
    Double distanceKm,
    String area,
    DeliveryRequestData deliveryRequest
) {
    public record DeliveryRequestData(
        String matter,
        int totalWeightGrams,
        boolean thermoboxRequired,
        DeliveryStopData pickup,
        DeliveryStopData dropoff
    ) {
    }

    public record DeliveryStopData(
        String address,
        String contactName,
        String contactPhone,
        BigDecimal latitude,
        BigDecimal longitude,
        OffsetDateTime requiredStart,
        OffsetDateTime requiredFinish,
        String note
    ) {
    }
}
