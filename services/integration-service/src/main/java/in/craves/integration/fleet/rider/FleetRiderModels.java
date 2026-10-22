package in.craves.integration.fleet.rider;

import com.fasterxml.jackson.annotation.JsonInclude;
import in.craves.integration.fleet.trip.FleetTripModels;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Shapes of contracts/openapi/rider-v1.yaml. Optional fields are left out when absent. */
public final class FleetRiderModels {
    private FleetRiderModels() {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RiderMe(String riderId, String name, String phoneMasked, String photoUrl, String status, String statusReason,
                          Instant statusEffectiveAt, RiderNotice notice, String termsVersion, String acceptedTermsVersion,
                          String language, String minAppVersion, String supportPhone, String supportWhatsappUrl, Features features) {
    }

    public record Features(boolean payoutsEnabled, boolean withdrawEnabled) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RiderNotice(String title, String reason, Instant deadline, String appealPhone, Instant sentAt, String checking,
                              String tripId) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RiderProfile(Vehicle vehicle, List<ProfileDocument> documents, String payoutAccountMasked, Insurance insurance) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Vehicle(String label, String regNumberMasked) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ProfileDocument(String type, String label, String status, LocalDate expiresOn, String reason) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Insurance(String label, String claimPhone, String claimStatus) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record HomeSummary(boolean online, Instant shiftStartedAt, String zoneName, Instant slotEndsAt, long todayEarningsPaise,
                              int todayTrips, String activeTripId, NextSlot nextSlot, Long guaranteedPerHourPaise, RestPoint restPoint,
                              Banner banner) {
    }

    public record NextSlot(Instant startsAt, Instant endsAt, String zoneName) {
    }

    public record RestPoint(String name, String area) {
    }

    public record Banner(String tone, String text) {
    }

    /** upcoming: the published rate card that starts later, shown during its 14 days' notice. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Terms(String version, Instant effectiveFrom, List<String> summaryOfChanges, List<LabelValue> rateCardLines,
                        List<LabelValue> grievanceLines, String fullTextUrl, boolean draft, UpcomingTerms upcoming) {
    }

    public record UpcomingTerms(String version, Instant effectiveFrom, List<String> summaryOfChanges, List<LabelValue> rateCardLines) {
    }

    public record LabelValue(String label, String value) {
    }

    public record AcceptTerms(String version) {
    }

    /** installationId is Android's ANDROID_ID for the rider app. */
    public record DeviceRegistration(String installationId, String fcmToken, String appVersion, String model) {
        @Override
        public String toString() {
            return "DeviceRegistration[redacted, appVersion=" + appVersion + ", model=" + model + "]";
        }
    }

    /** One phone fix; mock is Android's mock-location flag, stored with the fix and never used for pay. */
    public record RiderFix(Double lat, Double lng, Double accuracyM, Instant at, Boolean mock) {
    }

    public record LocationBatch(List<RiderFix> fixes) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record LocationBatchResponse(List<FleetTripModels.Offer> offers, ActiveTrip activeTrip, Boolean stop, String stopReason) {
    }

    public record ActiveTrip(String tripId, String step, int version) {
    }

    /** The credential is returned once and never stored in clear. */
    public record ShiftStart(String shiftCredential, Instant expiresAt) {
        @Override
        public String toString() {
            return "ShiftStart[redacted, expiresAt=" + expiresAt + "]";
        }
    }
}
