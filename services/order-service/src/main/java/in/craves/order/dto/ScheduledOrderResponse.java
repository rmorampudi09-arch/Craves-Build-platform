package in.craves.order.dto;

import java.time.LocalDate;
import java.util.UUID;

public record ScheduledOrderResponse(
    UUID id,
    UUID customerId,
    UUID kitchenId,
    LocalDate scheduledDate,
    String slotWindow,
    String status
) {}
