package in.craves.catalog.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.web.KitchenScheduleDtos.DateWindowRequest;
import in.craves.catalog.web.KitchenScheduleDtos.DateWindowResponse;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenAvailabilityResponse;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenDateOverrideRequest;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenDateOverrideResponse;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenScheduleResponse;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenScheduleUpdateRequest;
import in.craves.catalog.web.KitchenScheduleDtos.ServiceWindowRequest;
import in.craves.catalog.web.KitchenScheduleDtos.ServiceWindowResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class KitchenScheduleService {
    private static final String HYDERABAD_TIMEZONE = "Asia/Kolkata";
    private static final int MAX_WEEKLY_WINDOWS = 56;
    private static final int MAX_WINDOWS_PER_OVERRIDE = 8;
    private static final int MAX_REASON_LENGTH = 160;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public KitchenScheduleService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public KitchenScheduleResponse getMySchedule(CravesPrincipal principal) {
        UUID kitchenId = requireChefKitchen(principal);
        ensureConfig(kitchenId);
        return readSchedule(kitchenId);
    }

    @Transactional
    public KitchenScheduleResponse replaceMySchedule(
        CravesPrincipal principal,
        KitchenScheduleUpdateRequest request
    ) {
        UUID kitchenId = requireChefKitchen(principal);
        validateScheduleRequest(request);
        ensureConfig(kitchenId);
        KitchenScheduleResponse oldState = readSchedule(kitchenId);

        jdbcTemplate.update(
            "UPDATE catalog_schema.kitchen_schedule_config " +
                "SET accepting_orders = ?, paused_until = ?, pause_reason = ?, updated_at = now() " +
                "WHERE kitchen_id = ?",
            request.acceptingOrders(),
            timestamp(request.pausedUntil()),
            trimReason(request.pauseReason()),
            kitchenId
        );
        jdbcTemplate.update(
            "DELETE FROM catalog_schema.kitchen_weekly_service_window WHERE kitchen_id = ?",
            kitchenId
        );
        for (ServiceWindowRequest window : sortedWeeklyWindows(request.weeklyWindows())) {
            jdbcTemplate.update(
                "INSERT INTO catalog_schema.kitchen_weekly_service_window " +
                    "(id, kitchen_id, day_of_week, opens_at, closes_at, created_at) " +
                    "VALUES (?, ?, ?, ?, ?, now())",
                UUID.randomUUID(),
                kitchenId,
                window.dayOfWeek(),
                window.opensAt(),
                window.closesAt()
            );
        }

        KitchenScheduleResponse newState = readSchedule(kitchenId);
        audit(kitchenId, principal.identityId(), "WEEKLY_SCHEDULE_REPLACED", oldState, newState);
        return newState;
    }

    @Transactional
    public KitchenDateOverrideResponse putMyDateOverride(
        CravesPrincipal principal,
        LocalDate serviceDate,
        KitchenDateOverrideRequest request
    ) {
        UUID kitchenId = requireChefKitchen(principal);
        if (serviceDate == null) {
            throw ApiException.badRequest("SERVICE_DATE_REQUIRED", "serviceDate is required");
        }
        validateOverrideRequest(request);
        ensureConfig(kitchenId);
        KitchenDateOverrideResponse oldState = readOverrideOrNull(kitchenId, serviceDate);

        jdbcTemplate.update(
            "INSERT INTO catalog_schema.kitchen_schedule_date_override " +
                "(kitchen_id, service_date, closed, reason, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, now(), now()) " +
                "ON CONFLICT (kitchen_id, service_date) DO UPDATE " +
                "SET closed = EXCLUDED.closed, reason = EXCLUDED.reason, updated_at = now()",
            kitchenId,
            serviceDate,
            request.closed(),
            trimReason(request.reason())
        );
        jdbcTemplate.update(
            "DELETE FROM catalog_schema.kitchen_schedule_override_window " +
                "WHERE kitchen_id = ? AND service_date = ?",
            kitchenId,
            serviceDate
        );
        if (!request.closed()) {
            for (DateWindowRequest window : sortedDateWindows(request.windows())) {
                jdbcTemplate.update(
                    "INSERT INTO catalog_schema.kitchen_schedule_override_window " +
                        "(id, kitchen_id, service_date, opens_at, closes_at, created_at) " +
                        "VALUES (?, ?, ?, ?, ?, now())",
                    UUID.randomUUID(),
                    kitchenId,
                    serviceDate,
                    window.opensAt(),
                    window.closesAt()
                );
            }
        }

        KitchenDateOverrideResponse newState = readOverride(kitchenId, serviceDate);
        audit(kitchenId, principal.identityId(), "DATE_OVERRIDE_UPSERTED", oldState, newState);
        return newState;
    }

    @Transactional
    public void deleteMyDateOverride(CravesPrincipal principal, LocalDate serviceDate) {
        UUID kitchenId = requireChefKitchen(principal);
        if (serviceDate == null) {
            throw ApiException.badRequest("SERVICE_DATE_REQUIRED", "serviceDate is required");
        }
        KitchenDateOverrideResponse oldState = readOverrideOrNull(kitchenId, serviceDate);
        jdbcTemplate.update(
            "DELETE FROM catalog_schema.kitchen_schedule_date_override " +
                "WHERE kitchen_id = ? AND service_date = ?",
            kitchenId,
            serviceDate
        );
        if (oldState != null) {
            audit(kitchenId, principal.identityId(), "DATE_OVERRIDE_DELETED", oldState, null);
        }
    }

    public KitchenDateOverrideResponse getMyDateOverride(
        CravesPrincipal principal,
        LocalDate serviceDate
    ) {
        UUID kitchenId = requireChefKitchen(principal);
        return readOverride(kitchenId, serviceDate);
    }

    public KitchenAvailabilityResponse availability(UUID kitchenId, Instant evaluatedAt) {
        if (kitchenId == null) {
            throw ApiException.badRequest("KITCHEN_ID_REQUIRED", "kitchenId is required");
        }
        Instant effectiveAt = evaluatedAt == null ? Instant.now() : evaluatedAt;
        KitchenState kitchen = requireKitchen(kitchenId);
        ScheduleConfig config = readConfigOrDefault(kitchenId);
        ZoneId zoneId = safeZone(config.timezoneId());
        ZonedDateTime local = effectiveAt.atZone(zoneId);
        LocalDate localDate = local.toLocalDate();
        LocalTime localTime = local.toLocalTime();

        KitchenDateOverrideResponse override = readOverrideOrNull(kitchenId, localDate);
        boolean weeklyConfigured = hasWeeklySchedule(kitchenId);
        boolean scheduleConfigured = weeklyConfigured || override != null;
        boolean openBySchedule;
        if (override != null) {
            openBySchedule = !override.closed() && override.windows().stream()
                .anyMatch(window -> inside(localTime, window.opensAt(), window.closesAt()));
        } else if (!weeklyConfigured) {
            // Backward compatibility: existing kitchens without an explicit schedule
            // keep the same behavior they had before this module was introduced.
            openBySchedule = true;
        } else {
            int dayOfWeek = local.getDayOfWeek().getValue();
            openBySchedule = jdbcTemplate.queryForObject(
                "SELECT EXISTS (" +
                    "SELECT 1 FROM catalog_schema.kitchen_weekly_service_window " +
                    "WHERE kitchen_id = ? AND day_of_week = ? AND opens_at <= ? AND closes_at > ?" +
                    ")",
                Boolean.class,
                kitchenId,
                dayOfWeek,
                localTime,
                localTime
            );
        }

        boolean paused = config.pausedUntil() != null && config.pausedUntil().isAfter(effectiveAt);
        boolean availableNow = kitchen.active()
            && config.acceptingOrders()
            && !paused
            && openBySchedule;

        return new KitchenAvailabilityResponse(
            kitchenId,
            effectiveAt,
            zoneId.getId(),
            localDate,
            localTime,
            kitchen.active(),
            scheduleConfigured,
            config.acceptingOrders(),
            paused,
            openBySchedule,
            availableNow
        );
    }

    private KitchenScheduleResponse readSchedule(UUID kitchenId) {
        ScheduleConfig config = readConfigOrDefault(kitchenId);
        List<ServiceWindowResponse> windows = jdbcTemplate.query(
            "SELECT id, day_of_week, opens_at, closes_at " +
                "FROM catalog_schema.kitchen_weekly_service_window " +
                "WHERE kitchen_id = ? ORDER BY day_of_week, opens_at, closes_at, id",
            this::mapWeeklyWindow,
            kitchenId
        );
        return new KitchenScheduleResponse(
            kitchenId,
            config.timezoneId(),
            config.acceptingOrders(),
            config.pausedUntil(),
            config.pauseReason(),
            windows
        );
    }

    private KitchenDateOverrideResponse readOverride(UUID kitchenId, LocalDate serviceDate) {
        KitchenDateOverrideResponse response = readOverrideOrNull(kitchenId, serviceDate);
        if (response == null) {
            throw ApiException.notFound("SCHEDULE_OVERRIDE_NOT_FOUND", "Kitchen schedule override was not found");
        }
        return response;
    }

    private KitchenDateOverrideResponse readOverrideOrNull(UUID kitchenId, LocalDate serviceDate) {
        List<OverrideHeader> headers = jdbcTemplate.query(
            "SELECT closed, reason FROM catalog_schema.kitchen_schedule_date_override " +
                "WHERE kitchen_id = ? AND service_date = ?",
            (rs, rowNum) -> new OverrideHeader(rs.getBoolean("closed"), rs.getString("reason")),
            kitchenId,
            serviceDate
        );
        if (headers.isEmpty()) {
            return null;
        }
        List<DateWindowResponse> windows = jdbcTemplate.query(
            "SELECT id, opens_at, closes_at FROM catalog_schema.kitchen_schedule_override_window " +
                "WHERE kitchen_id = ? AND service_date = ? ORDER BY opens_at, closes_at, id",
            (rs, rowNum) -> new DateWindowResponse(
                rs.getObject("id", UUID.class),
                rs.getObject("opens_at", LocalTime.class),
                rs.getObject("closes_at", LocalTime.class)
            ),
            kitchenId,
            serviceDate
        );
        OverrideHeader header = headers.getFirst();
        return new KitchenDateOverrideResponse(
            kitchenId,
            serviceDate,
            header.closed(),
            header.reason(),
            windows
        );
    }

    private ScheduleConfig readConfigOrDefault(UUID kitchenId) {
        List<ScheduleConfig> rows = jdbcTemplate.query(
            "SELECT timezone_id, accepting_orders, paused_until, pause_reason " +
                "FROM catalog_schema.kitchen_schedule_config WHERE kitchen_id = ?",
            (rs, rowNum) -> new ScheduleConfig(
                rs.getString("timezone_id"),
                rs.getBoolean("accepting_orders"),
                instantOrNull(rs, "paused_until"),
                rs.getString("pause_reason")
            ),
            kitchenId
        );
        return rows.isEmpty()
            ? new ScheduleConfig(HYDERABAD_TIMEZONE, true, null, null)
            : rows.getFirst();
    }

    private void ensureConfig(UUID kitchenId) {
        jdbcTemplate.update(
            "INSERT INTO catalog_schema.kitchen_schedule_config " +
                "(kitchen_id, timezone_id, accepting_orders, created_at, updated_at) " +
                "VALUES (?, ?, true, now(), now()) ON CONFLICT (kitchen_id) DO NOTHING",
            kitchenId,
            HYDERABAD_TIMEZONE
        );
    }

    private UUID requireChefKitchen(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CHEF")) {
            throw ApiException.forbidden("CHEF_ROLE_REQUIRED", "Chef role is required");
        }
        List<UUID> ids = jdbcTemplate.query(
            "SELECT id FROM catalog_schema.kitchen_profile WHERE identity_id = ?",
            (rs, rowNum) -> rs.getObject("id", UUID.class),
            principal.identityId()
        );
        if (ids.isEmpty()) {
            throw ApiException.notFound("KITCHEN_NOT_FOUND", "Chef kitchen profile was not found");
        }
        return ids.getFirst();
    }

    private KitchenState requireKitchen(UUID kitchenId) {
        List<KitchenState> rows = jdbcTemplate.query(
            "SELECT status FROM catalog_schema.kitchen_profile WHERE id = ?",
            (rs, rowNum) -> new KitchenState("ACTIVE".equalsIgnoreCase(rs.getString("status"))),
            kitchenId
        );
        if (rows.isEmpty()) {
            throw ApiException.notFound("KITCHEN_NOT_FOUND", "Kitchen was not found");
        }
        return rows.getFirst();
    }

    private boolean hasWeeklySchedule(UUID kitchenId) {
        Boolean exists = jdbcTemplate.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM catalog_schema.kitchen_weekly_service_window WHERE kitchen_id = ?)",
            Boolean.class,
            kitchenId
        );
        return Boolean.TRUE.equals(exists);
    }

    private void validateScheduleRequest(KitchenScheduleUpdateRequest request) {
        if (request == null) {
            throw ApiException.badRequest("SCHEDULE_REQUIRED", "Schedule request is required");
        }
        if (request.acceptingOrders() == null) {
            throw ApiException.badRequest("ACCEPTING_ORDERS_REQUIRED", "acceptingOrders must be true or false");
        }
        if (request.weeklyWindows() == null) {
            throw ApiException.badRequest("WEEKLY_WINDOWS_REQUIRED", "weeklyWindows must be supplied; use an empty list to clear the weekly schedule");
        }
        if (request.weeklyWindows().size() > MAX_WEEKLY_WINDOWS) {
            throw ApiException.badRequest("TOO_MANY_WEEKLY_WINDOWS", "weeklyWindows exceeds the technical limit");
        }
        validateReason(request.pauseReason());
        List<ServiceWindowRequest> sorted = sortedWeeklyWindows(request.weeklyWindows());
        for (ServiceWindowRequest window : sorted) {
            validateWeeklyWindow(window);
        }
        rejectWeeklyOverlaps(sorted);
    }

    private void validateOverrideRequest(KitchenDateOverrideRequest request) {
        if (request == null) {
            throw ApiException.badRequest("SCHEDULE_OVERRIDE_REQUIRED", "Schedule override request is required");
        }
        validateReason(request.reason());
        List<DateWindowRequest> windows = request.windows() == null ? List.of() : request.windows();
        if (windows.size() > MAX_WINDOWS_PER_OVERRIDE) {
            throw ApiException.badRequest("TOO_MANY_OVERRIDE_WINDOWS", "Date override windows exceed the technical limit");
        }
        if (request.closed() && !windows.isEmpty()) {
            throw ApiException.badRequest("CLOSED_OVERRIDE_HAS_WINDOWS", "A closed date override cannot contain service windows");
        }
        if (!request.closed() && windows.isEmpty()) {
            throw ApiException.badRequest("OPEN_OVERRIDE_REQUIRES_WINDOWS", "An open date override requires at least one service window");
        }
        List<DateWindowRequest> sorted = sortedDateWindows(windows);
        for (DateWindowRequest window : sorted) {
            validateDateWindow(window);
        }
        rejectDateOverlaps(sorted);
    }

    private static void validateWeeklyWindow(ServiceWindowRequest window) {
        if (window == null) {
            throw ApiException.badRequest("INVALID_SERVICE_WINDOW", "Weekly service window cannot be null");
        }
        if (window.dayOfWeek() < 1 || window.dayOfWeek() > 7) {
            throw ApiException.badRequest("INVALID_DAY_OF_WEEK", "dayOfWeek must use ISO values 1 through 7");
        }
        validateWindowTimes(window.opensAt(), window.closesAt());
    }

    private static void validateDateWindow(DateWindowRequest window) {
        if (window == null) {
            throw ApiException.badRequest("INVALID_SERVICE_WINDOW", "Date service window cannot be null");
        }
        validateWindowTimes(window.opensAt(), window.closesAt());
    }

    private static void validateWindowTimes(LocalTime opensAt, LocalTime closesAt) {
        if (opensAt == null || closesAt == null) {
            throw ApiException.badRequest("SERVICE_WINDOW_TIME_REQUIRED", "opensAt and closesAt are required");
        }
        if (!opensAt.isBefore(closesAt)) {
            throw ApiException.badRequest("INVALID_SERVICE_WINDOW", "opensAt must be earlier than closesAt on the same local day");
        }
    }

    private static void rejectWeeklyOverlaps(List<ServiceWindowRequest> windows) {
        for (int i = 1; i < windows.size(); i++) {
            ServiceWindowRequest previous = windows.get(i - 1);
            ServiceWindowRequest current = windows.get(i);
            if (previous.dayOfWeek() == current.dayOfWeek()
                && current.opensAt().isBefore(previous.closesAt())) {
                throw ApiException.badRequest("OVERLAPPING_SERVICE_WINDOWS", "Weekly service windows cannot overlap");
            }
        }
    }

    private static void rejectDateOverlaps(List<DateWindowRequest> windows) {
        for (int i = 1; i < windows.size(); i++) {
            DateWindowRequest previous = windows.get(i - 1);
            DateWindowRequest current = windows.get(i);
            if (current.opensAt().isBefore(previous.closesAt())) {
                throw ApiException.badRequest("OVERLAPPING_SERVICE_WINDOWS", "Date override windows cannot overlap");
            }
        }
    }

    private static List<ServiceWindowRequest> sortedWeeklyWindows(List<ServiceWindowRequest> windows) {
        List<ServiceWindowRequest> sorted = new ArrayList<>(windows == null ? List.of() : windows);
        sorted.sort(Comparator
            .comparingInt(ServiceWindowRequest::dayOfWeek)
            .thenComparing(ServiceWindowRequest::opensAt, Comparator.nullsFirst(Comparator.naturalOrder()))
            .thenComparing(ServiceWindowRequest::closesAt, Comparator.nullsFirst(Comparator.naturalOrder())));
        return sorted;
    }

    private static List<DateWindowRequest> sortedDateWindows(List<DateWindowRequest> windows) {
        List<DateWindowRequest> sorted = new ArrayList<>(windows == null ? List.of() : windows);
        sorted.sort(Comparator
            .comparing(DateWindowRequest::opensAt, Comparator.nullsFirst(Comparator.naturalOrder()))
            .thenComparing(DateWindowRequest::closesAt, Comparator.nullsFirst(Comparator.naturalOrder())));
        return sorted;
    }

    private void validateReason(String reason) {
        if (reason != null && reason.trim().length() > MAX_REASON_LENGTH) {
            throw ApiException.badRequest("SCHEDULE_REASON_TOO_LONG", "Schedule reason must be 160 characters or fewer");
        }
    }

    private static String trimReason(String reason) {
        if (reason == null) {
            return null;
        }
        String trimmed = reason.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void audit(UUID kitchenId, UUID actor, String action, Object oldState, Object newState) {
        jdbcTemplate.update(
            "INSERT INTO catalog_schema.kitchen_schedule_audit " +
                "(id, kitchen_id, actor_identity_id, action, old_snapshot, new_snapshot, created_at) " +
                "VALUES (?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), now())",
            UUID.randomUUID(),
            kitchenId,
            actor,
            action,
            json(oldState),
            json(newState)
        );
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? java.util.Map.of() : value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Schedule audit snapshot could not be serialized", ex);
        }
    }

    private ServiceWindowResponse mapWeeklyWindow(ResultSet rs, int rowNum) throws SQLException {
        return new ServiceWindowResponse(
            rs.getObject("id", UUID.class),
            rs.getInt("day_of_week"),
            rs.getObject("opens_at", LocalTime.class),
            rs.getObject("closes_at", LocalTime.class)
        );
    }

    private static boolean inside(LocalTime value, LocalTime opensAt, LocalTime closesAt) {
        return !value.isBefore(opensAt) && value.isBefore(closesAt);
    }

    private static ZoneId safeZone(String timezoneId) {
        try {
            return ZoneId.of(timezoneId == null || timezoneId.isBlank() ? HYDERABAD_TIMEZONE : timezoneId);
        } catch (RuntimeException ex) {
            throw new IllegalStateException("Kitchen schedule timezone is invalid", ex);
        }
    }

    private static Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private static Instant instantOrNull(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record ScheduleConfig(
        String timezoneId,
        boolean acceptingOrders,
        Instant pausedUntil,
        String pauseReason
    ) {
    }

    private record OverrideHeader(boolean closed, String reason) {
    }

    private record KitchenState(boolean active) {
    }
}
