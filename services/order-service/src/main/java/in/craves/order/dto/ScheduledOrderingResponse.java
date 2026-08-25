package in.craves.order.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ScheduledOrderingResponse(
        Long id,
        Long customerId,
        Long chefId,
        Long cartId,
        Long deliveryAddressId,
        LocalDateTime scheduledFor,
        String slotLabel,
        String status,
        String specialInstructions,
        BigDecimal estimatedTotal
) {}
