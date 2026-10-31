package in.craves.advanced.experiments;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.experiments.ExperimentDtos.DailyEventCount;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentStatus;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentVariant;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentView;
import in.craves.advanced.platform.data.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class ExperimentRepository {
    record Stored(ExperimentView view, UUID salt) { }

    record Counts(String variant, long people, long peopleWithEvent, long events) { }

    private static final String COLUMNS = "exp_key, description, variants::text AS variants, salt, status, version, created_at, updated_at, started_at, stopped_at";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    ExperimentRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    List<Stored> all() {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_experiments.experiment ORDER BY created_at DESC, exp_key", this::stored);
    }

    List<Stored> byKeys(List<String> keys) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_experiments.experiment WHERE exp_key = ANY(CAST(? AS text[]))", this::stored,
                (Object) keys.toArray(String[]::new));
    }

    Optional<Stored> one(String key, boolean forUpdate) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_experiments.experiment WHERE exp_key = ?" + (forUpdate ? " FOR UPDATE" : ""),
                this::stored, key).stream().findFirst();
    }

    boolean insert(String key, String description, List<ExperimentVariant> variants, UUID staff, Instant now) {
        return jdbc.update("INSERT INTO adv_experiments.experiment (exp_key, description, variants, salt, status, version, created_by, updated_by, "
                        + "created_at, updated_at) VALUES (?,?,CAST(? AS jsonb),?,'DRAFT',1,?,?,?,?) ON CONFLICT (exp_key) DO NOTHING",
                key, description, write(variants), UUID.randomUUID(), staff, staff, Sql.ts(now), Sql.ts(now)) == 1;
    }

    void updateDraft(String key, String description, List<ExperimentVariant> variants, UUID staff, Instant now) {
        jdbc.update("UPDATE adv_experiments.experiment SET description = ?, variants = CAST(? AS jsonb), version = version + 1, updated_by = ?, "
                + "updated_at = ? WHERE exp_key = ?", description, write(variants), staff, Sql.ts(now), key);
    }

    void transition(String key, ExperimentStatus to, UUID staff, Instant now) {
        String stamp = to == ExperimentStatus.RUNNING ? "started_at" : "stopped_at";
        jdbc.update("UPDATE adv_experiments.experiment SET status = ?, " + stamp + " = ?, version = version + 1, updated_by = ?, updated_at = ? "
                + "WHERE exp_key = ?", to.name(), Sql.ts(now), staff, Sql.ts(now), key);
    }

    /** Serialises one person's event batches with the erase of their data, so no batch can land after an erase. */
    void lockPerson(UUID person) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class, "adv_experiments:" + person);
    }

    int receivedSince(UUID person, Instant since) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM adv_experiments.event WHERE person_id = ? AND received_at >= ?", Integer.class,
                person, Sql.ts(since));
        return count == null ? 0 : count;
    }

    /** Absent or unreadable consent counts as no (M22: product analytics defaults off). */
    boolean analyticsConsent(UUID person) {
        try {
            return Boolean.TRUE.equals(jdbc.query("SELECT product_analytics FROM adv_taste_data.consent WHERE person_id = ?",
                    (rs, i) -> rs.getBoolean(1), person).stream().findFirst().orElse(false));
        } catch (DataAccessException unreadable) {
            return false;
        }
    }

    int insertEvent(UUID person, UUID clientEventId, String name, String experiment, String variant, Map<String, Object> properties,
                    Instant occurredAt, Instant now) {
        return jdbc.update("INSERT INTO adv_experiments.event (id, person_id, client_event_id, name, exp_key, variant, properties, occurred_at, "
                        + "received_at) VALUES (?,?,?,?,?,?,CAST(? AS jsonb),?,?) ON CONFLICT (person_id, client_event_id) DO NOTHING",
                UUID.randomUUID(), person, clientEventId, name, experiment, variant, write(properties == null ? Map.of() : properties),
                Sql.ts(occurredAt), Sql.ts(now));
    }

    List<Counts> results(String key, String eventName) {
        return jdbc.query("SELECT variant, count(DISTINCT person_id) AS people, count(DISTINCT person_id) FILTER (WHERE name = ?) AS with_event, "
                        + "count(*) FILTER (WHERE name = ?) AS events FROM adv_experiments.event WHERE exp_key = ? GROUP BY variant",
                (rs, i) -> new Counts(rs.getString("variant"), rs.getLong("people"), rs.getLong("with_event"), rs.getLong("events")),
                eventName, eventName, key);
    }

    /** Per India business day. Event counts are hidden with the people count, so one person's many events never show. */
    List<DailyEventCount> daily(String eventName, Instant from, Instant to) {
        return jdbc.query("SELECT (occurred_at AT TIME ZONE 'Asia/Kolkata')::date AS day, count(DISTINCT person_id) AS people, count(*) AS events "
                        + "FROM adv_experiments.event WHERE name = ? AND occurred_at >= ? AND occurred_at < ? GROUP BY 1 ORDER BY 1",
                (rs, i) -> {
                    Long people = ExperimentRules.suppress(rs.getLong("people"));
                    return new DailyEventCount(rs.getObject("day", java.time.LocalDate.class), people, people == null ? null : rs.getLong("events"));
                },
                eventName, Sql.ts(from), Sql.ts(to));
    }

    List<Map<String, Object>> eventsOf(UUID person) {
        return jdbc.queryForList("SELECT client_event_id AS \"eventId\", name, exp_key AS \"experimentKey\", variant, properties::text AS properties, "
                + "occurred_at AS \"occurredAt\" FROM adv_experiments.event WHERE person_id = ? ORDER BY occurred_at", person);
    }

    int deleteEventsOf(UUID person) {
        return jdbc.update("DELETE FROM adv_experiments.event WHERE person_id = ?", person);
    }

    private Stored stored(ResultSet rs, int i) throws SQLException {
        List<ExperimentVariant> variants;
        try {
            variants = json.readValue(rs.getString("variants"), new TypeReference<>() { });
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("unreadable variants", ex);
        }
        return new Stored(new ExperimentView(rs.getString("exp_key"), rs.getString("description"), variants,
                ExperimentStatus.valueOf(rs.getString("status")), rs.getLong("version"), Sql.instant(rs, "created_at"),
                Sql.instant(rs, "updated_at"), Sql.instant(rs, "started_at"), Sql.instant(rs, "stopped_at")),
                rs.getObject("salt", UUID.class));
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
