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
}
