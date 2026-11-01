package in.craves.advanced.savedfeed;

import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.data.Sql;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Public Catalog facts only (which kitchen a dish belongs to and its name), so an unavailable favorite can still be explained. */
@Repository
class SavedFeedRepository {
    record SeenDish(UUID kitchenId, String name) { }

    private final JdbcTemplate jdbc;

    SavedFeedRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void remember(Collection<MenuItem> items, Instant now) {
        // Sorted so concurrent feeds on different replicas lock shared rows in the same order (no deadlocks); unchanged rows are not rewritten.
        List<Object[]> rows = items.stream().filter(item -> item.kitchenId() != null).sorted(java.util.Comparator.comparing(MenuItem::id))
                .map(item -> new Object[] {item.id(), item.kitchenId(), item.name() == null ? null : truncate(item.name()), Sql.ts(now)}).toList();
        if (rows.isEmpty()) return;
        jdbc.batchUpdate("INSERT INTO adv_saved_feed.dish_seen (menu_item_id, kitchen_id, name, seen_at) VALUES (?,?,?,?) "
                + "ON CONFLICT (menu_item_id) DO UPDATE SET kitchen_id = EXCLUDED.kitchen_id, name = EXCLUDED.name, seen_at = EXCLUDED.seen_at "
                + "WHERE (adv_saved_feed.dish_seen.kitchen_id, adv_saved_feed.dish_seen.name) IS DISTINCT FROM (EXCLUDED.kitchen_id, EXCLUDED.name)", rows);
    }

    Map<UUID, SeenDish> seen(Collection<UUID> ids) {
        Map<UUID, SeenDish> found = new HashMap<>();
        if (ids.isEmpty()) return found;
        jdbc.query("SELECT menu_item_id, kitchen_id, name FROM adv_saved_feed.dish_seen WHERE menu_item_id = ANY (?)",
                rs -> { found.put(rs.getObject(1, UUID.class), new SeenDish(rs.getObject(2, UUID.class), rs.getString(3))); },
                (Object) ids.toArray(new UUID[0]));
        return found;
    }

    private static String truncate(String name) {
        return name.length() <= 200 ? name : name.substring(0, 200);
    }
}
