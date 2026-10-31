package in.craves.advanced.kitchencapacity;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class KitchenCapacityDtos {
    private KitchenCapacityDtos() { }

    public enum BatchStatus { OPEN, CLOSED }

    public enum HoldStatus { HELD, CONFIRMED, RELEASED }

    /** serviceDate is the India date the batch is cooked for. orderCutoff: no new holds after it. readyAt is for display. */
    public record NewBatch(@NotNull UUID menuItemId, @NotNull LocalDate serviceDate, @NotNull @Min(1) @Max(1000) Integer portions,
                           Instant orderCutoff, Instant readyAt) { }

    public record BatchChange(@NotNull @Min(1) @Max(1000) Integer portions, Instant orderCutoff, Instant readyAt, @NotNull BatchStatus status,
                              @NotNull Long expectedVersion) { }

    public record ChefBatch(UUID id, UUID menuItemId, LocalDate serviceDate, int portions, int held, int confirmed, int remaining,
                            Instant orderCutoff, Instant readyAt, BatchStatus status, long version) { }

    /** open: holds are accepted right now (status OPEN, before the cutoff and the end of the service date, portions left). */
    public record BatchAvailability(UUID id, UUID menuItemId, LocalDate serviceDate, int portions, int remaining, Instant orderCutoff,
                                    Instant readyAt, boolean open) { }

    public record NewHold(@NotNull @Min(1) @Max(50) Integer portions) { }

    public record HoldConfirmation(@NotNull UUID orderId) { }

    public record HoldVoid(@NotBlank @Size(max = 300) String reason) { }

    public record PortionHold(UUID id, UUID batchId, int portions, HoldStatus status, UUID orderId, Instant expiresAt) { }

    /** extraPrepMinutes 0 clears it. until: when the extra time stops applying (within the next 24 hours). */
    public record KitchenLoadRequest(@NotNull @Min(0) @Max(180) Integer extraPrepMinutes, @NotNull Instant until) { }

    public record KitchenLoad(UUID kitchenId, int extraPrepMinutes, Instant until) { }
}
