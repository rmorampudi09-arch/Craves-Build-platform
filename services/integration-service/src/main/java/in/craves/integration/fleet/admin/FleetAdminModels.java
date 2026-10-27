package in.craves.integration.fleet.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Shapes of contracts/openapi/admin-fleet-v1.yaml. Nullable fields are sent as null, as the contract requires; the setup
 * shapes leave optional fields out instead.
 */
public final class FleetAdminModels {
    private FleetAdminModels() {
    }

    /** The acting admin, from the JWT. */
    public record Admin(UUID id, String name) {
    }

    public record RiderSummary(UUID riderId, String name, String phoneMasked, String status, int pendingDocuments,
                               boolean pendingDevice, Instant createdAt) {
    }

    public record RiderPage(List<RiderSummary> riders, String nextCursor) {
    }

    /** RiderSummary plus kycName, language and vehicleNumberMasked. */
    public record RiderHeader(UUID riderId, String name, String phoneMasked, String status, int pendingDocuments,
                              boolean pendingDevice, Instant createdAt, String kycName, String language, String vehicleNumberMasked) {
    }

    /**
     * submittedPayoutAccount: what the rider typed in the app, never paid until ops confirms it. recentOffers: the last 20
     * offers made to the rider, newest first, with how each reached the phone.
     */
    public record RiderDetail(RiderHeader rider, List<RiderDocument> documents, List<RiderDevice> devices,
                              PayoutAccount payoutAccount, PayoutAccount submittedPayoutAccount, List<Shift> shifts,
                              List<StatusEvent> statusEvents, List<RiderOffer> recentOffers) {
    }

    public record RiderDocument(UUID documentId, String type, String status, LocalDate expiresOn, String reason,
                                String reviewedBy, Instant reviewedAt, Instant uploadedAt) {
    }

    public record RiderDevice(UUID deviceId, String model, String appVersion, String state, Instant firstSeenAt,
                              String approvedBy, Instant approvedAt) {
    }

    public record PayoutAccount(String method, String maskedAccount, String ifsc, String holderName, String setBy, Instant setAt) {
    }

    /**
     * A shift and how the phone kept it (app 1.1.0; empty before): its last /locations call, the longest gap between two
     * calls and how many gaps passed 60 s (BACKEND.md "Location ingest"), and the phone's latest health report.
     */
    public record Shift(UUID shiftId, Instant startedAt, Instant endedAt, String selfieState, String selfieReason,
                        String selfieReviewedBy, int inZoneSeconds, Instant lastSeenAt, int maxSilenceSeconds, int silencesOver60s,
                        PhoneHealth phone) {
    }

    /**
     * The phone's latest report on a shift, about once a minute: battery, charging, power saver, whether an offer can ring,
     * battery used per unplugged hour (once 30 unplugged minutes have passed), why the app last died, and the trip steps
     * waiting to sync.
     */
    public record PhoneHealth(Integer batteryPct, Boolean charging, Boolean powerSave, Boolean canRing, Double batteryPerHourPct,
                              String lastExitReason, Integer queuePending, Integer queueOldestAgeS) {
    }

    /** An offer made to the rider, with what the push did and when and how the phone first had it (BACKEND.md "Offer receipts"). */
    public record RiderOffer(UUID offerId, UUID tripId, String orderCode, String state, Instant offeredAt, Instant pushedAt,
                             String pushResult, Instant rangAt, String rangChannel) {
    }

    public record StatusEvent(UUID eventId, String kind, String reason, String evidenceSummary, Instant deadline, Instant reviewBy,
                              String appealPhone, String approverName, Instant createdAt, String statusAfter) {
    }

    public record SelfieReview(UUID shiftId, UUID riderId, String riderName, Instant startedAt, String state, String reason,
                               String reviewedBy, Instant reviewedAt) {
    }

    public record SelfieQueue(List<SelfieReview> items) {
    }

    public record AuditEntry(UUID entryId, Instant at, String actorName, String action, UUID riderId, String targetId, String summary) {
    }

