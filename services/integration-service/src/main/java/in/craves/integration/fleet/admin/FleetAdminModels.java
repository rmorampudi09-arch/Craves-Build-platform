package in.craves.integration.fleet.admin;

import com.fasterxml.jackson.annotation.JsonInclude;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.trip.FleetTripModels.OfferReason;
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

    /**
     * stage (docs/riders/FLOWS.md): for a PENDING rider APPLYING (something never sent: the rider's turn), FIXES (ops asked
     * for a new photo or the payout account again, or a checked document expired: the rider's turn) or REVIEW (all sent: ops's
     * turn); otherwise the status. missingDocuments and documentsToFix count the required documents never sent and those to
     * send again; payoutAccountSent: one is on file or waiting; readySince: when the last item arrived, in REVIEW only.
     */
    public record RiderSummary(UUID riderId, String name, String phoneMasked, String status, int pendingDocuments,
                               boolean pendingDevice, Instant createdAt, String stage, int missingDocuments, int documentsToFix,
                               boolean payoutAccountSent, Instant readySince) {
    }

    /** counts: riders per stage (REVIEW, FIXES, APPLYING, ACTIVE, SUSPENDED, DEACTIVATED), for the console's tabs. */
    public record RiderPage(List<RiderSummary> riders, String nextCursor, Map<String, Integer> counts) {
    }

    /** RiderSummary plus kycName, language, vehicleNumberMasked, and the vehicle the rider gave (kind and make and model). */
    public record RiderHeader(UUID riderId, String name, String phoneMasked, String status, int pendingDocuments,
                              boolean pendingDevice, Instant createdAt, String kycName, String language, String vehicleNumberMasked,
                              String stage, int missingDocuments, int documentsToFix, boolean payoutAccountSent, Instant readySince,
                              String vehicleKind, String vehicleLabel) {
    }

    /**
     * submittedPayoutAccount: what the rider typed in the app, never paid until ops confirms it. recentOffers: the last 20
     * offers made to the rider, newest first, with how each reached the phone. requiredDocuments: what this rider must send,
     * by vehicle kind; pilotRider: on the test-mode allow-list, so dispatch may offer them trips. documents: the latest photo
     * of each type, then the newest of the rest, 20 at most, newest first. applicationVersion: the rider's details and sent
     * payout account as shown, which an application decision sends back.
     */
    public record RiderDetail(RiderHeader rider, List<RiderDocument> documents, List<RiderDevice> devices,
                              PayoutAccount payoutAccount, PayoutAccount submittedPayoutAccount, List<Shift> shifts,
                              List<StatusEvent> statusEvents, List<RiderOffer> recentOffers, List<String> requiredDocuments,
                              boolean pilotRider, String applicationVersion) {
    }

    /**
     * Ops's verdict on one document of an application: OK verifies it, with the expiry printed on it for the four riding
     * documents; FIX rejects it with the reason the rider reads.
     */
    public record DocumentVerdict(UUID documentId, String verdict, LocalDate expiresOn, String reason) {
    }

    /**
     * Ops's one decision on a rider's application (docs/riders/FLOWS.md). APPROVE: nothing to fix, and the rider becomes
     * ACTIVE. FIXES: at least one item to fix; documents marked OK are verified now, so the rider sends only the rest.
     * payoutAccount: CONFIRM the account the rider sent (a payments admin too), or RETURN it so the rider sends it again;
     * absent leaves it as it is. applicationVersion: from the rider's detail ops checked; if the rider changed their details
     * or payout account since, the decision is refused.
     */
    public record ApplicationDecision(String decision, List<DocumentVerdict> documents, String payoutAccount, String applicationVersion) {
    }

    /**
     * What the decision did and what comes next. addedToPilot: put on the test-mode allow-list (test mode on); a false
     * rateCardPublished means the approved rider waits for pay rates before they can accept terms and go online.
     */
    public record ApplicationResult(UUID riderId, String decision, String status, String stage, int documentsVerified, int fixesAsked,
                                    boolean payoutAccountConfirmed, boolean payoutAccountReturned, boolean addedToPilot,
                                    boolean rateCardPublished) {
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
                        PhoneHealth phone, Instant onBreakUntil) {
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
    /** reason: why the rider got it (Phase 4), the same the rider saw; null on older offers and ops-assigned trips. */
    public record RiderOffer(UUID offerId, UUID tripId, String orderCode, String state, Instant offeredAt, Instant pushedAt,
                             String pushResult, Instant rangAt, String rangChannel, OfferReason reason) {
    }

    public record StatusEvent(UUID eventId, String kind, String reason, String evidenceSummary, Instant deadline, Instant reviewBy,
                              String appealPhone, String approverName, Instant createdAt, String statusAfter) {
    }

    /** referencePhotoId: the rider's sign-up selfie (a PHOTO document, verified first), shown beside this one; null when none. */
    public record SelfieReview(UUID shiftId, UUID riderId, String riderName, Instant startedAt, String state, String reason,
                               String reviewedBy, Instant reviewedAt, UUID referencePhotoId) {
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
    /** builtInDispatch: the values and rules a version saved without them gets, shown read-only in the console. */
    public record FleetSetup(boolean testMode, DispatchPolicyVersion dispatchPolicy, List<DispatchPolicyVersion> dispatchPolicies,
                             RateCardVersion rateCard, List<RateCardVersion> rateCards, List<PilotRider> pilotRiders,
                             List<PilotKitchen> pilotKitchens, BuiltInDispatch builtInDispatch) {
        public FleetSetup(boolean testMode, DispatchPolicyVersion dispatchPolicy, List<DispatchPolicyVersion> dispatchPolicies,
                          RateCardVersion rateCard, List<RateCardVersion> rateCards, List<PilotRider> pilotRiders,
                          List<PilotKitchen> pilotKitchens) {
            this(testMode, dispatchPolicy, dispatchPolicies, rateCard, rateCards, pilotRiders, pilotKitchens, BuiltInDispatch.current());
        }
    }

    /** How Craves dispatches by default (decided 1 Nov 2026): FleetPolicyStore.BUILT_IN_VALUES and DispatchRules.BUILT_IN. */
    public record BuiltInDispatch(int offerSeconds, int fleetStageSeconds, int radiusM, int pickupDetourPercent, long perOrderOverheadPaise,
                                  long costGuardPremiumPaise, int pidgeStageSeconds, int offersAtOnce, int offerRounds, int fairBandM,
                                  boolean rankByTravelTime) {
        public static BuiltInDispatch current() {
            Map<String, Number> values = FleetPolicyStore.BUILT_IN_VALUES;
            FleetPolicyStore.DispatchRules rules = FleetPolicyStore.DispatchRules.BUILT_IN;
            return new BuiltInDispatch(values.get("offer_seconds").intValue(), values.get("fleet_stage_seconds").intValue(),
                values.get("radius_m").intValue(), values.get("pickup_detour_percent").intValue(),
                values.get("per_order_overhead_paise").longValue(), values.get("cost_guard_premium_paise").longValue(),
                values.get("pidge_stage_seconds").intValue(), rules.offersAtOnce(), rules.offerRounds(), rules.fairBandM(),
                rules.byTravelTime());
        }
    }

    /**
     * ranges are keyed by these camelCase field names, each [min, max]. withdrawnAt: an emergency stop withdrew it before it
     * started. offersAtOnce, offerRounds and fairBandM are how orders are offered (Phase 4), within fixed bounds;
     * rankByTravelTime (Phase 5): the soonest at the kitchen by the travel-time model hear first, not the nearest.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record DispatchPolicyVersion(String version, String status, Instant effectiveFrom, Instant publishedAt, String mode,
                                        int offerSeconds, int fleetStageSeconds, int radiusM, int pickupDetourPercent,
                                        long perOrderOverheadPaise, long costGuardPremiumPaise, int pidgeStageSeconds,
                                        Map<String, List<Long>> ranges, Instant withdrawnAt, int offersAtOnce, int offerRounds,
                                        int fairBandM, boolean rankByTravelTime) {
    }

    /** rainTopUpPaise: added to each offer while rain mode is on (0: none). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RateCardVersion(String version, String status, Instant effectiveFrom, Instant publishedAt, long basePaise, int baseDropM,
                                  long dropPerKmPaise, int pickupFreeM, long pickupPerKmPaise, int waitFreeMinutes,
                                  long waitPerMinutePaise, long slotGuaranteePerHourPaise, long cancellationFeePaise,
                                  long returnPerKmPaise, int unreachableWaitMinutes, Map<String, List<Long>> ranges,
                                  Map<String, List<String>> summaryOfChanges, String fullTextUrl, long rainTopUpPaise) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PilotRider(UUID riderId, String name, String status, String note, Instant addedAt) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PilotKitchen(UUID chefId, String note, Instant addedAt) {
    }

    /**
     * A new rate card. ranges only while no rate card is published; later ones keep the published ranges. rainTopUpPaise
     * (rain mode; absent: 0) is outside the declared ranges: it only ever adds to pay.
     */
    public record RateCardDraft(Long basePaise, Integer baseDropM, Long dropPerKmPaise, Integer pickupFreeM, Long pickupPerKmPaise,
                                Integer waitFreeMinutes, Long waitPerMinutePaise, Long slotGuaranteePerHourPaise, Long cancellationFeePaise,
                                Long returnPerKmPaise, Integer unreachableWaitMinutes, Instant effectiveFrom,
                                Map<String, List<String>> summaryOfChanges, String fullTextUrl, Map<String, List<Long>> ranges,
                                Long rainTopUpPaise) {
        /** The console before rain mode: no rain top-up. */
        public RateCardDraft(Long basePaise, Integer baseDropM, Long dropPerKmPaise, Integer pickupFreeM, Long pickupPerKmPaise,
                             Integer waitFreeMinutes, Long waitPerMinutePaise, Long slotGuaranteePerHourPaise, Long cancellationFeePaise,
                             Long returnPerKmPaise, Integer unreachableWaitMinutes, Instant effectiveFrom,
                             Map<String, List<String>> summaryOfChanges, String fullTextUrl, Map<String, List<Long>> ranges) {
            this(basePaise, baseDropM, dropPerKmPaise, pickupFreeM, pickupPerKmPaise, waitFreeMinutes, waitPerMinutePaise,
                slotGuaranteePerHourPaise, cancellationFeePaise, returnPerKmPaise, unreachableWaitMinutes, effectiveFrom, summaryOfChanges,
                fullTextUrl, ranges, null);
        }
    }

    /**
     * effectiveFrom counts only when it is at least 14 days away; otherwise the version starts now. offersAtOnce, offerRounds,
     * fairBandM (Phase 4) and rankByTravelTime (Phase 5) keep the values riders are shown when absent.
     */
    public record DispatchPolicyInput(String mode, Integer offerSeconds, Integer fleetStageSeconds, Integer radiusM,
                                      Integer pickupDetourPercent, Long perOrderOverheadPaise, Long costGuardPremiumPaise,
                                      Integer pidgeStageSeconds, Instant effectiveFrom, Integer offersAtOnce, Integer offerRounds,
                                      Integer fairBandM, Boolean rankByTravelTime) {
        /** The console of Phase 4: by distance, unless riders are shown otherwise. */
        public DispatchPolicyInput(String mode, Integer offerSeconds, Integer fleetStageSeconds, Integer radiusM,
                                   Integer pickupDetourPercent, Long perOrderOverheadPaise, Long costGuardPremiumPaise,
                                   Integer pidgeStageSeconds, Instant effectiveFrom, Integer offersAtOnce, Integer offerRounds,
                                   Integer fairBandM) {
            this(mode, offerSeconds, fleetStageSeconds, radiusM, pickupDetourPercent, perOrderOverheadPaise, costGuardPremiumPaise,
                pidgeStageSeconds, effectiveFrom, offersAtOnce, offerRounds, fairBandM, null);
        }

        /** The console before Phase 4: how orders are offered stays as riders are shown it. */
        public DispatchPolicyInput(String mode, Integer offerSeconds, Integer fleetStageSeconds, Integer radiusM,
                                   Integer pickupDetourPercent, Long perOrderOverheadPaise, Long costGuardPremiumPaise,
                                   Integer pidgeStageSeconds, Instant effectiveFrom) {
            this(mode, offerSeconds, fleetStageSeconds, radiusM, pickupDetourPercent, perOrderOverheadPaise, costGuardPremiumPaise,
                pidgeStageSeconds, effectiveFrom, null, null, null, null);
        }
    }

    public record PilotNote(String note) {
    }

    /**
     * Rain mode (R16 19): level is the ops switch (off, on or severe), set by setByName at setAt (null before anyone set it);
     * inForce what dispatch runs on now, which is on also while the automatic switch (auto, CRAVES_FLEET_RAIN_AUTO) finds rides
     * running slow; rainTopUpPaise the rate card in force's top-up on each offer while it is on (0: none).
     */
    public record RainMode(String level, String inForce, boolean auto, String setByName, Instant setAt, long rainTopUpPaise) {
    }

    /** off, on or severe. */
    public record RainModeInput(String level) {
    }
}
