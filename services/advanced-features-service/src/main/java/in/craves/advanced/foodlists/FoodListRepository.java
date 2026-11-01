package in.craves.advanced.foodlists;

import in.craves.advanced.foodlists.FoodListDtos.FoodListSummary;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import in.craves.advanced.platform.data.Sql;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class FoodListRepository {
    record Row(UUID id, UUID ownerId, String name, String description, int itemCount, long version, Instant createdAt, Instant updatedAt) { }

    record ItemRow(UUID menuItemId, String note, int position, String itemName, UUID kitchenId, Instant addedAt) { }

    record ShareRow(UUID id, UUID listId, Instant createdAt, Instant expiresAt, Instant revokedAt, long viewCount) { }

    private static final String COLUMNS = "id, owner_id, name, description, item_count, version, created_at, updated_at";
    private final JdbcTemplate jdbc;

    FoodListRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void lockOwner(UUID owner) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class, "adv_food_lists:" + owner);
    }

    int countByOwner(UUID owner) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM adv_food_lists.food_list WHERE owner_id = ?", Integer.class, owner);
        return count == null ? 0 : count;
    }

    boolean nameTaken(UUID owner, String name, UUID except) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM adv_food_lists.food_list WHERE owner_id = ? AND lower(name) = lower(?) AND id <> ?",
                Integer.class, owner, name, except == null ? new UUID(0, 0) : except);
        return count != null && count > 0;
    }

    void insert(Row row) {
        jdbc.update("INSERT INTO adv_food_lists.food_list (" + COLUMNS + ") VALUES (?,?,?,?,?,?,?,?)", row.id(), row.ownerId(), row.name(),
                row.description(), row.itemCount(), row.version(), ts(row.createdAt()), ts(row.updatedAt()));
    }

    List<FoodListSummary> summaries(UUID owner) {
        return jdbc.query("SELECT l.id, l.name, l.description, l.item_count, l.version, l.created_at, l.updated_at, "
                + "EXISTS (SELECT 1 FROM adv_food_lists.food_list_share s WHERE s.list_id = l.id AND s.revoked_at IS NULL "
                + "AND (s.expires_at IS NULL OR s.expires_at > now())) AS shared "
                + "FROM adv_food_lists.food_list l WHERE l.owner_id = ? ORDER BY l.updated_at DESC, l.id", (rs, i) ->
                new FoodListSummary(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("description"),
                        rs.getInt("item_count"), rs.getBoolean("shared") ? "SHARED" : "PRIVATE", rs.getLong("version"),
                        instant(rs, "created_at"), instant(rs, "updated_at")), owner);
    }

    Optional<Row> find(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_food_lists.food_list WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                FoodListRepository::row, id).stream().findFirst();
    }

    void update(UUID id, String name, String description, int itemCount, Instant now) {
        jdbc.update("UPDATE adv_food_lists.food_list SET name = ?, description = ?, item_count = ?, version = version + 1, updated_at = ? WHERE id = ?",
                name, description, itemCount, ts(now), id);
    }

    void delete(UUID id) {
        jdbc.update("DELETE FROM adv_food_lists.food_list WHERE id = ?", id);
    }

    List<ItemRow> items(UUID listId) {
        return jdbc.query("SELECT menu_item_id, note, position, item_name, kitchen_id, added_at FROM adv_food_lists.food_list_item "
                        + "WHERE list_id = ? ORDER BY position, added_at", (rs, i) -> new ItemRow(rs.getObject("menu_item_id", UUID.class),
                        rs.getString("note"), rs.getInt("position"), rs.getString("item_name"), rs.getObject("kitchen_id", UUID.class),
                        instant(rs, "added_at")), listId);
    }

    boolean hasItem(UUID listId, UUID menuItemId) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM adv_food_lists.food_list_item WHERE list_id = ? AND menu_item_id = ?",
                Integer.class, listId, menuItemId);
        return count != null && count > 0;
    }

    void insertItem(UUID listId, UUID menuItemId, String note, String itemName, UUID kitchenId, Instant now) {
        jdbc.update("INSERT INTO adv_food_lists.food_list_item (list_id, menu_item_id, note, position, item_name, kitchen_id, added_at) "
                        + "VALUES (?, ?, ?, (SELECT coalesce(max(position), 0) + 1 FROM adv_food_lists.food_list_item WHERE list_id = ?), ?, ?, ?)",
                listId, menuItemId, note, listId, itemName, kitchenId, ts(now));
    }

    void updateItemNote(UUID listId, UUID menuItemId, String note) {
        jdbc.update("UPDATE adv_food_lists.food_list_item SET note = ? WHERE list_id = ? AND menu_item_id = ?", note, listId, menuItemId);
    }

    boolean deleteItem(UUID listId, UUID menuItemId) {
        return jdbc.update("DELETE FROM adv_food_lists.food_list_item WHERE list_id = ? AND menu_item_id = ?", listId, menuItemId) > 0;
    }

    void setPosition(UUID listId, UUID menuItemId, int position) {
        jdbc.update("UPDATE adv_food_lists.food_list_item SET position = ? WHERE list_id = ? AND menu_item_id = ?", position, listId, menuItemId);
    }

    Optional<ShareRow> activeShare(UUID listId) {
        return jdbc.query("SELECT id, list_id, created_at, expires_at, revoked_at, view_count FROM adv_food_lists.food_list_share "
                + "WHERE list_id = ? AND revoked_at IS NULL", FoodListRepository::share, listId).stream().findFirst();
    }

    Optional<ShareRow> shareByTokenHash(String tokenHash) {
        return jdbc.query("SELECT id, list_id, created_at, expires_at, revoked_at, view_count FROM adv_food_lists.food_list_share "
                + "WHERE token_hash = ?", FoodListRepository::share, tokenHash).stream().findFirst();
    }

    int revokeShares(UUID listId, Instant now) {
        return jdbc.update("UPDATE adv_food_lists.food_list_share SET revoked_at = ? WHERE list_id = ? AND revoked_at IS NULL", ts(now), listId);
    }

    void insertShare(UUID id, UUID listId, String tokenHash, UUID createdBy, Instant now, Instant expiresAt) {
        jdbc.update("INSERT INTO adv_food_lists.food_list_share (id, list_id, token_hash, created_by, created_at, expires_at) VALUES (?,?,?,?,?,?)",
                id, listId, tokenHash, createdBy, ts(now), expiresAt == null ? null : ts(expiresAt));
    }

    void countView(UUID shareId) {
        jdbc.update("UPDATE adv_food_lists.food_list_share SET view_count = view_count + 1 WHERE id = ?", shareId);
    }

    List<UUID> listIdsOf(UUID owner) {
        return jdbc.queryForList("SELECT id FROM adv_food_lists.food_list WHERE owner_id = ?", UUID.class, owner);
    }

    int deleteAllOf(UUID owner) {
        return jdbc.update("DELETE FROM adv_food_lists.food_list WHERE owner_id = ?", owner);
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        return new Row(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class), rs.getString("name"), rs.getString("description"),
                rs.getInt("item_count"), rs.getLong("version"), instant(rs, "created_at"), instant(rs, "updated_at"));
    }

    private static ShareRow share(ResultSet rs, int i) throws SQLException {
        return new ShareRow(rs.getObject("id", UUID.class), rs.getObject("list_id", UUID.class), instant(rs, "created_at"),
                instant(rs, "expires_at"), instant(rs, "revoked_at"), rs.getLong("view_count"));
    }

    static Instant instant(ResultSet rs, String column) throws SQLException {
        return Sql.instant(rs, column);
    }

    static Object ts(Instant instant) {
        return Sql.ts(instant);
    }
}
