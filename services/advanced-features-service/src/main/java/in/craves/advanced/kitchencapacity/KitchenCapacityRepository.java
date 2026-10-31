package in.craves.advanced.kitchencapacity;

import in.craves.advanced.platform.data.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class KitchenCapacityRepository {
    record Batch(UUID id, UUID menuItemId, UUID kitchenId, UUID chefId, LocalDate serviceDate, int portions, Instant orderCutoff,
                 Instant readyAt, String status, long version) { }

    record Hold(UUID id, UUID batchId, UUID personId, int portions, String status, UUID orderId, Instant expiresAt) { }

    /** Portions held (unexpired) and confirmed on a batch. */
    record Taken(int held, int confirmed) {
        static final Taken NONE = new Taken(0, 0);
    }

    private static final String BATCH = "id, menu_item_id, kitchen_id, chef_id, service_date, portions, order_cutoff, ready_at, status, version";
    private static final String HOLD = "id, batch_id, person_id, portions, status, order_id, expires_at";
    private final JdbcTemplate jdbc;

    KitchenCapacityRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void insertBatch(Batch batch, Instant now) {
        jdbc.update("INSERT INTO adv_kitchen_capacity.batch (id, menu_item_id, kitchen_id, chef_id, service_date, portions, order_cutoff, ready_at, "
                        + "status, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'OPEN',1,?,?)",
                batch.id(), batch.menuItemId(), batch.kitchenId(), batch.chefId(), batch.serviceDate(), batch.portions(), Sql.ts(batch.orderCutoff()),
                Sql.ts(batch.readyAt()), Sql.ts(now), Sql.ts(now));
    }

    Optional<Batch> batch(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + BATCH + " FROM adv_kitchen_capacity.batch WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                KitchenCapacityRepository::batch, id).stream().findFirst();
    }

    List<Batch> batchesForItem(UUID menuItemId, LocalDate date) {
        return jdbc.query("SELECT " + BATCH + " FROM adv_kitchen_capacity.batch WHERE menu_item_id = ? AND service_date = ? ORDER BY created_at, id",
                KitchenCapacityRepository::batch, menuItemId, date);
    }

    List<Batch> batchesForKitchen(UUID kitchenId, LocalDate date) {
        return jdbc.query("SELECT " + BATCH + " FROM adv_kitchen_capacity.batch WHERE kitchen_id = ? AND service_date = ? ORDER BY created_at, id",
                KitchenCapacityRepository::batch, kitchenId, date);
    }

    void updateBatch(UUID id, int portions, Instant orderCutoff, Instant readyAt, String status, Instant now) {
        jdbc.update("UPDATE adv_kitchen_capacity.batch SET portions = ?, order_cutoff = ?, ready_at = ?, status = ?, version = version + 1, "
                + "updated_at = ? WHERE id = ?", portions, Sql.ts(orderCutoff), Sql.ts(readyAt), status, Sql.ts(now), id);
    }

    /** heldAfter: held portions count while their hold expires after this instant. */
    Map<UUID, Taken> taken(List<UUID> batchIds, Instant heldAfter) {
        Map<UUID, Taken> taken = new HashMap<>();
        if (batchIds.isEmpty()) return taken;
        jdbc.query("SELECT batch_id, coalesce(sum(portions) FILTER (WHERE status = 'HELD' AND expires_at > ?), 0) AS held, "
                        + "coalesce(sum(portions) FILTER (WHERE status = 'CONFIRMED'), 0) AS confirmed FROM adv_kitchen_capacity.hold "
                        + "WHERE batch_id = ANY(CAST(? AS uuid[])) GROUP BY batch_id",
                rs -> {
                    taken.put(rs.getObject("batch_id", UUID.class), new Taken(rs.getInt("held"), rs.getInt("confirmed")));
                }, Sql.ts(heldAfter), batchIds.stream().map(UUID::toString).toArray(String[]::new));
        return taken;
    }

    int personTaken(UUID batchId, UUID person, Instant heldAfter) {
        Integer taken = jdbc.queryForObject("SELECT coalesce(sum(portions), 0) FROM adv_kitchen_capacity.hold WHERE batch_id = ? AND person_id = ? "
                + "AND (status = 'CONFIRMED' OR (status = 'HELD' AND expires_at > ?))", Integer.class, batchId, person, Sql.ts(heldAfter));
        return taken == null ? 0 : taken;
    }

    List<Hold> holdsOfBatch(UUID batchId, Instant heldAfter) {
        return jdbc.query("SELECT " + HOLD + " FROM adv_kitchen_capacity.hold WHERE batch_id = ? "
                + "AND (status = 'CONFIRMED' OR (status = 'HELD' AND expires_at > ?)) ORDER BY created_at, id", KitchenCapacityRepository::hold,
                batchId, Sql.ts(heldAfter));
    }

    Optional<Hold> hold(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + HOLD + " FROM adv_kitchen_capacity.hold WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""),
                KitchenCapacityRepository::hold, id).stream().findFirst();
    }

    Optional<Hold> activeHold(UUID batchId, UUID person, Instant now) {
        return jdbc.query("SELECT " + HOLD + " FROM adv_kitchen_capacity.hold WHERE batch_id = ? AND person_id = ? AND status = 'HELD' "
                + "AND expires_at > ? LIMIT 1", KitchenCapacityRepository::hold, batchId, person, Sql.ts(now)).stream().findFirst();
    }

    void insertHold(Hold hold, Instant now) {
        jdbc.update("INSERT INTO adv_kitchen_capacity.hold (id, batch_id, person_id, portions, status, expires_at, created_at, updated_at) "
                + "VALUES (?,?,?,?,'HELD',?,?,?)", hold.id(), hold.batchId(), hold.personId(), hold.portions(), Sql.ts(hold.expiresAt()),
                Sql.ts(now), Sql.ts(now));
    }

    void setHold(UUID id, String status, UUID orderId, Instant now) {
        jdbc.update("UPDATE adv_kitchen_capacity.hold SET status = ?, order_id = coalesce(?, order_id), updated_at = ? WHERE id = ?",
                status, orderId, Sql.ts(now), id);
    }

    List<Hold> holdsOf(UUID person) {
        return jdbc.query("SELECT " + HOLD + " FROM adv_kitchen_capacity.hold WHERE person_id = ? ORDER BY created_at DESC",
                KitchenCapacityRepository::hold, person);
    }

    /** Deletes holds that no longer count and unlinks the rest from the person, so batch counts stay right. */
    int eraseHolds(UUID person, UUID erased, Instant now) {
        return jdbc.update("DELETE FROM adv_kitchen_capacity.hold WHERE person_id = ? AND (status = 'RELEASED' OR (status = 'HELD' AND expires_at <= ?))",
                person, Sql.ts(now))
                + jdbc.update("UPDATE adv_kitchen_capacity.hold SET person_id = ?, updated_at = ? WHERE person_id = ?", erased, Sql.ts(now), person);
    }

    Optional<KitchenCapacityDtos.KitchenLoad> load(UUID kitchenId) {
        return jdbc.query("SELECT extra_prep_minutes, until FROM adv_kitchen_capacity.kitchen_load WHERE kitchen_id = ?",
                (rs, i) -> new KitchenCapacityDtos.KitchenLoad(kitchenId, rs.getInt("extra_prep_minutes"), Sql.instant(rs, "until")), kitchenId)
                .stream().findFirst();
    }

    void saveLoad(UUID kitchenId, UUID chefId, int minutes, Instant until, Instant now) {
        jdbc.update("INSERT INTO adv_kitchen_capacity.kitchen_load (kitchen_id, chef_id, extra_prep_minutes, until, updated_at) VALUES (?,?,?,?,?) "
                        + "ON CONFLICT (kitchen_id) DO UPDATE SET chef_id = EXCLUDED.chef_id, extra_prep_minutes = EXCLUDED.extra_prep_minutes, "
                        + "until = EXCLUDED.until, updated_at = EXCLUDED.updated_at", kitchenId, chefId, minutes, Sql.ts(until), Sql.ts(now));
    }

    private static Batch batch(ResultSet rs, int i) throws SQLException {
        return new Batch(rs.getObject("id", UUID.class), rs.getObject("menu_item_id", UUID.class), rs.getObject("kitchen_id", UUID.class),
                rs.getObject("chef_id", UUID.class), rs.getObject("service_date", LocalDate.class), rs.getInt("portions"),
                Sql.instant(rs, "order_cutoff"), Sql.instant(rs, "ready_at"), rs.getString("status"), rs.getLong("version"));
    }

    private static Hold hold(ResultSet rs, int i) throws SQLException {
        return new Hold(rs.getObject("id", UUID.class), rs.getObject("batch_id", UUID.class), rs.getObject("person_id", UUID.class),
                rs.getInt("portions"), rs.getString("status"), rs.getObject("order_id", UUID.class), Sql.instant(rs, "expires_at"));
    }
}
