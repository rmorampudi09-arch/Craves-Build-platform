package in.craves.advanced.trust;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class TrustDtos {
    private TrustDtos() { }

    public enum ReportTarget { KITCHEN, DISH, REVIEW, PERSON }

    /** WRONG_LABEL: a cuisine, diet or allergen claim the dish does not meet (M03, M04). */
    public enum ReportReason { FOOD_SAFETY, HYGIENE, WRONG_LABEL, MISLEADING, ABUSE, FRAUD, SPAM, OTHER }

    public enum ReportStatus { OPEN, UPHELD, DISMISSED }

    public enum DisputeCategory { MISSING_ITEMS, WRONG_ITEMS, QUALITY, FOOD_SAFETY, NOT_DELIVERED, LATE, OVERCHARGED, REFUND_ISSUE, OTHER }

    public enum DisputeStatus { OPEN, RESOLVED, REJECTED, WITHDRAWN }

    public enum RiskSubject { PERSON, KITCHEN }

    public enum RiskSeverity { LOW, MEDIUM, HIGH }

    /** orderId: the order the report is about, when there is one (context for staff). */
    public record NewTrustReport(@NotNull ReportTarget targetType, @NotNull UUID targetId, @NotNull ReportReason reason,
                                 @NotBlank @Size(max = 1000) String details, UUID orderId) { }

    /** The reporter's own view: the outcome, never staff notes or who decided. */
    public record TrustReportView(UUID id, ReportTarget targetType, UUID targetId, ReportReason reason, String details, UUID orderId,
                                  ReportStatus status, Instant createdAt, Instant decidedAt) { }

    /** reporterId is the nil UUID when the reporter erased their data. */
    public record StaffTrustReport(UUID id, UUID reporterId, ReportTarget targetType, UUID targetId, ReportReason reason, String details,
                                   UUID orderId, ReportStatus status, String decisionNote, UUID decidedBy, Instant decidedAt, Instant createdAt) { }

    /** outcome: UPHELD or DISMISSED. Acting on an upheld report (removing a review, pausing a kitchen) happens in the owning service. */
    public record TrustReportDecision(@NotNull ReportStatus outcome, @NotBlank @Size(max = 500) String note) { }

    /** Staff-set rule with no default: disputes stay closed until it is set. windowHours: how long after ordering a dispute may be opened. */
    public record DisputePolicy(@NotNull @Min(1) @Max(2160) Integer windowHours) { }

    public record DisputePolicyView(long version, int windowHours, Instant updatedAt) { }

    /** claimedPaise: what the customer asks back, at most what may be refunded (see OrderDisputeView.refundablePaise). */
    public record NewOrderDispute(@NotNull UUID orderId, @NotNull DisputeCategory category, @NotBlank @Size(max = 1000) String description,
                                  @Min(1) Long claimedPaise) { }

    public record ChefDisputeStatement(@NotBlank @Size(max = 1000) String statement) { }

    /** outcome: RESOLVED (refundPaise optional, at most refundablePaise) or REJECTED (no refund). note is shown to both sides. */
    public record OrderDisputeDecision(@NotNull DisputeStatus outcome, @Min(1) Long refundPaise, @NotBlank @Size(max = 500) String note,
                                       @NotNull Long expectedVersion) { }

    /**
     * What the customer and the chef see (no person ids). orderValuePaise: the order's total when the dispute was opened (before
     * wallet and referral discounts). refundablePaise: the most a decision may refund, the total of a delivered order and nothing
     * for orders Order service already refunds in full. refundPaise is the staff decision; Order service pays it (M24), taking off
     * any discount so it never refunds more than was paid.
     */
    public record OrderDisputeView(UUID id, UUID orderId, UUID kitchenId, DisputeCategory category, String description, Long claimedPaise,
                                   long orderValuePaise, long refundablePaise, String chefStatement, Instant chefRespondedAt, DisputeStatus status, Long refundPaise,
                                   String decisionNote, Instant decidedAt, long version, Instant createdAt) { }

    /** customerId is the nil UUID when the customer erased their data. */
    public record StaffOrderDispute(OrderDisputeView dispute, UUID customerId) { }

    public record NewRiskFlag(@NotNull RiskSubject subjectType, @NotNull UUID subjectId, @NotNull RiskSeverity severity,
                              @NotBlank @Size(max = 500) String reason) { }

    public record RiskFlagClear(@NotBlank @Size(max = 500) String note) { }

    public record RiskFlagView(UUID id, RiskSubject subjectType, UUID subjectId, RiskSeverity severity, String reason, boolean open, UUID raisedBy,
                               Instant raisedAt, UUID clearedBy, Instant clearedAt, String clearNote) { }

    /**
     * Counts for staff, never a verdict: what to do at which numbers is a staff decision. For a PERSON, reports name them and
     * disputes are the ones they opened; for a KITCHEN, reports name the kitchen and disputes are about its orders.
     */
    public record RiskSummary(RiskSubject subjectType, UUID subjectId, List<RiskFlagView> openFlags, int reportsOpen, int reportsUpheld,
                              int reportsDismissed, int disputesOpen, int disputesResolved, int disputesRejected, long refundsDecidedPaise) { }
}
