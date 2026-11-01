package in.craves.advanced.menuoptions;

import in.craves.advanced.menuoptions.MenuOptionsDtos.MealPeriod;
import in.craves.advanced.menuoptions.MenuOptionsDtos.MealPeriodWindow;
import in.craves.advanced.platform.data.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class MenuOptionsRepository {
    record Row(UUID menuItemId, UUID chefId, UUID kitchenId, String groups, List<MealPeriod> mealPeriods, long version, Instant updatedAt) { }

    private static final String COLUMNS = "menu_item_id, chef_id, kitchen_id, option_groups::text AS option_groups, meal_periods, version, updated_at";
    private final JdbcTemplate jdbc;

    MenuOptionsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Serialises a kitchen's meal-period changes with dish saves that use them. */
    void lockKitchen(UUID kitchenId) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(?)", kitchenId.getMostSignificantBits() ^ kitchenId.getLeastSignificantBits());
    }

    Optional<Row> find(UUID menuItemId, boolean forUpdate) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_menu_options.dish_options WHERE menu_item_id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                MenuOptionsRepository::row, menuItemId).stream().findFirst();
    }

    List<Row> find(List<UUID> menuItemIds) {
        if (menuItemIds.isEmpty()) return List.of();
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_menu_options.dish_options WHERE menu_item_id = ANY(CAST(? AS uuid[])) ORDER BY menu_item_id",
                MenuOptionsRepository::row, (Object) menuItemIds.stream().map(UUID::toString).toArray(String[]::new));
    }

    void insert(UUID menuItemId, UUID chefId, UUID kitchenId, String groups, List<MealPeriod> periods, Instant now) {
        jdbc.update("INSERT INTO adv_menu_options.dish_options (menu_item_id, chef_id, kitchen_id, option_groups, meal_periods, version, updated_at) "
                + "VALUES (?,?,?,CAST(? AS jsonb),CAST(? AS text[]),1,?)", menuItemId, chefId, kitchenId, groups, names(periods), Sql.ts(now));
    }

    void update(UUID menuItemId, UUID kitchenId, String groups, List<MealPeriod> periods, Instant now) {
        jdbc.update("UPDATE adv_menu_options.dish_options SET kitchen_id = ?, option_groups = CAST(? AS jsonb), meal_periods = CAST(? AS text[]), "
                + "version = version + 1, updated_at = ? WHERE menu_item_id = ?", kitchenId, groups, names(periods), Sql.ts(now), menuItemId);
    }

    void delete(UUID menuItemId) {
        jdbc.update("DELETE FROM adv_menu_options.dish_options WHERE menu_item_id = ?", menuItemId);
    }

    List<MealPeriodWindow> periods(UUID kitchenId) {
        return jdbc.query("SELECT period, starts_at, ends_at, days FROM adv_menu_options.meal_period WHERE kitchen_id = ? "
                + "ORDER BY array_position(ARRAY['BREAKFAST','LUNCH','SNACKS','DINNER','LATE_NIGHT']::text[], period::text)", (rs, i) -> {
                    Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
                    Arrays.stream((String[]) rs.getArray("days").getArray()).map(DayOfWeek::valueOf).forEach(days::add);
                    return new MealPeriodWindow(MealPeriod.valueOf(rs.getString("period")), rs.getObject("starts_at", LocalTime.class),
                            rs.getObject("ends_at", LocalTime.class), days);
                }, kitchenId);
    }

    void replacePeriods(UUID kitchenId, UUID chefId, List<MealPeriodWindow> windows, Instant now) {
        jdbc.update("DELETE FROM adv_menu_options.meal_period WHERE kitchen_id = ?", kitchenId);
        for (MealPeriodWindow window : windows) {
            jdbc.update("INSERT INTO adv_menu_options.meal_period (kitchen_id, period, starts_at, ends_at, days, chef_id, updated_at) "
                            + "VALUES (?,?,?,?,CAST(? AS text[]),?,?)", kitchenId, window.period().name(), window.startsAt(), window.endsAt(),
                    window.days().stream().sorted().map(Enum::name).toArray(String[]::new), chefId, Sql.ts(now));
        }
    }

    /** Meal periods that the kitchen's dishes are labelled with. */
    Set<MealPeriod> periodsInUse(UUID kitchenId) {
        return jdbc.queryForList("SELECT DISTINCT unnest(meal_periods) FROM adv_menu_options.dish_options WHERE kitchen_id = ?", String.class, kitchenId)
                .stream().map(MealPeriod::valueOf).collect(Collectors.toCollection(() -> EnumSet.noneOf(MealPeriod.class)));
    }

    private static String[] names(List<MealPeriod> periods) {
        return periods.stream().map(Enum::name).toArray(String[]::new);
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        List<MealPeriod> periods = Arrays.stream((String[]) rs.getArray("meal_periods").getArray()).map(MealPeriod::valueOf).sorted().toList();
        return new Row(rs.getObject("menu_item_id", UUID.class), rs.getObject("chef_id", UUID.class), rs.getObject("kitchen_id", UUID.class),
                rs.getString("option_groups"), periods, rs.getLong("version"), Sql.instant(rs, "updated_at"));
    }
}
