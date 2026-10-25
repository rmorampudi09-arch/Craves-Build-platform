package in.craves.integration.fleet.support;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** rider-v1 SupportIssue and the SOS body; admin-fleet-v1 SupportIssue and SosEvent (nullable fields sent as null). */
public final class FleetSupportModels {
    private FleetSupportModels() {
    }

    public record IssueInput(String category, String tripId, String payoutId, String note) {
    }

    /** rider-v1 RiderFix. */
    public record Fix(Double lat, Double lng, Double accuracyM, Instant at, Boolean mock) {
    }

    public record SosInput(String tripId, Fix fix) {
    }

    public record Issue(UUID issueId, UUID riderId, String riderName, UUID tripId, String category, String text, String state,
                        Instant createdAt, Instant acknowledgeBy, Instant fixBy) {
    }

    public record IssuePage(List<Issue> issues) {
    }

    public record SosEvent(UUID sosId, UUID riderId, String riderName, String phoneMasked, Instant at, Double lat, Double lng, UUID tripId) {
    }

    public record SosPage(List<SosEvent> events) {
    }
}
