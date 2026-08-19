package in.craves.catalog.web;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public final class KitchenScheduleDtos {
    private KitchenScheduleDtos() {
    }

    public record ServiceWindowRequest(
        int dayOfWeek,
        LocalTime opensAt,
        LocalTime closesAt
    ) {
    }

    public record ServiceWindowResponse(
        UUID id,
        int dayOfWeek,
        LocalTime opensAt,
        LocalTime closesAt
    ) {
    }

    public record KitchenScheduleUpdateRequest(
        Boolean acceptingOrders,
        Instant pausedUntil,
        String pauseReason,
        List<ServiceWindowRequest> weeklyWindows
    ) {
    }

    public record KitchenScheduleResponse(
        UUID kitchenId,
        String timezoneId,
        boolean acceptingOrders,
        Instant pausedUntil,
        String pauseReason,
        List<ServiceWindowResponse> weeklyWindows
    ) {
    }

    public record DateWindowRequest(
        LocalTime opensAt,
        LocalTime closesAt
    ) {
    }

    public record DateWindowResponse(
        UUID id,
        LocalTime opensAt,
        LocalTime closesAt
    ) {
    }

    public record KitchenDateOverrideRequest(
        boolean closed,
        String reason,
        List<DateWindowRequest> windows
    ) {
    }

    public record KitchenDateOverrideResponse(
        UUID kitchenId,
        LocalDate serviceDate,
        boolean closed,
        String reason,
        List<DateWindowResponse> windows
    ) {
    }

    public record KitchenAvailabilityResponse(
        UUID kitchenId,
        Instant evaluatedAt,
        String timezoneId,
        LocalDate localDate,
        LocalTime localTime,
        boolean kitchenActive,
        boolean scheduleConfigured,
        boolean acceptingOrders,
        boolean paused,
        boolean openBySchedule,
        boolean availableNow
    ) {
    }
}