    public record AuditPage(List<AuditEntry> entries, String nextCursor) {
    }

    public record FileContent(String contentType, byte[] bytes) {
    }

    public record NewRider(String name, String phone, String language) {
    }

    public record ReasonInput(String reason) {
    }

    /** expiresOn is the date printed on the document; required for the driving licence, RC, insurance and PUC. */
    public record DocumentApproval(LocalDate expiresOn) {
    }

    /** regNumber is write-only: answered and audited masked. */
    public record VehicleInput(String label, String regNumber) {
    }

    public record RiderVehicle(String label, String regNumberMasked) {
    }

    /** The message every rider's Home shows until until. */
    public record ZoneBanner(String tone, String text, Instant until) {
    }

    public record StatusEventInput(String kind, String reason, String evidenceSummary, Instant deadline, Instant reviewBy,
                                   String appealPhone) {
    }

    /** upiId and accountNumber are write-only: never logged, echoed or stored in clear. */
    public record PayoutAccountInput(String method, String upiId, String accountNumber, String ifsc, String holderName,
                                     Boolean verifiedInPerson) {
        @Override
        public String toString() {
            return "PayoutAccountInput[redacted]";
        }
    }

    /** What the pilot zone runs on. dispatchPolicy and rateCard are the versions in force, null when none is. */
    public record FleetSetup(boolean testMode, DispatchPolicyVersion dispatchPolicy, List<DispatchPolicyVersion> dispatchPolicies,
                             RateCardVersion rateCard, List<RateCardVersion> rateCards, List<PilotRider> pilotRiders,
                             List<PilotKitchen> pilotKitchens) {
    }

    /** ranges are keyed by these camelCase field names, each [min, max]. withdrawnAt: an emergency stop withdrew it before it started. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record DispatchPolicyVersion(String version, String status, Instant effectiveFrom, Instant publishedAt, String mode,
                                        int offerSeconds, int fleetStageSeconds, int radiusM, int pickupDetourPercent,
                                        long perOrderOverheadPaise, long costGuardPremiumPaise, int pidgeStageSeconds,
                                        Map<String, List<Long>> ranges, Instant withdrawnAt) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RateCardVersion(String version, String status, Instant effectiveFrom, Instant publishedAt, long basePaise, int baseDropM,
                                  long dropPerKmPaise, int pickupFreeM, long pickupPerKmPaise, int waitFreeMinutes,
                                  long waitPerMinutePaise, long slotGuaranteePerHourPaise, long cancellationFeePaise,
                                  long returnPerKmPaise, int unreachableWaitMinutes, Map<String, List<Long>> ranges,
                                  Map<String, List<String>> summaryOfChanges, String fullTextUrl) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PilotRider(UUID riderId, String name, String status, String note, Instant addedAt) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PilotKitchen(UUID chefId, String note, Instant addedAt) {
    }

    /** A new rate card. ranges only while no rate card is published; later ones keep the published ranges. */
    public record RateCardDraft(Long basePaise, Integer baseDropM, Long dropPerKmPaise, Integer pickupFreeM, Long pickupPerKmPaise,
                                Integer waitFreeMinutes, Long waitPerMinutePaise, Long slotGuaranteePerHourPaise, Long cancellationFeePaise,
                                Long returnPerKmPaise, Integer unreachableWaitMinutes, Instant effectiveFrom,
                                Map<String, List<String>> summaryOfChanges, String fullTextUrl, Map<String, List<Long>> ranges) {
    }

    /** effectiveFrom counts only when it is at least 14 days away; otherwise the version starts now. */
    public record DispatchPolicyInput(String mode, Integer offerSeconds, Integer fleetStageSeconds, Integer radiusM,
                                      Integer pickupDetourPercent, Long perOrderOverheadPaise, Long costGuardPremiumPaise,
                                      Integer pidgeStageSeconds, Instant effectiveFrom) {
    }

    public record PilotNote(String note) {
    }
}
