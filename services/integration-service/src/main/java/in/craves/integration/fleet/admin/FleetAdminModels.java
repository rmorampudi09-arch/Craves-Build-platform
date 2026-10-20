package in.craves.integration.fleet.admin;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Shapes of contracts/openapi/admin-fleet-v1.yaml (P1 paths). Nullable fields are sent as null, as the contract requires. */
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

    public record RiderDetail(RiderHeader rider, List<RiderDocument> documents, List<RiderDevice> devices,
                              PayoutAccount payoutAccount, List<Shift> shifts, List<StatusEvent> statusEvents) {
    }

    public record RiderDocument(UUID documentId, String type, String status, LocalDate expiresOn, String reason,
                                String reviewedBy, Instant reviewedAt, Instant uploadedAt) {
    }

    public record RiderDevice(UUID deviceId, String model, String appVersion, String state, Instant firstSeenAt,
                              String approvedBy, Instant approvedAt) {
    }

    public record PayoutAccount(String method, String maskedAccount, String ifsc, String holderName, String setBy, Instant setAt) {
    }

    public record Shift(UUID shiftId, Instant startedAt, Instant endedAt, String selfieState, String selfieReason,
                        String selfieReviewedBy, int inZoneSeconds) {
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
}
