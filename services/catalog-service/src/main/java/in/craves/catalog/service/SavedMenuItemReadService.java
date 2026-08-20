package in.craves.catalog.service;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.web.SavedMenuItemDtos.ResolveSavedMenuItemsRequest;
import in.craves.catalog.web.SavedMenuItemDtos.ResolveSavedMenuItemsResponse;
import in.craves.catalog.web.SavedMenuItemDtos.SavedAvailabilityState;
import in.craves.catalog.web.SavedMenuItemDtos.SavedMenuItemResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SavedMenuItemReadService {
    static final int MAX_BATCH_SIZE = 100;
    static final int LOOKAHEAD_DAYS = 7;
    static final String DEFAULT_TIMEZONE = "Asia/Kolkata";

    private final NamedParameterJdbcTemplate jdbc;

    public SavedMenuItemReadService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ResolveSavedMenuItemsResponse resolve(ResolveSavedMenuItemsRequest request) {
        return resolveAt(request, Instant.now());
    }

    ResolveSavedMenuItemsResponse resolveAt(ResolveSavedMenuItemsRequest request, Instant evaluatedAt) {
        List<UUID> requestedIds = validateAndNormalize(request);
        Map<UUID, ItemRow> itemsById = loadItems(requestedIds);
        Set<UUID> kitchenIds = new LinkedHashSet<>();
        itemsById.values().stream()
            .map(ItemRow::kitchenId)
            .filter(id -> id != null)
            .forEach(kitchenIds::add);

        Map<UUID, List<ServiceWindow>> weeklyWindows = loadWeeklyWindows(kitchenIds);
        Map<OverrideKey, OverrideDay> overrides = loadOverrides(kitchenIds, evaluatedAt);

        List<SavedMenuItemResponse> responses = new ArrayList<>(requestedIds.size());
        for (UUID menuItemId : requestedIds) {
            ItemRow item = itemsById.get(menuItemId);
            responses.add(item == null
                ? missing(menuItemId, evaluatedAt)
                : mapItem(item, evaluatedAt, weeklyWindows, overrides));
        }
        return new ResolveSavedMenuItemsResponse(evaluatedAt, List.copyOf(responses));
    }

    private List<UUID> validateAndNormalize(ResolveSavedMenuItemsRequest request) {
        if (request == null || request.menuItemIds() == null || request.menuItemIds().isEmpty()) {
            throw ApiException.badRequest("MENU_ITEM_IDS_REQUIRED", "At least one saved menu item id is required");
        }
        if (request.menuItemIds().size() > MAX_BATCH_SIZE) {
            throw ApiException.badRequest(
                "TOO_MANY_MENU_ITEMS",
                "At most " + MAX_BATCH_SIZE + " saved menu items can be resolved at once"
            );
        }
        LinkedHashSet<UUID> unique = new LinkedHashSet<>();
        for (UUID menuItemId : request.menuItemIds()) {
            if (menuItemId == null) {
                throw ApiException.badRequest("MENU_ITEM_ID_REQUIRED", "Saved menu item ids cannot contain null values");
            }
            unique.add(menuItemId);
        }
        return List.copyOf(unique);
    }

    private Map<UUID, ItemRow> loadItems(List<UUID> menuItemIds) {
        String sql = """
            SELECT mi.id,
                   mi.kitchen_id,
                   mi.item_name,
                   mi.description,
                   mi.category,
                   mi.food_type,
                   mi.price,
                   mi.currency,
                   mi.status AS item_status,
                   mi.is_available AS item_available,
                   kp.kitchen_name,
                   kp.display_name AS kitchen_display_name,
                   kp.status AS kitchen_status,
                   kp.area_name,
                   kp.city,
                   kp.state,
                   COALESCE(ksc.timezone_id, :defaultTimezone) AS timezone_id,
                   COALESCE(ksc.accepting_orders, true) AS accepting_orders,
                   ksc.paused_until,
                   (
                       SELECT mii.public_url
                         FROM catalog_schema.menu_item_image mii
                        WHERE mii.menu_item_id = mi.id
                          AND mii.public_url IS NOT NULL
                        ORDER BY mii.is_primary DESC, mii.sort_order ASC, mii.id ASC
                        LIMIT 1
                   ) AS primary_image_url
              FROM catalog_schema.menu_item mi
              LEFT JOIN catalog_schema.kitchen_profile kp ON kp.id = mi.kitchen_id
              LEFT JOIN catalog_schema.kitchen_schedule_config ksc ON ksc.kitchen_id = kp.id
             WHERE mi.id IN (:ids)
            """;

        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("ids", menuItemIds)
            .addValue("defaultTimezone", DEFAULT_TIMEZONE);
        Map<UUID, ItemRow> rows = new LinkedHashMap<>();
        jdbc.query(sql, parameters, rs -> {
            ItemRow row = mapItemRow(rs);
            rows.put(row.menuItemId(), row);
        });
        return rows;
    }

    private Map<UUID, List<ServiceWindow>> loadWeeklyWindows(Set<UUID> kitchenIds) {
        if (kitchenIds.isEmpty()) {
            return Map.of();
        }
        String sql = """
            SELECT kitchen_id, day_of_week, opens_at, closes_at
              FROM catalog_schema.kitchen_weekly_service_window
             WHERE kitchen_id IN (:kitchenIds)
             ORDER BY kitchen_id, day_of_week, opens_at, closes_at, id
            """;
        Map<UUID, List<ServiceWindow>> result = new HashMap<>();
        jdbc.query(
            sql,
            new MapSqlParameterSource("kitchenIds", kitchenIds),
            rs -> result.computeIfAbsent(rs.getObject("kitchen_id", UUID.class), ignored -> new ArrayList<>())
                .add(new ServiceWindow(
                    rs.getInt("day_of_week"),
                    rs.getObject("opens_at", LocalTime.class),
                    rs.getObject("closes_at", LocalTime.class)
                ))
        );
        return result;
    }

    private Map<OverrideKey, OverrideDay> loadOverrides(Set<UUID> kitchenIds, Instant evaluatedAt) {
        if (kitchenIds.isEmpty()) {
            return Map.of();
        }
        LocalDate utcDate = evaluatedAt.atZone(ZoneOffset.UTC).toLocalDate();
        LocalDate startDate = utcDate.minusDays(1);
        LocalDate endDate = utcDate.plusDays(LOOKAHEAD_DAYS + 1L);
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("kitchenIds", kitchenIds)
            .addValue("startDate", startDate)
            .addValue("endDate", endDate);

        Map<OverrideKey, MutableOverrideDay> mutable = new HashMap<>();
        jdbc.query(
            """
                SELECT kitchen_id, service_date, closed
                  FROM catalog_schema.kitchen_schedule_date_override
                 WHERE kitchen_id IN (:kitchenIds)
                   AND service_date BETWEEN :startDate AND :endDate
                """,
            parameters,
            rs -> {
                OverrideKey key = new OverrideKey(
                    rs.getObject("kitchen_id", UUID.class),
                    rs.getObject("service_date", LocalDate.class)
                );
                mutable.put(key, new MutableOverrideDay(rs.getBoolean("closed")));
            }
        );

        if (!mutable.isEmpty()) {
            jdbc.query(
                """
                    SELECT kitchen_id, service_date, opens_at, closes_at
                      FROM catalog_schema.kitchen_schedule_override_window
                     WHERE kitchen_id IN (:kitchenIds)
                       AND service_date BETWEEN :startDate AND :endDate
                     ORDER BY kitchen_id, service_date, opens_at, closes_at, id
                    """,
                parameters,
                rs -> {
                    OverrideKey key = new OverrideKey(
                        rs.getObject("kitchen_id", UUID.class),
                        rs.getObject("service_date", LocalDate.class)
                    );
                    MutableOverrideDay day = mutable.get(key);
                    if (day != null) {
                        day.windows().add(new ServiceWindow(
                            0,
                            rs.getObject("opens_at", LocalTime.class),
                            rs.getObject("closes_at", LocalTime.class)
                        ));
                    }
                }
            );
        }

        Map<OverrideKey, OverrideDay> result = new HashMap<>();
        mutable.forEach((key, day) -> result.put(
            key,
            new OverrideDay(day.closed(), List.copyOf(day.windows()))
        ));
        return result;
    }

    private SavedMenuItemResponse mapItem(
        ItemRow item,
        Instant evaluatedAt,
        Map<UUID, List<ServiceWindow>> weeklyWindows,
        Map<OverrideKey, OverrideDay> overrides
    ) {
        boolean kitchenActive = "ACTIVE".equalsIgnoreCase(item.kitchenStatus());
        boolean itemActive = "ACTIVE".equalsIgnoreCase(item.itemStatus());
        KitchenScheduleEvaluation schedule = evaluateKitchenSchedule(item, evaluatedAt, weeklyWindows, overrides);

        SavedAvailabilityState state;
        if (!itemActive) {
            state = SavedAvailabilityState.RETIRED;
        } else if (!kitchenActive) {
            state = SavedAvailabilityState.KITCHEN_INACTIVE;
        } else if (!item.itemAvailable()) {
            state = SavedAvailabilityState.ITEM_UNAVAILABLE;
        } else if (!item.acceptingOrders()) {
            state = SavedAvailabilityState.KITCHEN_NOT_ACCEPTING;
        } else if (schedule.paused()) {
            state = SavedAvailabilityState.PAUSED;
        } else if (schedule.availableNow()) {
            state = SavedAvailabilityState.AVAILABLE_NOW;
        } else if (schedule.nextAvailabilityAt() != null
            && sameLocalDate(evaluatedAt, schedule.nextAvailabilityAt(), item.timezoneId())) {
            state = SavedAvailabilityState.COOKING_LATER_TODAY;
        } else {
            state = SavedAvailabilityState.NOT_TODAY;
        }

        boolean sellableNow = itemActive
            && kitchenActive
            && item.itemAvailable()
            && schedule.availableNow();

        return new SavedMenuItemResponse(
            item.menuItemId(),
            true,
            state,
            evaluatedAt,
            item.itemName(),
            item.description(),
            item.category(),
            item.foodType(),
            item.price(),
            item.currency(),
            item.itemStatus(),
            item.itemAvailable(),
            item.kitchenId(),
            item.kitchenName(),
            item.kitchenDisplayName(),
            item.kitchenStatus(),
            item.areaName(),
            item.city(),
            item.state(),
            item.primaryImageUrl(),
            safeZone(item.timezoneId()).getId(),
            schedule.scheduleConfigured(),
            item.acceptingOrders(),
            schedule.paused(),
            sellableNow,
            sellableNow ? null : schedule.nextAvailabilityAt()
        );
    }

    private KitchenScheduleEvaluation evaluateKitchenSchedule(
        ItemRow item,
        Instant evaluatedAt,
        Map<UUID, List<ServiceWindow>> weeklyWindows,
        Map<OverrideKey, OverrideDay> overrides
    ) {
        ZoneId zone = safeZone(item.timezoneId());
        boolean kitchenActive = "ACTIVE".equalsIgnoreCase(item.kitchenStatus());
        boolean paused = item.pausedUntil() != null && item.pausedUntil().isAfter(evaluatedAt);
        boolean weeklyConfigured = !weeklyWindows.getOrDefault(item.kitchenId(), List.of()).isEmpty();
        LocalDate localDate = evaluatedAt.atZone(zone).toLocalDate();
        boolean scheduleConfigured = weeklyConfigured
            || overrides.containsKey(new OverrideKey(item.kitchenId(), localDate));

        boolean openBySchedule = isOpenBySchedule(
            item.kitchenId(),
            evaluatedAt,
            zone,
            weeklyConfigured,
            weeklyWindows,
            overrides
        );
        boolean availableNow = kitchenActive
            && item.acceptingOrders()
            && !paused
            && openBySchedule;

        Instant next = availableNow || !kitchenActive || !item.acceptingOrders()
            ? null
            : findNextAvailability(
                item.kitchenId(),
                evaluatedAt,
                item.pausedUntil(),
                zone,
                weeklyConfigured,
                weeklyWindows,
                overrides
            );
        return new KitchenScheduleEvaluation(scheduleConfigured, paused, availableNow, next);
    }

    private boolean isOpenBySchedule(
        UUID kitchenId,
        Instant evaluatedAt,
        ZoneId zone,
        boolean weeklyConfigured,
        Map<UUID, List<ServiceWindow>> weeklyWindows,
        Map<OverrideKey, OverrideDay> overrides
    ) {
        ZonedDateTime local = evaluatedAt.atZone(zone);
        LocalDate date = local.toLocalDate();
        LocalTime time = local.toLocalTime();
        OverrideDay override = overrides.get(new OverrideKey(kitchenId, date));
        if (override != null) {
            return !override.closed() && override.windows().stream().anyMatch(window -> inside(time, window));
        }
        if (!weeklyConfigured) {
            return true;
        }
        int dayOfWeek = local.getDayOfWeek().getValue();
        return weeklyWindows.getOrDefault(kitchenId, List.of()).stream()
            .filter(window -> window.dayOfWeek() == dayOfWeek)
            .anyMatch(window -> inside(time, window));
    }

    private Instant findNextAvailability(
        UUID kitchenId,
        Instant evaluatedAt,
        Instant pausedUntil,
        ZoneId zone,
        boolean weeklyConfigured,
        Map<UUID, List<ServiceWindow>> weeklyWindows,
        Map<OverrideKey, OverrideDay> overrides
    ) {
        Instant searchFrom = pausedUntil != null && pausedUntil.isAfter(evaluatedAt)
            ? pausedUntil
            : evaluatedAt;
        LocalDate firstDate = searchFrom.atZone(zone).toLocalDate();
        Instant hardStop = evaluatedAt.plusSeconds((LOOKAHEAD_DAYS + 1L) * 24L * 60L * 60L);

        for (int offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
            LocalDate date = firstDate.plusDays(offset);
            OverrideDay override = overrides.get(new OverrideKey(kitchenId, date));
            if (override != null && override.closed()) {
                continue;
            }

            if (override == null && !weeklyConfigured) {
                Instant dayStart = date.atStartOfDay(zone).toInstant();
                Instant dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant();
                Instant candidate = searchFrom.isAfter(dayStart) ? searchFrom : dayStart;
                if (candidate.isBefore(dayEnd) && !candidate.isAfter(hardStop)) {
                    return candidate;
                }
                continue;
            }

            List<ServiceWindow> windows;
            if (override != null) {
                windows = override.windows();
            } else {
                int dayOfWeek = date.getDayOfWeek().getValue();
                windows = weeklyWindows.getOrDefault(kitchenId, List.of()).stream()
                    .filter(window -> window.dayOfWeek() == dayOfWeek)
                    .toList();
            }

            for (ServiceWindow window : windows) {
                Instant opensAt = date.atTime(window.opensAt()).atZone(zone).toInstant();
                Instant closesAt = date.atTime(window.closesAt()).atZone(zone).toInstant();
                if (!closesAt.isAfter(searchFrom)) {
                    continue;
                }
                Instant candidate = searchFrom.isAfter(opensAt) ? searchFrom : opensAt;
                if (candidate.isBefore(closesAt) && !candidate.isAfter(hardStop)) {
                    return candidate;
                }
            }
        }
        return null;
    }

    private static boolean inside(LocalTime time, ServiceWindow window) {
        return !time.isBefore(window.opensAt()) && time.isBefore(window.closesAt());
    }

    private static boolean sameLocalDate(Instant left, Instant right, String timezoneId) {
        ZoneId zone = safeZone(timezoneId);
        return left.atZone(zone).toLocalDate().equals(right.atZone(zone).toLocalDate());
    }

    private static ZoneId safeZone(String timezoneId) {
        try {
            return ZoneId.of(timezoneId == null || timezoneId.isBlank() ? DEFAULT_TIMEZONE : timezoneId);
        } catch (RuntimeException ignored) {
            return ZoneId.of(DEFAULT_TIMEZONE);
        }
    }

    private static SavedMenuItemResponse missing(UUID menuItemId, Instant evaluatedAt) {
        return new SavedMenuItemResponse(
            menuItemId,
            false,
            SavedAvailabilityState.MISSING,
            evaluatedAt,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            false,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            DEFAULT_TIMEZONE,
            false,
            false,
            false,
            false,
            null
        );
    }

    private static ItemRow mapItemRow(ResultSet rs) throws SQLException {
        return new ItemRow(
            rs.getObject("id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getString("item_name"),
            rs.getString("description"),
            rs.getString("category"),
            rs.getString("food_type"),
            rs.getBigDecimal("price"),
            rs.getString("currency"),
            rs.getString("item_status"),
            rs.getBoolean("item_available"),
            rs.getString("kitchen_name"),
            rs.getString("kitchen_display_name"),
            rs.getString("kitchen_status"),
            rs.getString("area_name"),
            rs.getString("city"),
            rs.getString("state"),
            rs.getString("primary_image_url"),
            rs.getString("timezone_id"),
            rs.getBoolean("accepting_orders"),
            instantOrNull(rs, "paused_until")
        );
    }

    private static Instant instantOrNull(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record ItemRow(
        UUID menuItemId,
        UUID kitchenId,
        String itemName,
        String description,
        String category,
        String foodType,
        java.math.BigDecimal price,
        String currency,
        String itemStatus,
        boolean itemAvailable,
        String kitchenName,
        String kitchenDisplayName,
        String kitchenStatus,
        String areaName,
        String city,
        String state,
        String primaryImageUrl,
        String timezoneId,
        boolean acceptingOrders,
        Instant pausedUntil
    ) {
    }

    private record ServiceWindow(int dayOfWeek, LocalTime opensAt, LocalTime closesAt) {
    }

    private record OverrideKey(UUID kitchenId, LocalDate serviceDate) {
    }

    private record OverrideDay(boolean closed, List<ServiceWindow> windows) {
    }

    private static final class MutableOverrideDay {
        private final boolean closed;
        private final List<ServiceWindow> windows = new ArrayList<>();

        private MutableOverrideDay(boolean closed) {
            this.closed = closed;
        }

        boolean closed() {
            return closed;
        }

        List<ServiceWindow> windows() {
            return windows;
        }
    }

    private record KitchenScheduleEvaluation(
        boolean scheduleConfigured,
        boolean paused,
        boolean availableNow,
        Instant nextAvailabilityAt
    ) {
    }
}
