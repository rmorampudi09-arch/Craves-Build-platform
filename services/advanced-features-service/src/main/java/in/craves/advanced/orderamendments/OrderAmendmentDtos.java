package in.craves.advanced.orderamendments;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class OrderAmendmentDtos {
    private OrderAmendmentDtos() { }

    /**
     * REMOVE a line, REDUCE its quantity, REPLACE its dish with another dish of the same kitchen that costs no more, or ADJUST it
     * (same dish, changed preparation, for example "tofu instead of paneer"; needs a note). Nothing can make an order cost more.
     */
    public enum AmendmentChangeKind { REMOVE, REDUCE, REPLACE, ADJUST }

    public enum AmendmentParty { CUSTOMER, CHEF }

    public enum AmendmentStatus { PROPOSED, ACCEPTED, DECLINED, WITHDRAWN }

    /** quantity: only for REDUCE (the new quantity). substituteMenuItemId: only for REPLACE. note: required for ADJUST. */
    public record OrderAmendmentChange(@NotNull UUID orderItemId, @NotNull AmendmentChangeKind kind, @Min(1) @Max(100) Integer quantity,
                                       UUID substituteMenuItemId, @Size(max = 200) String note) { }

    /** note: for the other side, for example why a dish is unavailable today. */
    public record OrderAmendmentRequest(@NotEmpty @Size(max = 30) List<@NotNull @Valid OrderAmendmentChange> changes,
                                        @Size(max = 300) String note) { }

    /** Answers the version the person saw, so nobody accepts a proposal that changed in the meantime. */
    public record OrderAmendmentAccept(@NotNull Long expectedVersion) { }

    public record OrderAmendmentDecline(@Size(max = 300) String reason) { }

    /**
     * One change with the line before and after it. Prices are the order line's own price, before any order-wide discount (and
     * Catalog's price of a substitute when proposed); deltaPaise is the change in the gross food subtotal, never above zero.
     */
    public record OrderAmendmentLine(UUID orderItemId, AmendmentChangeKind kind, UUID menuItemId, String itemName, int quantityBefore,
                                     int quantityAfter, long unitPricePaise, UUID substituteMenuItemId, String substituteName,
                                     Long substituteUnitPricePaise, String note, long deltaPaise) { }

    /**
     * proposedBy answers to the other side: a CUSTOMER proposal is answered by the kitchen's chef, a CHEF proposal by the customer.
     * expired: still PROPOSED but past expiresAt, so it can no longer be accepted. foodDeltaPaise: the gross food change, never above
     * zero; refunds (sharing any order-wide discount across the lines) and order changes are applied by Order service (M24), not here.
     */
    public record OrderAmendmentView(UUID id, UUID orderId, UUID kitchenId, AmendmentParty proposedBy, List<OrderAmendmentLine> changes,
                                     long foodDeltaPaise, String note, AmendmentStatus status, boolean expired, Instant expiresAt,
                                     String answerNote, Instant answeredAt, long version, Instant createdAt) { }
}
