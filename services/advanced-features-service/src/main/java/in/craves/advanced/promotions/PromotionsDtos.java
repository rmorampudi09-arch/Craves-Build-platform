package in.craves.advanced.promotions;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PromotionsDtos {
    static final String CODE = "[A-Za-z0-9]{4,20}";

    private PromotionsDtos() { }

    public enum DiscountKind { PERCENT, FLAT }

    public enum FundedBy { CRAVES, KITCHEN }

    public enum PromotionStatus { DRAFT, ACTIVE, PAUSED, ENDED }

    public enum RedemptionStatus { RESERVED, CONFIRMED, RELEASED, VOIDED }

    /**
     * A promotion's definition, entered by staff; no field has a commercial default. code: what customers type (stored in
     * capitals); without one the promotion applies by itself to every cart that qualifies. kitchenIds: empty means every kitchen.
     * PERCENT uses percentOff (and maxDiscountPaise as an optional cap); FLAT uses flatPaise. Money is integer paise.
     */
    public record NewPromotion(@NotBlank @Size(max = 80) String name,
                               @NotBlank @Size(max = 80) String title,
                               @Size(max = 300) String description,
                               @Pattern(regexp = CODE) String code,
                               @NotNull DiscountKind discountKind,
                               @Min(1) @Max(100) Integer percentOff,
                               @Min(1) Long flatPaise,
                               @Min(1) Long maxDiscountPaise,
                               @NotNull @Min(0) Long minOrderPaise,
                               @Size(max = 50) List<@NotNull UUID> kitchenIds,
                               @NotNull FundedBy fundedBy,
                               @NotNull @Min(1) @Max(100) Integer perPersonLimit,
                               @NotNull @Min(1) Long totalBudgetPaise,
                               @Min(1) Integer maxRedemptions,
                               @NotNull Instant startsAt,
                               @NotNull Instant endsAt,
                               @NotNull Boolean listed) { }

    /**
     * Replaces the whole definition and sets the status. Once a promotion has been active its terms (code, discount, cap,
     * minimum order, kitchens, funding, per-person limit, start) are frozen; name, title, description, listing, end, budget,
     * redemption cap and status still change.
     */
    public record PromotionChange(@NotNull @Valid NewPromotion promotion, @NotNull PromotionStatus status, @NotNull Long expectedVersion) { }

    /** Staff view. committedPaise: discounts confirmed plus those reserved and not expired, counted against the budget. */
    public record AdminPromotion(UUID id, NewPromotion promotion, PromotionStatus status, Instant activatedAt, long version, Instant updatedAt,
                                 int reserved, int confirmed, long committedPaise) { }

    /** What customers see: the terms, never budget or usage. code is null for an offer that applies by itself. */
    public record PromotionOffer(UUID id, String title, String description, String code, DiscountKind discountKind, Integer percentOff,
                                 Long flatPaise, Long maxDiscountPaise, long minOrderPaise, List<UUID> kitchenIds, Instant endsAt) { }

    public record PromotionCartItem(@NotNull UUID menuItemId, @NotNull @Min(1) @Max(100) Integer quantity) { }

    /** code: a coupon code; without one the best offer that applies by itself is used. */
    public record PromotionCartRequest(@Pattern(regexp = CODE) String code,
                                       @NotEmpty @Size(max = 50) List<@NotNull @Valid PromotionCartItem> items) { }

    /**
     * Prices are the dishes' live Catalog prices (option add-ons are not counted); order-service stays the authority for the
     * final total. eligibleSubtotalPaise: the part of the cart from the promotion's kitchens. promotion is null when none applies.
     */
    public record PromotionQuote(long subtotalPaise, long eligibleSubtotalPaise, long discountPaise, PromotionOffer promotion) { }

    /** status RESERVED with expiresAt in the past means the reservation lapsed and no longer counts. */
    public record PromotionRedemption(UUID id, UUID promotionId, UUID personId, long discountPaise, long subtotalPaise,
                                      long eligibleSubtotalPaise, RedemptionStatus status, UUID orderId, Instant expiresAt, Instant createdAt) { }

    public record PromotionRedemptionPage(List<PromotionRedemption> items, String nextCursor) { }

    public record PromotionRedemptionConfirm(@NotNull UUID orderId) { }

    public record PromotionRedemptionVoid(@NotBlank @Size(max = 300) String reason) { }
}
