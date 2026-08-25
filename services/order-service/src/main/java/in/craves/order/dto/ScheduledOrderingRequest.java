package in.craves.order.dto;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ScheduledOrderingRequest(
        @NotNull Long chefId,
        @NotNull Long cartId,
        @NotNull Long deliveryAddressId,
        @NotNull @Future LocalDateTime scheduledFor,
        @Size(max = 512) String specialInstructions,
        @NotNull BigDecimal estimatedTotal
) {}
