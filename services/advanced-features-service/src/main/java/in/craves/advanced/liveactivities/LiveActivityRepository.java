package in.craves.advanced.liveactivities;

import in.craves.advanced.liveactivities.LiveActivityDtos.LiveActivityView;
import in.craves.advanced.platform.data.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class LiveActivityRepository {
    private final JdbcTemplate jdbc;

    LiveActivityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Serialises one person's registrations (the active cap) with the erase of their data. */
    void lockPerson(UUID person) {
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class, "adv_live_activities:" + person);
    }

    int activeCount(UUID person, UUID exceptOrder) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM adv_live_activities.activity WHERE person_id = ? AND ended_at IS NULL AND order_id <> ?",
                Integer.class, person, exceptOrder);
        return count == null ? 0 : count;
    }

    /** Registering again (a new token for the same order) replaces the token and re-opens an ended activity. */
    void upsert(UUID person, UUID order, String token, Instant now) {
        jdbc.update("INSERT INTO adv_live_activities.activity (id, person_id, order_id, push_token, created_at, updated_at) VALUES (?,?,?,?,?,?) "
                        + "ON CONFLICT (person_id, order_id) DO UPDATE SET push_token = EXCLUDED.push_token, updated_at = EXCLUDED.updated_at, ended_at = NULL",
                UUID.randomUUID(), person, order, token, Sql.ts(now), Sql.ts(now));
    }

    /** Clears the token; the row stays as a record that the activity ran. */
    int end(UUID person, UUID order, Instant now) {
        return jdbc.update("UPDATE adv_live_activities.activity SET push_token = NULL, ended_at = ?, updated_at = ? "
                + "WHERE person_id = ? AND order_id = ? AND ended_at IS NULL", Sql.ts(now), Sql.ts(now), person, order);
    }

    int endStale(UUID person, Instant before, Instant now) {
        return jdbc.update("UPDATE adv_live_activities.activity SET push_token = NULL, ended_at = ?, updated_at = ? "
                + "WHERE person_id = ? AND ended_at IS NULL AND updated_at < ?", Sql.ts(now), Sql.ts(now), person, Sql.ts(before));
    }

    List<LiveActivityView> of(UUID person) {
        return jdbc.query("SELECT order_id, ended_at, created_at FROM adv_live_activities.activity WHERE person_id = ? ORDER BY created_at DESC, id LIMIT 200",
                LiveActivityRepository::view, person);
    }

    int deleteOf(UUID person) {
        return jdbc.update("DELETE FROM adv_live_activities.activity WHERE person_id = ?", person);
    }

    private static LiveActivityView view(ResultSet rs, int i) throws SQLException {
        Instant ended = Sql.instant(rs, "ended_at");
        return new LiveActivityView(rs.getObject("order_id", UUID.class), ended == null, Sql.instant(rs, "created_at"), ended);
    }
}
