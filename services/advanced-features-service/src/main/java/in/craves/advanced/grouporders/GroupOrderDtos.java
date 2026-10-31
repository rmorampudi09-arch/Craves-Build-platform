package in.craves.advanced.grouporders;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class GroupOrderDtos {
    private GroupOrderDtos() { }

    public record CreateGroupOrder(@NotNull UUID kitchenId, @NotBlank @Size(max = 60) String title,
                                   @Min(15) @Max(1440) Integer joinWindowMinutes, @Min(2) @Max(20) Integer maxParticipants,
                                   @Size(max = 40) String hostDisplayName) { }

    public record JoinGroupOrder(@NotBlank @Pattern(regexp = "[A-Za-z0-9-]{8,9}") String code, @Size(max = 40) String displayName) { }

    public record PutMyItem(@Min(1) @Max(20) int quantity, @Size(max = 140) String note) { }

    public record Unlock(@Min(15) @Max(1440) Integer joinWindowMinutes) { }

    public record Checkout(boolean applyToCart, boolean replaceCart) { }

    public record ItemView(UUID menuItemId, String itemName, int quantity, long unitPricePaise, long lineTotalPaise, String note) { }

    /** participantId is shown only to the host (to remove someone) and to each person for themselves. */
    public record ParticipantView(UUID participantId, String displayName, String role, boolean you, List<ItemView> items,
                                  long subtotalPaise) { }

    public record GroupOrderView(UUID id, UUID kitchenId, String title, String status, String joinCode, String shareUrl,
                                 Instant joinUntil, int maxParticipants, int participantCount, long version, boolean youAreHost,
                                 List<ParticipantView> participants, int itemCount, long subtotalPaise, Instant createdAt) { }

    public record GroupOrderSummary(UUID id, UUID kitchenId, String title, String status, Instant joinUntil, boolean youAreHost,
                                    Instant createdAt) { }

    public record CheckoutLine(UUID menuItemId, String itemName, int quantity, long unitPricePaise, long lineTotalPaise) { }

    /** Prices are re-read from Catalog at hand-off; Order service still computes the final, authoritative total. */
    public record CheckoutResult(UUID groupOrderId, List<CheckoutLine> lines, long subtotalPaise, boolean appliedToCart, Instant createdAt) { }
}
