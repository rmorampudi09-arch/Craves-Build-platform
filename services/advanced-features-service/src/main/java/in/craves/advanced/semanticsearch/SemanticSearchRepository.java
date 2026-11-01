package in.craves.advanced.semanticsearch;

import in.craves.advanced.platform.data.Sql;
import in.craves.advanced.semanticsearch.SemanticSearchDtos.SearchConceptView;
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
class SemanticSearchRepository {
    private static final String COLUMNS = "id, phrase, search_terms, food_type, spice_level, category, active, version, updated_at";
    /** shortcut: concepts are read on every search; cache them per replica if the table grows past a few thousand rows. */
    static final int MAX_CONCEPTS = 5000;
    private final JdbcTemplate jdbc;

    SemanticSearchRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<SearchConceptView> all() {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_semantic_search.concept ORDER BY phrase", SemanticSearchRepository::view);
    }

    List<SearchConceptView> active() {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_semantic_search.concept WHERE active ORDER BY phrase LIMIT " + MAX_CONCEPTS,
                SemanticSearchRepository::view);
    }

    Optional<SearchConceptView> one(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_semantic_search.concept WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                SemanticSearchRepository::view, id).stream().findFirst();
    }

    boolean phraseTaken(String phrase, UUID except) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM adv_semantic_search.concept WHERE phrase = ? AND id <> ?)",
                Boolean.class, phrase, except));
    }

    void insert(SearchConceptView c, UUID staff, Instant now) {
        jdbc.update("INSERT INTO adv_semantic_search.concept (id, phrase, search_terms, food_type, spice_level, category, active, version, updated_by, "
                        + "updated_at) VALUES (?,?,CAST(? AS text[]),?,?,?,?,1,?,?)", c.id(), c.phrase(), c.searchTerms().toArray(String[]::new),
                c.foodType(), c.spiceLevel(), c.category(), c.active(), staff, Sql.ts(now));
    }

    void update(SearchConceptView c, UUID staff, Instant now) {
        jdbc.update("UPDATE adv_semantic_search.concept SET phrase = ?, search_terms = CAST(? AS text[]), food_type = ?, spice_level = ?, category = ?, "
                        + "active = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?", c.phrase(),
                c.searchTerms().toArray(String[]::new), c.foodType(), c.spiceLevel(), c.category(), c.active(), staff, Sql.ts(now), c.id());
    }

    private static SearchConceptView view(ResultSet rs, int i) throws SQLException {
        return new SearchConceptView(rs.getObject("id", UUID.class), rs.getString("phrase"),
                List.copyOf(Arrays.asList((String[]) rs.getArray("search_terms").getArray())), rs.getString("food_type"), rs.getString("spice_level"),
                rs.getString("category"), rs.getBoolean("active"), rs.getLong("version"), Sql.instant(rs, "updated_at"));
    }
}
