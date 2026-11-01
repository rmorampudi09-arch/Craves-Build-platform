package in.craves.advanced.foodfacts;

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
class FoodFactsRepository {
    record Row(UUID menuItemId, UUID chefId, UUID kitchenId, String status, String content, long version, Instant submittedAt,
               UUID reviewedBy, Instant reviewedAt, String reviewNote, String verifiedSnapshot, String published, String publishedLabel,
               Instant publishedAt, Instant updatedAt) { }

    private static final String COLUMNS = "menu_item_id, chef_id, kitchen_id, status, content::text AS content, version, submitted_at, "
            + "reviewed_by, reviewed_at, review_note, verified_snapshot::text AS verified_snapshot, published::text AS published, "
            + "published_label, published_at, updated_at";
    private final JdbcTemplate jdbc;

    FoodFactsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    Optional<Row> find(UUID menuItemId, boolean forUpdate) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_food_facts.menu_item_facts WHERE menu_item_id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                FoodFactsRepository::row, menuItemId).stream().findFirst();
    }

    void insertDraft(UUID menuItemId, UUID chefId, UUID kitchenId, String content, Instant now) {
        jdbc.update("INSERT INTO adv_food_facts.menu_item_facts (menu_item_id, chef_id, kitchen_id, status, content, version, updated_at) "
                + "VALUES (?,?,?,'DRAFT',CAST(? AS jsonb),1,?)", menuItemId, chefId, kitchenId, content, Sql.ts(now));
    }

    void updateDraft(UUID menuItemId, UUID kitchenId, String content, Instant now) {
        jdbc.update("UPDATE adv_food_facts.menu_item_facts SET status = 'DRAFT', content = CAST(? AS jsonb), kitchen_id = coalesce(?, kitchen_id), "
                + "version = version + 1, updated_at = ? WHERE menu_item_id = ?", content, kitchenId, Sql.ts(now), menuItemId);
    }

    void submit(UUID menuItemId, Instant now) {
        jdbc.update("UPDATE adv_food_facts.menu_item_facts SET status = 'SUBMITTED', submitted_at = ?, published = content, "
                + "published_label = 'CHEF_DECLARED', published_at = ?, review_note = NULL, version = version + 1, updated_at = ? WHERE menu_item_id = ?",
                Sql.ts(now), Sql.ts(now), Sql.ts(now), menuItemId);
    }

    void verify(UUID menuItemId, UUID reviewer, String note, Instant now) {
        jdbc.update("UPDATE adv_food_facts.menu_item_facts SET status = 'VERIFIED', reviewed_by = ?, reviewed_at = ?, review_note = ?, "
                + "verified_snapshot = content, published = content, published_label = 'VERIFIED', published_at = ?, version = version + 1, "
                + "updated_at = ? WHERE menu_item_id = ?", reviewer, Sql.ts(now), note, Sql.ts(now), Sql.ts(now), menuItemId);
    }

    void reject(UUID menuItemId, UUID reviewer, String note, Instant now) {
        jdbc.update("UPDATE adv_food_facts.menu_item_facts SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ?, review_note = ?, "
                + "published = verified_snapshot, published_label = CASE WHEN verified_snapshot IS NULL THEN NULL ELSE 'VERIFIED' END, "
                + "published_at = CASE WHEN verified_snapshot IS NULL THEN NULL ELSE published_at END, version = version + 1, updated_at = ? "
                + "WHERE menu_item_id = ?", reviewer, Sql.ts(now), note, Sql.ts(now), menuItemId);
    }

    void delete(UUID menuItemId) {
        jdbc.update("DELETE FROM adv_food_facts.menu_item_facts WHERE menu_item_id = ?", menuItemId);
    }

    void revision(UUID menuItemId, long version, String action, UUID actor, String payload, Instant now) {
        jdbc.update("INSERT INTO adv_food_facts.facts_revision (menu_item_id, version, action, actor_id, payload, created_at) "
                + "VALUES (?,?,?,?,CAST(? AS jsonb),?)", menuItemId, version, action, actor, payload, Sql.ts(now));
    }

    List<Row> published(List<UUID> menuItemIds) {
        if (menuItemIds.isEmpty()) return List.of();
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_food_facts.menu_item_facts WHERE published IS NOT NULL AND menu_item_id = ANY(CAST(? AS uuid[]))",
                FoodFactsRepository::row, (Object) menuItemIds.stream().map(UUID::toString).toArray(String[]::new));
    }

    List<UUID> freeFrom(String[] allergens, UUID after, int limit) {
        return jdbc.queryForList("SELECT menu_item_id FROM adv_food_facts.menu_item_facts WHERE published IS NOT NULL "
                        + "AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(published->'allergens','[]'::jsonb)) a WHERE a = ANY(CAST(? AS text[]))) "
                        + "AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(published->'mayContain','[]'::jsonb)) m WHERE m = ANY(CAST(? AS text[]))) "
                        + "AND menu_item_id > ? ORDER BY menu_item_id LIMIT ?",
                UUID.class, allergens, allergens, after == null ? new UUID(0, 0) : after, limit);
    }

    List<Row> queue(Instant afterSubmitted, UUID afterId, int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_food_facts.menu_item_facts WHERE status = 'SUBMITTED' "
                        + "AND (submitted_at, menu_item_id) > (?, ?) ORDER BY submitted_at, menu_item_id LIMIT ?", FoodFactsRepository::row,
                Sql.ts(afterSubmitted == null ? Instant.EPOCH : afterSubmitted), afterId == null ? new UUID(0, 0) : afterId, limit);
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        return new Row(rs.getObject("menu_item_id", UUID.class), rs.getObject("chef_id", UUID.class), rs.getObject("kitchen_id", UUID.class),
                rs.getString("status"), rs.getString("content"), rs.getLong("version"), Sql.instant(rs, "submitted_at"),
                rs.getObject("reviewed_by", UUID.class), Sql.instant(rs, "reviewed_at"), rs.getString("review_note"),
                rs.getString("verified_snapshot"), rs.getString("published"), rs.getString("published_label"),
                Sql.instant(rs, "published_at"), Sql.instant(rs, "updated_at"));
    }
}
