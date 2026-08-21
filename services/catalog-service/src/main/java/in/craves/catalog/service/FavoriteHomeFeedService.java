package in.craves.catalog.service;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.web.FavoriteHomeFeedDtos.FavoriteCookingState;
import in.craves.catalog.web.FavoriteHomeFeedDtos.FavoriteHomeCard;
import in.craves.catalog.web.FavoriteHomeFeedDtos.FavoriteMenuPreview;
import in.craves.catalog.web.FavoriteHomeFeedDtos.RequestedFavoriteType;
import in.craves.catalog.web.FavoriteHomeFeedDtos.ResolveFavoriteHomeRequest;
import in.craves.catalog.web.FavoriteHomeFeedDtos.ResolveFavoriteHomeResponse;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class FavoriteHomeFeedService {
    static final int MAX_RELATIONSHIPS_PER_REQUEST = 100;
    static final int MAX_PREVIEW_ITEMS_PER_KITCHEN = 3;
    static final int LOOKAHEAD_DAYS = 7;
    static final String DEFAULT_TIMEZONE = "Asia/Kolkata";

    private final NamedParameterJdbcTemplate jdbc;

    public FavoriteHomeFeedService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ResolveFavoriteHomeResponse resolve(ResolveFavoriteHomeRequest request) {
        return resolveAt(request, Instant.now());
    }

    ResolveFavoriteHomeResponse resolveAt(ResolveFavoriteHomeRequest request, Instant evaluatedAt) {
        List<RequestEntry> requests = validateAndNormalize(request);
        Set<UUID> chefIds = new LinkedHashSet<>();
        Set<UUID> kitchenIds = new LinkedHashSet<>();
        for (RequestEntry entry : requests) {
            if (entry.type() == RequestedFavoriteType.CHEF) {
                chefIds.add(entry.id());
            } else {
                kitchenIds.add(entry.id());
            }
        }

        List<KitchenRow> kitchens = loadKitchens(chefIds, kitchenIds);
        Map<UUID, KitchenRow> byKitchenId = new HashMap<>();
        Map<UUID, KitchenRow> byChefIdentityId = new HashMap<>();
        for (KitchenRow kitchen : kitchens) {
            byKitchenId.put(kitchen.kitchenId(), kitchen);
            byChefIdentityId.put(kitchen.chefIdentityId(), kitchen);
        }

        Set<UUID> resolvedKitchenIds = new LinkedHashSet<>(byKitchenId.keySet());
        Map<UUID, Integer> activeDishCounts = loadActiveDishCounts(resolvedKitchenIds);
        Map<UUID, List<FavoriteMenuPreview>> previews = loadMenuPreviews(resolvedKitchenIds);
        Map<UUID, List<ServiceWindow>> weeklyWindows = loadWeeklyWindows(resolvedKitchenIds);
        Map<OverrideKey, OverrideDay> overrides = loadOverrides(resolvedKitchenIds, evaluatedAt);

        List<FavoriteHomeCard> cards = new ArrayList<>(requests.size());
        for (RequestEntry requestEntry : requests) {
            KitchenRow kitchen = requestEntry.type() == RequestedFavoriteType.CHEF
                ? byChefIdentityId.get(requestEntry.id())
                : byKitchenId.get(requestEntry.id());
            if (kitchen == null) {
                cards.add(missing(requestEntry, evaluatedAt));
                continue;
            }
            cards.add(toCard(
                requestEntry,
                kitchen,
                activeDishCounts.getOrDefault(kitchen.kitchenId(), 0),
                previews.getOrDefault(kitchen.kitchenId(), List.of()),
                weeklyWindows,
                overrides,
                evaluatedAt
            ));
        }

        return new ResolveFavoriteHomeResponse(evaluatedAt, List.copyOf(cards));
    }

    private List<RequestEntry> validateAndNormalize(ResolveFavoriteHomeRequest request) {
        if (request == null) {
            throw ApiException.badRequest("FAVORITE_RELATIONSHIPS_REQUIRED", "Favorite relationship ids are required");
        }
        List<UUID> chefIds = request.chefIdentityIds() == null ? List.of() : request.chefIdentityIds();
        List<UUID> kitchenIds = request.kitchenIds() == null ? List.of() : request.kitchenIds();
        if (chefIds.isEmpty() && kitchenIds.isEmpty()) {
            throw ApiException.badRequest("FAVORITE_RELATIONSHIPS_REQUIRED", "At least one favorite chef or kitchen id is required");
        }
        if (chefIds.size() + kitchenIds.size() > MAX_RELATIONSHIPS_PER_REQUEST) {
            throw ApiException.badRequest(
                "TOO_MANY_FAVORITE_RELATIONSHIPS",
                "At most " + MAX_RELATIONSHIPS_PER_REQUEST + " favorite relationships can be resolved at once"
            );
        }

        LinkedHashSet<UUID> uniqueChefs = normalizeIds(chefIds, "CHEF_ID_REQUIRED");
        LinkedHashSet<UUID> uniqueKitchens = normalizeIds(kitchenIds, "KITCHEN_ID_REQUIRED");
        List<RequestEntry> entries = new ArrayList<>(uniqueChefs.size() + uniqueKitchens.size());
        uniqueChefs.forEach(id -> entries.add(new RequestEntry(RequestedFavoriteType.CHEF, id)));
        uniqueKitchens.forEach(id -> entries.add(new RequestEntry(RequestedFavoriteType.KITCHEN, id)));
        return List.copyOf(entries);
    }

    private static LinkedHashSet<UUID> normalizeIds(List<UUID> ids, String code) {
        LinkedHashSet<UUID> unique = new LinkedHashSet<>();
        for (UUID id : ids) {
            if (id == null) {
                throw ApiException.badRequest(code, "Favorite relationship ids cannot contain null values");
            }
            unique.add(id);
        }
        return unique;
    }

    private List<KitchenRow> loadKitchens(Set<UUID> chefIds, Set<UUID> kitchenIds) {
        List<String> predicates = new ArrayList<>();
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("defaultTimezone", DEFAULT_TIMEZONE);
        if (!chefIds.isEmpty()) {
            predicates.add("kp.identity_id IN (:chefIds)");
            parameters.addValue("chefIds", chefIds);
        }
        if (!kitchenIds.isEmpty()) {
            predicates.add("kp.id IN (:kitchenIds)");
            parameters.addValue("kitchenIds", kitchenIds);
        }
        String sql = """
            SELECT kp.id,
                   kp.identity_id,
                   kp.kitchen_name,
                   kp.display_name,
                   kp.status,
                   kp.area_name,
                   kp.city,
                   kp.state,
                   COALESCE(ksc.timezone_id, :defaultTimezone) AS timezone_id,
                   COALESCE(ksc.accepting_orders, true) AS accepting_orders,
                   ksc.paused_until
              FROM catalog_schema.kitchen_profile kp
              LEFT JOIN catalog_schema.kitchen_schedule_config ksc ON ksc.kitchen_id = kp.id
             WHERE %s
            """.formatted(String.join(" OR ", predicates));
        return jdbc.query(sql, parameters, (rs, rowNum) -> new KitchenRow(
            rs.getObject("id", UUID.class),
            rs.getObject("identity_id", UUID.class),
            rs.getString("kitchen_name"),
            rs.getString("display_name"),
            rs.getString("status"),
            rs.getString("area_name"),
            rs.getString("city"),
            rs.getString("state"),
            rs.getString("timezone_id"),
            rs.getBoolean("accepting_orders"),
            instantOrNull(rs.getTimestamp("paused_until"))
        ));
    }

    private Map<UUID, Integer> loadActiveDishCounts(Set<UUID> kitchenIds) {
        if (kitchenIds.isEmpty()) return Map.of();
        List<CountRow> rows = jdbc.query(
            """
                SELECT kitchen_id, COUNT(*) AS dish_count
                  FROM catalog_schema.menu_item
                 WHERE kitchen_id IN (:kitchenIds)
                   AND status = 'ACTIVE'
                   AND is_available = true
                 GROUP BY kitchen_id
                """,
            new MapSqlParameterSource("kitchenIds", kitchenIds),
            (rs, rowNum) -> new CountRow(
                rs.getObject("kitchen_id", UUID.class),
                rs.getInt("dish_count")
            )
        );
        Map<UUID, Integer> result = new HashMap<>();
        rows.forEach(row -> result.put(row.kitchenId(), row.count()));
        return result;
    }

    private Map<UUID, List<FavoriteMenuPreview>> loadMenuPreviews(Set<UUID> kitchenIds) {
        if (kitchenIds.isEmpty()) return Map.of();
        List<PreviewRow> rows = jdbc.query(
            """
                WITH ranked AS (
                    SELECT mi.kitchen_id,
                           mi.id,
                           mi.item_name,
                           mi.category,
                           mi.food_type,
                           mi.price,
                           mi.currency,
                           (
                               SELECT mii.public_url
                                 FROM catalog_schema.menu_item_image mii
                                WHERE mii.menu_item_id = mi.id
                                  AND mii.public_url IS NOT NULL
                                ORDER BY mii.is_primary DESC, mii.sort_order ASC, mii.id ASC
                                LIMIT 1
                           ) AS image_url,
                           ROW_NUMBER() OVER (
                               PARTITION BY mi.kitchen_id
                               ORDER BY mi.updated_at DESC, mi.id ASC
                           ) AS rn
                      FROM catalog_schema.menu_item mi
                     WHERE mi.kitchen_id IN (:kitchenIds)
                       AND mi.status = 'ACTIVE'
                       AND mi.is_available = true
                )
                SELECT kitchen_id, id, item_name, category, food_type, price, currency, image_url
                  FROM ranked
                 WHERE rn <= :previewLimit
                 ORDER BY kitchen_id, rn
                """,
            new MapSqlParameterSource()
                .addValue("kitchenIds", kitchenIds)
                .addValue("previewLimit", MAX_PREVIEW_ITEMS_PER_KITCHEN),
            (rs, rowNum) -> new PreviewRow(
                rs.getObject("kitchen_id", UUID.class),
                new FavoriteMenuPreview(
                    rs.getObject("id", UUID.class),
                    rs.getString("item_name"),
                    rs.getString("category"),
                    rs.getString("food_type"),
                    rs.getBigDecimal("price"),
                    rs.getString("currency"),
                    rs.getString("image_url")
                )
            )
        );
        Map<UUID, List<FavoriteMenuPreview>> result = new HashMap<>();
        for (PreviewRow row : rows) {
            result.computeIfAbsent(row.kitchenId(), ignored -> new ArrayList<>()).add(row.preview());
        }
        result.replaceAll((ignored, values) -> List.copyOf(values));
        return result;
    }

    private Map<UUID, List<ServiceWindow>> loadWeeklyWindows(Set<UUID> kitchenIds) {
        if (kitchenIds.isEmpty()) return Map.of();
        List<WeeklyRow> rows = jdbc.query(
            """
                SELECT kitchen_id, day_of_week, opens_at, closes_at
                  FROM catalog_schema.kitchen_weekly_service_window
                 WHERE kitchen_id IN (:kitchenIds)
                 ORDER BY kitchen_id, day_of_week, opens_at, closes_at, id
                """,
            new MapSqlParameterSource("kitchenIds", kitchenIds),
            (rs, rowNum) -> new WeeklyRow(
                rs.getObject("kitchen_id", UUID.class),
                new ServiceWindow(
                    rs.getInt("day_of_week"),
                    rs.getObject("opens_at", LocalTime.class),
                    rs.getObject("closes_at", LocalTime.class)
                )
            )
        );
        Map<UUID, List<ServiceWindow>> result = new HashMap<>();
        for (WeeklyRow row : rows) {
            result.computeIfAbsent(row.kitchenId(), ignored -> new ArrayList<>()).add(row.window());
        }
        return result;
    }

    private Map<OverrideKey, OverrideDay> loadOverrides(Set<UUID> kitchenIds, Instant evaluatedAt) {
        if (kitchenIds.isEmpty()) return Map.of();
        LocalDate utcDate = evaluatedAt.atZone(ZoneOffset.UTC).toLocalDate();
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("kitchenIds", kitchenIds)
            .addValue("startDate", utcDate.minusDays(1))
            .addValue("endDate", utcDate.plusDays(LOOKAHEAD_DAYS + 1L));
        List<OverrideHeaderRow> headers = jdbc.query(
            """
                SELECT kitchen_id, service_date, closed
                  FROM catalog_schema.kitchen_schedule_date_override
                 WHERE kitchen_id IN (:kitchenIds)
                   AND service_date BETWEEN :startDate AND :endDate
                """,
            parameters,
            (rs, rowNum) -> new OverrideHeaderRow(
                new OverrideKey(
                    rs.getObject("kitchen_id", UUID.class),
                    rs.getObject("service_date", LocalDate.class)
                ),
                rs.getBoolean("closed")
            )
        );
        Map<OverrideKey, MutableOverrideDay> mutable = new HashMap<>();
        headers.forEach(row -> mutable.put(row.key(), new MutableOverrideDay(row.closed())));
        if (mutable.isEmpty()) return Map.of();

        List<OverrideWindowRow> windows = jdbc.query(
            """
                SELECT kitchen_id, service_date, opens_at, closes_at
                  FROM catalog_schema.kitchen_schedule_override_window
                 WHERE kitchen_id IN (:kitchenIds)
                   AND service_date BETWEEN :startDate AND :endDate
                 ORDER BY kitchen_id, service_date, opens_at, closes_at, id
                """,
            parameters,
            (rs, rowNum) -> new OverrideWindowRow(
                new OverrideKey(
                    rs.getObject("kitchen_id", UUID.class),
                    rs.getObject("service_date", LocalDate.class)
                ),
                new ServiceWindow(
                    0,
                    rs.getObject("opens_at", LocalTime.class),
                    rs.getObject("closes_at", LocalTime.class)
                )
            )
        );
        for (OverrideWindowRow row : windows) {
            MutableOverrideDay day = mutable.get(row.key());
            if (day != null) day.windows().add(row.window());
        }
        Map<OverrideKey, OverrideDay> result = new HashMap<>();
        mutable.forEach((key, value) -> result.put(key, new OverrideDay(value.closed(), List.copyOf(value.windows()))));
        return result;
    }

    private FavoriteHomeCard toCard(
        RequestEntry request,
        KitchenRow kitchen,
        int activeDishCount,
        List<FavoriteMenuPreview> previews,
        Map<UUID, List<ServiceWindow>> weeklyWindows,
        Map<OverrideKey, OverrideDay> overrides,
        Instant evaluatedAt
    ) {
        ScheduleEvaluation schedule = evaluateSchedule(kitchen, weeklyWindows, overrides, evaluatedAt);
        boolean active = "ACTIVE".equalsIgnoreCase(kitchen.status());
        FavoriteCookingState state;
        if (!active) {
            state = FavoriteCookingState.INACTIVE;
        } else if (!kitchen.acceptingOrders()) {
            state = FavoriteCookingState.NOT_ACCEPTING;
        } else if (schedule.paused()) {
            state = FavoriteCookingState.PAUSED;
        } else if (schedule.openNow()) {
            state = FavoriteCookingState.COOKING_NOW;
        } else if (schedule.nextAvailabilityAt() != null
            && sameLocalDate(evaluatedAt, schedule.nextAvailabilityAt(), kitchen.timezoneId())) {
            state = FavoriteCookingState.COOKING_LATER_TODAY;
        } else {
            state = FavoriteCookingState.NOT_TODAY;
        }
        Instant next = switch (state) {
            case COOKING_LATER_TODAY, NOT_TODAY, PAUSED -> schedule.nextAvailabilityAt();
            default -> null;
        };
        return new FavoriteHomeCard(
            request.type(),
            request.id(),
            true,
            kitchen.kitchenId(),
            kitchen.chefIdentityId(),
            kitchen.kitchenName(),
            kitchen.displayName(),
            kitchen.status(),
            kitchen.areaName(),
            kitchen.city(),
            kitchen.state(),
            activeDishCount,
            List.copyOf(previews),
            safeZone(kitchen.timezoneId()).getId(),
            schedule.scheduleConfigured(),
            kitchen.acceptingOrders(),
            schedule.paused(),
            state,
            next,
            evaluatedAt
        );
    }

    private ScheduleEvaluation evaluateSchedule(
        KitchenRow kitchen,
        Map<UUID, List<ServiceWindow>> weeklyWindows,
        Map<OverrideKey, OverrideDay> overrides,
        Instant evaluatedAt
    ) {
        ZoneId zone = safeZone(kitchen.timezoneId());
        LocalDate localDate = evaluatedAt.atZone(zone).toLocalDate();
        boolean weeklyConfigured = !weeklyWindows.getOrDefault(kitchen.kitchenId(), List.of()).isEmpty();
        boolean scheduleConfigured = weeklyConfigured || overrides.containsKey(new OverrideKey(kitchen.kitchenId(), localDate));
        boolean paused = kitchen.pausedUntil() != null && kitchen.pausedUntil().isAfter(evaluatedAt);
        boolean open = isOpenBySchedule(kitchen.kitchenId(), evaluatedAt, zone, weeklyConfigured, weeklyWindows, overrides);
        boolean active = "ACTIVE".equalsIgnoreCase(kitchen.status());
        boolean openNow = active && kitchen.acceptingOrders() && !paused && open;
        Instant next = openNow || !active || !kitchen.acceptingOrders()
            ? null
            : findNextAvailability(
                kitchen.kitchenId(),
                evaluatedAt,
                kitchen.pausedUntil(),
                zone,
                weeklyConfigured,
                weeklyWindows,
                overrides
            );
        return new ScheduleEvaluation(scheduleConfigured, paused, openNow, next);
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
        OverrideDay override = overrides.get(new OverrideKey(kitchenId, local.toLocalDate()));
        if (override != null) {
            return !override.closed() && override.windows().stream().anyMatch(window -> inside(local.toLocalTime(), window));
        }
        if (!weeklyConfigured) return true;
        int day = local.getDayOfWeek().getValue();
        return weeklyWindows.getOrDefault(kitchenId, List.of()).stream()
            .filter(window -> window.dayOfWeek() == day)
            .anyMatch(window -> inside(local.toLocalTime(), window));
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
        Instant searchFrom = pausedUntil != null && pausedUntil.isAfter(evaluatedAt) ? pausedUntil : evaluatedAt;
        LocalDate firstDate = searchFrom.atZone(zone).toLocalDate();
        Instant hardStop = evaluatedAt.plusSeconds((LOOKAHEAD_DAYS + 1L) * 24L * 60L * 60L);
        for (int offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
            LocalDate date = firstDate.plusDays(offset);
            OverrideDay override = overrides.get(new OverrideKey(kitchenId, date));
            if (override != null && override.closed()) continue;
            if (override == null && !weeklyConfigured) {
                Instant dayStart = date.atStartOfDay(zone).toInstant();
                Instant dayEnd = date.plusDays(1).atStartOfDay(zone).toInstant();
                Instant candidate = searchFrom.isAfter(dayStart) ? searchFrom : dayStart;
                if (candidate.isBefore(dayEnd) && !candidate.isAfter(hardStop)) return candidate;
                continue;
            }
            List<ServiceWindow> windows = override != null
                ? override.windows()
                : weeklyWindows.getOrDefault(kitchenId, List.of()).stream()
                    .filter(window -> window.dayOfWeek() == date.getDayOfWeek().getValue())
                    .toList();
            for (ServiceWindow window : windows) {
                Instant opensAt = date.atTime(window.opensAt()).atZone(zone).toInstant();
                Instant closesAt = date.atTime(window.closesAt()).atZone(zone).toInstant();
                if (!closesAt.isAfter(searchFrom)) continue;
                Instant candidate = searchFrom.isAfter(opensAt) ? searchFrom : opensAt;
                if (candidate.isBefore(closesAt) && !candidate.isAfter(hardStop)) return candidate;
            }
        }
        return null;
    }

    private static FavoriteHomeCard missing(RequestEntry request, Instant evaluatedAt) {
        return new FavoriteHomeCard(
            request.type(), request.id(), false, null, null, null, null, null, null, null, null,
            0, List.of(), DEFAULT_TIMEZONE, false, false, false,
            FavoriteCookingState.MISSING, null, evaluatedAt
        );
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

    private static Instant instantOrNull(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record RequestEntry(RequestedFavoriteType type, UUID id) {}
    private record KitchenRow(
        UUID kitchenId,
        UUID chefIdentityId,
        String kitchenName,
        String displayName,
        String status,
        String areaName,
        String city,
        String state,
        String timezoneId,
        boolean acceptingOrders,
        Instant pausedUntil
    ) {}
    private record CountRow(UUID kitchenId, int count) {}
    private record PreviewRow(UUID kitchenId, FavoriteMenuPreview preview) {}
    private record WeeklyRow(UUID kitchenId, ServiceWindow window) {}
    private record ServiceWindow(int dayOfWeek, LocalTime opensAt, LocalTime closesAt) {}
    private record OverrideKey(UUID kitchenId, LocalDate serviceDate) {}
    private record OverrideHeaderRow(OverrideKey key, boolean closed) {}
    private record OverrideWindowRow(OverrideKey key, ServiceWindow window) {}
    private record OverrideDay(boolean closed, List<ServiceWindow> windows) {}
    private record ScheduleEvaluation(boolean scheduleConfigured, boolean paused, boolean openNow, Instant nextAvailabilityAt) {}

    private static final class MutableOverrideDay {
        private final boolean closed;
        private final List<ServiceWindow> windows = new ArrayList<>();
        private MutableOverrideDay(boolean closed) { this.closed = closed; }
        boolean closed() { return closed; }
        List<ServiceWindow> windows() { return windows; }
    }
}
