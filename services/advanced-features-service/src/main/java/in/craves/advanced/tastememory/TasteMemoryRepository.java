package in.craves.advanced.tastememory;

import in.craves.advanced.platform.data.Sql;
import in.craves.advanced.tastememory.TasteMemoryDtos.Oil;
import in.craves.advanced.tastememory.TasteMemoryDtos.RememberedDish;
import in.craves.advanced.tastememory.TasteMemoryDtos.RememberedDishRequest;
import in.craves.advanced.tastememory.TasteMemoryDtos.Spice;
import in.craves.advanced.tastememory.TasteMemoryDtos.TasteProfile;
import in.craves.advanced.tastememory.TasteMemoryDtos.TasteProfileRequest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class TasteMemoryRepository {
    private static final String DISH_COLUMNS = "menu_item_id, choice_ids, spice, oil, note, updated_at";
    private final JdbcTemplate jdbc;

    TasteMemoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    Optional<TasteProfile> profile(UUID person) {
        return jdbc.query("SELECT spice, oil, note, updated_at FROM adv_taste_memory.profile WHERE person_id = ?",
                (rs, i) -> new TasteProfile(spice(rs), oil(rs), rs.getString("note"), Sql.instant(rs, "updated_at")), person).stream().findFirst();
    }

    void saveProfile(UUID person, TasteProfileRequest request, String note, Instant now) {
        jdbc.update("INSERT INTO adv_taste_memory.profile (person_id, spice, oil, note, updated_at) VALUES (?,?,?,?,?) "
                        + "ON CONFLICT (person_id) DO UPDATE SET spice = EXCLUDED.spice, oil = EXCLUDED.oil, note = EXCLUDED.note, "
                        + "updated_at = EXCLUDED.updated_at",
                person, name(request.spice()), name(request.oil()), note, Sql.ts(now));
    }

    /** Remembers a dish; false when the person already keeps the maximum number of other dishes. */
    boolean saveDish(UUID person, UUID menuItemId, RememberedDishRequest request, String note, int maxDishes, Instant now) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(?)", person.getMostSignificantBits() ^ person.getLeastSignificantBits());
        Integer others = jdbc.queryForObject("SELECT count(*) FROM adv_taste_memory.dish_memory WHERE person_id = ? AND menu_item_id <> ?",
                Integer.class, person, menuItemId);
        if (others != null && others >= maxDishes) return false;
        String[] choices = request.choiceIds() == null ? new String[0] : request.choiceIds().stream().distinct().map(UUID::toString).toArray(String[]::new);
        jdbc.update("INSERT INTO adv_taste_memory.dish_memory (person_id, menu_item_id, choice_ids, spice, oil, note, updated_at) "
                        + "VALUES (?,?,CAST(? AS uuid[]),?,?,?,?) ON CONFLICT (person_id, menu_item_id) DO UPDATE SET choice_ids = EXCLUDED.choice_ids, "
                        + "spice = EXCLUDED.spice, oil = EXCLUDED.oil, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at",
                person, menuItemId, choices, name(request.spice()), name(request.oil()), note, Sql.ts(now));
        return true;
    }

    Optional<RememberedDish> dish(UUID person, UUID menuItemId) {
        return jdbc.query("SELECT " + DISH_COLUMNS + " FROM adv_taste_memory.dish_memory WHERE person_id = ? AND menu_item_id = ?",
                TasteMemoryRepository::dish, person, menuItemId).stream().findFirst();
    }

    List<RememberedDish> dishes(UUID person, List<UUID> menuItemIds) {
        return jdbc.query("SELECT " + DISH_COLUMNS + " FROM adv_taste_memory.dish_memory WHERE person_id = ? "
                        + "AND menu_item_id = ANY(CAST(? AS uuid[])) ORDER BY menu_item_id", TasteMemoryRepository::dish, person,
                menuItemIds.stream().map(UUID::toString).toArray(String[]::new));
    }

    /** Most recently remembered first, after the (updatedAt, menuItemId) position when one is given. */
    List<RememberedDish> recent(UUID person, Instant beforeAt, UUID beforeId, int limit) {
        if (beforeAt == null) {
            return jdbc.query("SELECT " + DISH_COLUMNS + " FROM adv_taste_memory.dish_memory WHERE person_id = ? "
                    + "ORDER BY updated_at DESC, menu_item_id DESC LIMIT ?", TasteMemoryRepository::dish, person, limit);
        }
        return jdbc.query("SELECT " + DISH_COLUMNS + " FROM adv_taste_memory.dish_memory WHERE person_id = ? AND (updated_at, menu_item_id) < (?, ?) "
                + "ORDER BY updated_at DESC, menu_item_id DESC LIMIT ?", TasteMemoryRepository::dish, person, Sql.ts(beforeAt), beforeId, limit);
    }

    int forgetDish(UUID person, UUID menuItemId) {
        return jdbc.update("DELETE FROM adv_taste_memory.dish_memory WHERE person_id = ? AND menu_item_id = ?", person, menuItemId);
    }

    int eraseAll(UUID person) {
        return jdbc.update("DELETE FROM adv_taste_memory.dish_memory WHERE person_id = ?", person)
                + jdbc.update("DELETE FROM adv_taste_memory.profile WHERE person_id = ?", person);
    }

    private static String name(Enum<?> value) {
        return value == null ? null : value.name();
    }

    private static Spice spice(ResultSet rs) throws SQLException {
        String value = rs.getString("spice");
        return value == null ? null : Spice.valueOf(value);
    }

    private static Oil oil(ResultSet rs) throws SQLException {
        String value = rs.getString("oil");
        return value == null ? null : Oil.valueOf(value);
    }

    private static RememberedDish dish(ResultSet rs, int i) throws SQLException {
        return new RememberedDish(rs.getObject("menu_item_id", UUID.class), Arrays.asList((UUID[]) rs.getArray("choice_ids").getArray()),
                spice(rs), oil(rs), rs.getString("note"), Sql.instant(rs, "updated_at"));
    }
}
