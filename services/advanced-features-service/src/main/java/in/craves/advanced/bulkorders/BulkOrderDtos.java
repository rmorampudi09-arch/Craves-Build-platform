package in.craves.advanced.bulkorders;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class BulkOrderDtos {
    private BulkOrderDtos() { }

    public enum BulkOrderStatus { REQUESTED, QUOTED, ACCEPTED, DECLINED, CANCELLED }

    /** Staff-set rules, with no defaults: bulk orders stay closed until staff set them. depositPercent: share of the quote paid up front. */
    public record BulkOrderPolicy(@NotNull @Min(1) @Max(10000) Integer minPortions,
                                  @NotNull @Min(0) @Max(720) Integer minLeadHours,
                                  @NotNull @Min(1) @Max(365) Integer maxDaysAhead,
                                  @NotNull @Min(0) @Max(100) Integer depositPercent) { }

    public record BulkOrderPolicyView(long version, int minPortions, int minLeadHours, int maxDaysAhead, int depositPercent, Instant updatedAt) { }

    public record BulkOrderItem(@NotNull UUID menuItemId, @NotNull @Min(1) @Max(5000) Integer quantity) { }

    /** eventAt: when the food is needed (UTC instant). notes: for the chef, for example spice level or allergies. */
    public record NewBulkOrder(@NotNull UUID kitchenId, @NotNull Instant eventAt, @Min(1) @Max(10000) Integer guests,
                               @Size(max = 500) String notes, @NotEmpty @Size(max = 30) List<@NotNull @Valid BulkOrderItem> items) { }

    /** listPricePaise: Catalog's price when the request was made; unitPricePaise: the chef's quoted price (null until quoted). */
    public record BulkOrderLine(UUID menuItemId, String name, int quantity, Long listPricePaise, Long unitPricePaise) { }

    /** expired: the event time or the quote's validity has passed, so it can no longer be accepted (the chef may quote again). */
    public record BulkOrderView(UUID id, UUID kitchenId, Instant eventAt, Integer guests, String notes, int portions, List<BulkOrderLine> lines,
                                BulkOrderStatus status, boolean expired, Long totalPaise, Long depositPaise, Integer depositPercent,
                                Instant quoteValidUntil, String quoteNote, String declineReason, long version, Instant createdAt) { }

    /** unitPricePaise is at most 1,00,000.00 a portion: a bound against mistyped and overflowing totals, not a price rule. */
    public record BulkQuoteLine(@NotNull UUID menuItemId, @NotNull @Min(0) @Max(10_000_000L) Long unitPricePaise) { }

    /** One price per requested dish; the quote replaces any earlier one. validUntil: no later than the event. */
    public record BulkQuote(@NotEmpty @Size(max = 30) List<@NotNull @Valid BulkQuoteLine> lines, @NotNull Instant validUntil,
                            @Size(max = 500) String note, @NotNull Long expectedVersion) { }

    public record BulkOrderAccept(@NotNull Long expectedVersion) { }

    public record BulkOrderDecline(@NotBlank @Size(max = 300) String reason) { }
}
