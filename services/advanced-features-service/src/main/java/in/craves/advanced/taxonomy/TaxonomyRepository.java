package in.craves.advanced.taxonomy;

import in.craves.advanced.platform.data.Sql;
import in.craves.advanced.taxonomy.TaxonomyDtos.AdminTerm;
import in.craves.advanced.taxonomy.TaxonomyDtos.Kind;
import in.craves.advanced.taxonomy.TaxonomyDtos.Status;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class TaxonomyRepository {
    record Row(UUID menuItemId, UUID chefId, List<String> cuisines, List<String> diets, String setBy, long version, Instant updatedAt) { }

    private static final String TERM_COLUMNS = "code, kind, parent_code, name, description, aliases, sort_order, status, version, updated_at";
    private static final String TAG_COLUMNS = "menu_item_id, chef_id, cuisines, diets, set_by, version, updated_at";
    private final JdbcTemplate jdbc;

    TaxonomyRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<AdminTerm> terms() {
        return jdbc.query("SELECT " + TERM_COLUMNS + " FROM adv_taxonomy.term ORDER BY code", TaxonomyRepository::term);
    }

    /** Serialises vocabulary changes (label clashes and cycles are checked across all terms); reads keep flowing. */
    void lockTerms() {
        jdbc.execute("LOCK TABLE adv_taxonomy.term IN SHARE ROW EXCLUSIVE MODE");
    }

    void insertTerm(AdminTerm term, UUID actor, Instant now) {
        jdbc.update("INSERT INTO adv_taxonomy.term (code, kind, parent_code, name, description, aliases, sort_order, status, version, "
                        + "updated_by, updated_at) VALUES (?,?,?,?,?,CAST(? AS text[]),?,'ACTIVE',1,?,?)",
                term.code(), term.kind().name(), term.parentCode(), term.name(), term.description(), term.aliases().toArray(String[]::new),
                term.sortOrder(), actor, Sql.ts(now));
    }

    void updateTerm(AdminTerm term, UUID actor, Instant now) {
        jdbc.update("UPDATE adv_taxonomy.term SET parent_code = ?, name = ?, description = ?, aliases = CAST(? AS text[]), sort_order = ?, "
                        + "status = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE code = ?",
                term.parentCode(), term.name(), term.description(), term.aliases().toArray(String[]::new), term.sortOrder(),
                term.status().name(), actor, Sql.ts(now), term.code());
    }

    Optional<Row> tags(UUID menuItemId, boolean forUpdate) {
        return jdbc.query("SELECT " + TAG_COLUMNS + " FROM adv_taxonomy.dish_tags WHERE menu_item_id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                TaxonomyRepository::row, menuItemId).stream().findFirst();
    }

    List<Row> tags(List<UUID> menuItemIds) {
        if (menuItemIds.isEmpty()) return List.of();
        return jdbc.query("SELECT " + TAG_COLUMNS + " FROM adv_taxonomy.dish_tags WHERE menu_item_id = ANY(CAST(? AS uuid[])) ORDER BY menu_item_id",
                TaxonomyRepository::row, (Object) menuItemIds.stream().map(UUID::toString).toArray(String[]::new));
    }

    void insertTags(UUID menuItemId, UUID chefId, List<String> cuisines, List<String> diets, Instant now) {
        jdbc.update("INSERT INTO adv_taxonomy.dish_tags (menu_item_id, chef_id, cuisines, diets, set_by, version, updated_by, updated_at) "
                        + "VALUES (?,?,CAST(? AS text[]),CAST(? AS text[]),'CHEF',1,?,?)",
                menuItemId, chefId, cuisines.toArray(String[]::new), diets.toArray(String[]::new), chefId, Sql.ts(now));
    }

    void updateTags(UUID menuItemId, List<String> cuisines, List<String> diets, String setBy, UUID actor, Instant now) {
        jdbc.update("UPDATE adv_taxonomy.dish_tags SET cuisines = CAST(? AS text[]), diets = CAST(? AS text[]), set_by = ?, "
                        + "version = version + 1, updated_by = ?, updated_at = ? WHERE menu_item_id = ?",
                cuisines.toArray(String[]::new), diets.toArray(String[]::new), setBy, actor, Sql.ts(now), menuItemId);
    }

    void deleteTags(UUID menuItemId) {
        jdbc.update("DELETE FROM adv_taxonomy.dish_tags WHERE menu_item_id = ?", menuItemId);
    }

    /** Dishes with any of {@code cuisines} (null: any cuisine) and all of {@code diets}, in id order after {@code after}. */
    List<UUID> browse(String[] cuisines, String[] diets, UUID after, int limit) {
        List<Object> args = new ArrayList<>();
        StringBuilder sql = new StringBuilder("SELECT menu_item_id FROM adv_taxonomy.dish_tags WHERE diets @> CAST(? AS text[])");
        args.add(diets);
        if (cuisines != null) {
            sql.append(" AND cuisines && CAST(? AS text[])");
            args.add(cuisines);
        }
        sql.append(" AND menu_item_id > ? ORDER BY menu_item_id LIMIT ?");
        args.add(after == null ? new UUID(0, 0) : after);
        args.add(limit);
        return jdbc.queryForList(sql.toString(), UUID.class, args.toArray());
    }

    private static AdminTerm term(ResultSet rs, int i) throws SQLException {
        return new AdminTerm(rs.getString("code"), Kind.valueOf(rs.getString("kind")), rs.getString("parent_code"), rs.getString("name"),
                rs.getString("description"), strings(rs, "aliases"), rs.getInt("sort_order"), Status.valueOf(rs.getString("status")),
                rs.getLong("version"), Sql.instant(rs, "updated_at"));
    }

    private static Row row(ResultSet rs, int i) throws SQLException {
        return new Row(rs.getObject("menu_item_id", UUID.class), rs.getObject("chef_id", UUID.class), strings(rs, "cuisines"),
                strings(rs, "diets"), rs.getString("set_by"), rs.getLong("version"), Sql.instant(rs, "updated_at"));
    }

    private static List<String> strings(ResultSet rs, String column) throws SQLException {
        java.sql.Array array = rs.getArray(column);
        return array == null ? List.of() : List.of((String[]) array.getArray());
    }
}
