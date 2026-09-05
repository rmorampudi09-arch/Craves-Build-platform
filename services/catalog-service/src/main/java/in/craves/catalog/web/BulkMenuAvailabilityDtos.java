package in.craves.catalog.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public final class BulkMenuAvailabilityDtos {
    private BulkMenuAvailabilityDtos() {
    }

    public record BulkAvailabilityRequest(
        @NotEmpty @Size(max = 100) List<@Valid AvailabilityChange> changes
    ) {
    }

    public record AvailabilityChange(
        @NotNull UUID menuItemId,
        boolean available,
        @Size(max = 500) String reason
    ) {
    }

    public record AvailabilityResult(
        UUID menuItemId,
        boolean available,
        boolean changed
    ) {
    }

    public record BulkAvailabilityResponse(
        int requestedCount,
        int changedCount,
        List<AvailabilityResult> items
    ) {
    }
}
