package in.craves.advanced.grouporders;

import in.craves.advanced.platform.data.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class GroupOrderRepository {
    record Group(UUID id, UUID hostId, UUID kitchenId, String title, String joinCode, String status, Instant joinUntil,
                 int maxParticipants, long version, Instant createdAt, Instant updatedAt) { }

    record Participant(UUID participantId, String displayName, String role, Instant joinedAt, Instant removedAt) { }

    record Item(UUID participantId, UUID menuItemId, int quantity, String note, String itemName, long unitPricePaise) { }

    private static final String GROUP = "id, host_id, kitchen_id, title, join_code, status, join_until, max_participants, version, created_at, updated_at";
    private final JdbcTemplate jdbc;

    GroupOrderRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void insertGroup(Group g) {
        jdbc.update("INSERT INTO adv_group_orders.group_order (" + GROUP + ") VALUES (?,?,?,?,?,?,?,?,?,?,?)", g.id(), g.hostId(), g.kitchenId(),
                g.title(), g.joinCode(), g.status(), Sql.ts(g.joinUntil()), g.maxParticipants(), g.version(), Sql.ts(g.createdAt()), Sql.ts(g.updatedAt()));
    }

    Optional<Group> find(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + GROUP + " FROM adv_group_orders.group_order WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                GroupOrderRepository::group, id).stream().findFirst();
    }

    Optional<Group> findByCode(String code, boolean forUpdate) {
        return jdbc.query("SELECT " + GROUP + " FROM adv_group_orders.group_order WHERE join_code = ?" + (forUpdate ? " FOR UPDATE" : ""),
                GroupOrderRepository::group, code).stream().findFirst();
    }

    boolean codeExists(String code) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM adv_group_orders.group_order WHERE join_code = ?", Integer.class, code);
        return n != null && n > 0;
    }

    int activeHostedBy(UUID host) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM adv_group_orders.group_order WHERE host_id = ? AND status IN ('OPEN','LOCKED')",
                Integer.class, host);
        return n == null ? 0 : n;
    }

    void setStatus(UUID id, String status, Instant joinUntil, Instant now) {
        jdbc.update("UPDATE adv_group_orders.group_order SET status = ?, join_until = coalesce(?, join_until), version = version + 1, updated_at = ?, "
                        + "locked_at = CASE WHEN ? = 'LOCKED' THEN ? ELSE locked_at END, "
                        + "closed_at = CASE WHEN ? IN ('CHECKED_OUT','CANCELLED') THEN ? ELSE closed_at END WHERE id = ?",
                status, Sql.ts(joinUntil), Sql.ts(now), status, Sql.ts(now), status, Sql.ts(now), id);
    }

    void touch(UUID id, Instant now) {
        jdbc.update("UPDATE adv_group_orders.group_order SET version = version + 1, updated_at = ? WHERE id = ?", Sql.ts(now), id);
    }

    List<Participant> participants(UUID groupId) {
        return jdbc.query("SELECT participant_id, display_name, role, joined_at, removed_at FROM adv_group_orders.group_participant "
                + "WHERE group_id = ? ORDER BY CASE role WHEN 'HOST' THEN 0 ELSE 1 END, joined_at", (rs, i) ->
                new Participant(rs.getObject("participant_id", UUID.class), rs.getString("display_name"), rs.getString("role"),
                        Sql.instant(rs, "joined_at"), Sql.instant(rs, "removed_at")), groupId);
    }

    Optional<Participant> participant(UUID groupId, UUID person) {
        return participants(groupId).stream().filter(p -> p.participantId().equals(person)).findFirst();
    }

    void insertParticipant(UUID groupId, UUID person, String displayName, String role, Instant now) {
        jdbc.update("INSERT INTO adv_group_orders.group_participant (group_id, participant_id, display_name, role, joined_at) VALUES (?,?,?,?,?)",
                groupId, person, displayName, role, Sql.ts(now));
    }

    void removeParticipant(UUID groupId, UUID person, Instant now) {
        jdbc.update("DELETE FROM adv_group_orders.group_item WHERE group_id = ? AND participant_id = ?", groupId, person);
        jdbc.update("UPDATE adv_group_orders.group_participant SET removed_at = ? WHERE group_id = ? AND participant_id = ?", Sql.ts(now), groupId, person);
    }

    List<Item> items(UUID groupId) {
        return jdbc.query("SELECT participant_id, menu_item_id, quantity, note, item_name, unit_price_paise FROM adv_group_orders.group_item "
                + "WHERE group_id = ? ORDER BY updated_at, menu_item_id", (rs, i) -> new Item(rs.getObject("participant_id", UUID.class),
                rs.getObject("menu_item_id", UUID.class), rs.getInt("quantity"), rs.getString("note"), rs.getString("item_name"),
                rs.getLong("unit_price_paise")), groupId);
    }

    int distinctItemsOf(UUID groupId, UUID person) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM adv_group_orders.group_item WHERE group_id = ? AND participant_id = ?",
                Integer.class, groupId, person);
        return n == null ? 0 : n;
    }

    void upsertItem(UUID groupId, UUID person, UUID menuItemId, int quantity, String note, String itemName, long unitPricePaise, Instant now) {
        jdbc.update("INSERT INTO adv_group_orders.group_item (group_id, participant_id, menu_item_id, quantity, note, item_name, unit_price_paise, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (group_id, participant_id, menu_item_id) DO UPDATE SET quantity = EXCLUDED.quantity, "
                        + "note = EXCLUDED.note, item_name = EXCLUDED.item_name, unit_price_paise = EXCLUDED.unit_price_paise, updated_at = EXCLUDED.updated_at",
                groupId, person, menuItemId, quantity, note, itemName, unitPricePaise, Sql.ts(now));
    }

    boolean deleteItem(UUID groupId, UUID person, UUID menuItemId) {
        return jdbc.update("DELETE FROM adv_group_orders.group_item WHERE group_id = ? AND participant_id = ? AND menu_item_id = ?",
                groupId, person, menuItemId) > 0;
    }

    List<Group> groupsOf(UUID person, int limit) {
        return jdbc.query("SELECT g.id, g.host_id, g.kitchen_id, g.title, g.join_code, g.status, g.join_until, g.max_participants, g.version, "
                + "g.created_at, g.updated_at FROM adv_group_orders.group_order g JOIN adv_group_orders.group_participant p ON p.group_id = g.id "
                + "WHERE p.participant_id = ? AND p.removed_at IS NULL ORDER BY g.created_at DESC, g.id LIMIT ?", GroupOrderRepository::group, person, limit);
    }

    Optional<String> checkoutJson(UUID groupId) {
        return jdbc.query("SELECT json_build_object('lines', lines, 'subtotalPaise', subtotal_paise, 'appliedToCart', applied_to_cart, "
                        + "'createdAt', created_at)::text FROM adv_group_orders.group_checkout WHERE group_id = ?",
                (rs, i) -> rs.getString(1), groupId).stream().findFirst();
    }

    void insertCheckout(UUID groupId, UUID host, String linesJson, long subtotal, boolean applied, Instant now) {
        jdbc.update("INSERT INTO adv_group_orders.group_checkout (group_id, host_id, lines, subtotal_paise, applied_to_cart, created_at) "
                + "VALUES (?,?,CAST(? AS jsonb),?,?,?)", groupId, host, linesJson, subtotal, applied, Sql.ts(now));
    }

    int purgeOld() {
        return jdbc.update("DELETE FROM adv_group_orders.group_order WHERE (status IN ('CHECKED_OUT','CANCELLED') AND closed_at < now() - interval '30 days') "
                + "OR (status IN ('OPEN','LOCKED') AND join_until < now() - interval '7 days')");
    }

    int eraseParticipation(UUID person) {
        int hosted = jdbc.update("DELETE FROM adv_group_orders.group_order WHERE host_id = ?", person);
        int joined = jdbc.update("DELETE FROM adv_group_orders.group_participant WHERE participant_id = ?", person);
        return hosted + joined;
    }

    private static Group group(ResultSet rs, int i) throws SQLException {
        return new Group(rs.getObject("id", UUID.class), rs.getObject("host_id", UUID.class), rs.getObject("kitchen_id", UUID.class),
                rs.getString("title"), rs.getString("join_code"), rs.getString("status"), Sql.instant(rs, "join_until"),
                rs.getInt("max_participants"), rs.getLong("version"), Sql.instant(rs, "created_at"), Sql.instant(rs, "updated_at"));
    }
}
