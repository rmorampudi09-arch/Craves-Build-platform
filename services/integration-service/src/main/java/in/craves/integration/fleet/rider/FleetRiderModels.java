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
    /** payoutAccountSubmitted: the account the rider sent from the app, masked, until ops confirms it. */
    public record RiderProfile(Vehicle vehicle, List<ProfileDocument> documents, String payoutAccountMasked, Insurance insurance,
                               @JsonInclude(JsonInclude.Include.NON_NULL) String payoutAccountSubmitted) {
    }

    /** kind: PETROL, ELECTRIC or BICYCLE as the rider signed up; absent for a rider ops added before sign-up existed. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Vehicle(String label, String regNumberMasked, String kind) {
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

    /**
     * upcoming: the next change to these terms (the next published rate card or pickup detour change, whichever is first),
     * shown during its 14 days' notice.
     */
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

    /** Sign-up from the app. vehicleKind PETROL, ELECTRIC or BICYCLE; the registration number is needed for a motor vehicle. */
    public record SignUp(String name, String language, String vehicleKind, String vehicleRegNumber, Boolean adult) {
    }

    /** The rider's own payout account: UPI (upiId) or BANK (accountNumber and ifsc), in their KYC name. */
    public record PayoutAccountInput(String method, String holderName, String upiId, String accountNumber, String ifsc) {
        @Override
        public String toString() {
            return "PayoutAccountInput[method=" + method + "]";
        }
    }

    /** installationId is Android's ANDROID_ID for the rider app. */
    public record DeviceRegistration(String installationId, String fcmToken, String appVersion, String model) {
        @Override
        public String toString() {
            return "DeviceRegistration[redacted, appVersion=" + appVersion + ", model=" + model + "]";
        }
    }

    /**
     * One phone fix; mock is Android's mock-location flag, stored with the fix and never used for pay. ageMs (app 1.1.0)
     * is how old the fix was when sent, by the phone's monotonic clock: with it the server times the fix by its own clock
     * and at, the phone's wall-clock stamp, is not trusted.
     */
    public record RiderFix(Double lat, Double lng, Double accuracyM, Instant at, Boolean mock, Long ageMs) {
        public RiderFix(Double lat, Double lng, Double accuracyM, Instant at, Boolean mock) {
            this(lat, lng, accuracyM, at, mock, null);
        }
    }

    /** offerReceipts is optional (rider app 1.1.0 and later); APKs that don't send it keep working. */
    public record LocationBatch(List<RiderFix> fixes, List<OfferReceipt> offerReceipts) {
        public LocationBatch(List<RiderFix> fixes) {
            this(fixes, null);
        }
    }

    /**
     * When an offer first reached the phone (blueprint A5): its id, the channel it came by (fcm or locations), and how
     * long before this call, by the phone's monotonic clock.
     */
    public record OfferReceipt(String offerId, String channel, Long ageMs) {
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
