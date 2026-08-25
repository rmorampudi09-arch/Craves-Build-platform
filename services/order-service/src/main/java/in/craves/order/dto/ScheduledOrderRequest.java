package in.craves.order.dto;

import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.UUID;

public record ScheduledOrderRequest(
    @NotNull UUID customerId,
    @NotNull UUID kitchenId,
    @NotNull @FutureOrPresent LocalDate scheduledDate,
    @NotBlank String slotWindow
) {}
