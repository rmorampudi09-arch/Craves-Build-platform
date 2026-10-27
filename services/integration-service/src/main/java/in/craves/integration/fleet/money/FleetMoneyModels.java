package in.craves.integration.fleet.money;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Rider money shapes: rider-v1 (TripEarning, EarningsPage; optional fields left out) and admin-fleet-v1 (Hold; nullable
 * fields sent as null).
 */
public final class FleetMoneyModels {
    private FleetMoneyModels() {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TripEarning(String tripId, Instant completedAt, String kitchenArea, String customerLocality, String status,
                              String holdReason, Instant releaseOn, long amountPaise, List<Line> lines, int pickupDistanceM,
                              int dropDistanceM, String rateCardVersion) {
    }

    /** rider-v1 PayLine. */
    public record Line(String label, long amountPaise) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record EarningsPage(String rangeLabel, long totalPaise, List<TripEarning> trips, String nextCursor) {
    }

    public record Hold(UUID holdId, UUID tripId, String orderCode, UUID riderId, String riderName, long amountPaise, String reason,
                       LocalDate releaseOn, String state, String createdBy, Instant createdAt, String releasedBy, Instant releasedAt) {
    }

    public record HoldPage(List<Hold> holds) {
    }

    public record HoldInput(UUID tripId, String reason, LocalDate releaseOn) {
    }

    /** rider-v1 Payout: SCHEDULED until the bank file is sent, then PROCESSING until ops marks it PAID (with the UTR) or FAILED. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RiderPayout(String payoutId, String periodLabel, long amountPaise, String status, String utr, Instant paidAt) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PayoutsPage(LocalDate nextPayoutOn, long withdrawablePaise, List<RiderPayout> payouts) {
    }

    public record WithdrawalInput(Long amountPaise) {
    }

    /** admin-fleet-v1 PayoutBatchSummary, and PayoutBatch when payouts is set (the list leaves it out). */
    public record PayoutBatch(UUID batchId, String kind, LocalDate payoutDate, String status, long totalPaise, int payoutCount,
                              String createdBy, boolean createdByMe, Instant createdAt, String approvedBy, Instant approvedAt,
                              Instant sentAt, @JsonInclude(JsonInclude.Include.NON_NULL) List<Payout> payouts) {
    }

    public record BatchPage(List<PayoutBatch> batches) {
    }

    public record Payout(UUID payoutId, UUID riderId, String riderName, long amountPaise, String maskedAccount, String status, String utr,
                         String failureReason, String markedBy, Instant markedAt) {
    }

    public record BatchInput(String kind, LocalDate payoutDate) {
    }

    public record UtrInput(String utr) {
    }

    /** A signed correction to one pay component of a credited trip, with the reason the rider sees. */
    public record AdjustmentInput(String component, Long amountPaise, String reason) {
    }

    /** admin-fleet-v1 PayAdjustment: the row the rider now sees on the trip, as revision 2 or later of its component. */
    public record Adjustment(UUID tripId, String orderCode, UUID riderId, String component, int revision, long amountPaise, String reason) {
    }

    /** notUploaded: the admin checked that the file never reached the bank. */
    public record CancelBatchInput(String reason, Boolean notUploaded) {
    }

    /** admin-fleet-v1 CancelledBatch: the unsent file that is gone, as it was. */
    public record CancelledBatch(UUID batchId, String kind, LocalDate payoutDate, int payoutCount, long totalPaise) {
    }
}
