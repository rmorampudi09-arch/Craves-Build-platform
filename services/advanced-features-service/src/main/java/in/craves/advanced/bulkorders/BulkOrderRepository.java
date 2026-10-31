package in.craves.advanced.bulkorders;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderLine;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderPolicy;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderPolicyView;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderStatus;
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
class BulkOrderRepository {
    record Row(UUID id, UUID customerId, UUID kitchenId, Instant eventAt, Integer guests, String notes, List<BulkOrderLine> lines,
               BulkOrderStatus status, Long totalPaise, Long depositPaise, Integer depositPercent, Instant quoteValidUntil, String quoteNote,
               String declineReason, long version, Instant createdAt) { }

    private static final TypeReference<List<BulkOrderLine>> LINES = new TypeReference<>() { };
    private static final String COLUMNS = "id, customer_id, kitchen_id, event_at, guests, notes, lines::text AS lines, status, total_paise, "
            + "deposit_paise, deposit_percent, quote_valid_until, quote_note, decline_reason, version, created_at";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    BulkOrderRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    Optional<BulkOrderPolicyView> policy() {
        return jdbc.query("SELECT version, min_portions, min_lead_hours, max_days_ahead, deposit_percent, created_at FROM adv_bulk_orders.policy "
                        + "ORDER BY version DESC LIMIT 1",
                (rs, i) -> new BulkOrderPolicyView(rs.getLong("version"), rs.getInt("min_portions"), rs.getInt("min_lead_hours"),
                        rs.getInt("max_days_ahead"), rs.getInt("deposit_percent"), Sql.instant(rs, "created_at"))).stream().findFirst();
    }

    /** Every change is a new version; two at once collide on the key and one is refused. */
    long insertPolicy(BulkOrderPolicy policy, UUID actor, Instant now) {
        return jdbc.queryForObject("INSERT INTO adv_bulk_orders.policy (version, min_portions, min_lead_hours, max_days_ahead, deposit_percent, "
                        + "created_by, created_at) SELECT coalesce(max(version), 0) + 1, ?, ?, ?, ?, ?, ? FROM adv_bulk_orders.policy RETURNING version",
                Long.class, policy.minPortions(), policy.minLeadHours(), policy.maxDaysAhead(), policy.depositPercent(), actor, Sql.ts(now));
    }

    void insert(Row row, long policyVersion, Instant now) {
        jdbc.update("INSERT INTO adv_bulk_orders.request (id, customer_id, kitchen_id, event_at, guests, notes, lines, status, policy_version, version, "
                        + "created_at, updated_at) VALUES (?,?,?,?,?,?,CAST(? AS jsonb),'REQUESTED',?,1,?,?)",
                row.id(), row.customerId(), row.kitchenId(), Sql.ts(row.eventAt()), row.guests(), row.notes(), write(row.lines()), policyVersion,
                Sql.ts(now), Sql.ts(now));
    }

    Optional<Row> find(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_bulk_orders.request WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""), this::row, id)
                .stream().findFirst();
    }

    List<Row> ofCustomer(UUID customer, int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_bulk_orders.request WHERE customer_id = ? ORDER BY created_at DESC, id LIMIT ?",
                this::row, customer, limit);
    }

    List<Row> ofKitchen(UUID kitchen, int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_bulk_orders.request WHERE kitchen_id = ? ORDER BY created_at DESC, id LIMIT ?",
                this::row, kitchen, limit);
    }

    /** Asked or quoted, with the event still ahead (lapsed requests never block new ones). */
    int openCount(UUID customer, Instant now) {
        Integer open = jdbc.queryForObject("SELECT count(*) FROM adv_bulk_orders.request WHERE customer_id = ? AND status IN ('REQUESTED', 'QUOTED') "
                + "AND event_at > ?", Integer.class, customer, Sql.ts(now));
        return open == null ? 0 : open;
    }

    void quote(UUID id, List<BulkOrderLine> lines, long total, long deposit, int depositPercent, long policyVersion, Instant validUntil, String note,
               Instant now) {
        jdbc.update("UPDATE adv_bulk_orders.request SET lines = CAST(? AS jsonb), status = 'QUOTED', total_paise = ?, deposit_paise = ?, "
                        + "deposit_percent = ?, policy_version = ?, quote_valid_until = ?, quote_note = ?, version = version + 1, updated_at = ? WHERE id = ?",
                write(lines), total, deposit, depositPercent, policyVersion, Sql.ts(validUntil), note, Sql.ts(now), id);
    }

    void setStatus(UUID id, BulkOrderStatus status, String declineReason, Instant now) {
        jdbc.update("UPDATE adv_bulk_orders.request SET status = ?, decline_reason = coalesce(?, decline_reason), version = version + 1, updated_at = ? "
                + "WHERE id = ?", status.name(), declineReason, Sql.ts(now), id);
    }

    /** Deletes the person's requests except accepted ones still to be cooked; those are unlinked from the person and lose their notes. */
    int erase(UUID customer, UUID erased, Instant now) {
        return jdbc.update("DELETE FROM adv_bulk_orders.request WHERE customer_id = ? AND NOT (status = 'ACCEPTED' AND event_at > ?)", customer, Sql.ts(now))
                + jdbc.update("UPDATE adv_bulk_orders.request SET customer_id = ?, notes = NULL, updated_at = ? WHERE customer_id = ?",
                erased, Sql.ts(now), customer);
    }

    private Row row(ResultSet rs, int i) throws SQLException {
        return new Row(rs.getObject("id", UUID.class), rs.getObject("customer_id", UUID.class), rs.getObject("kitchen_id", UUID.class),
                Sql.instant(rs, "event_at"), rs.getObject("guests", Integer.class), rs.getString("notes"), read(rs.getString("lines")),
                BulkOrderStatus.valueOf(rs.getString("status")), rs.getObject("total_paise", Long.class), rs.getObject("deposit_paise", Long.class),
                rs.getObject("deposit_percent", Integer.class), Sql.instant(rs, "quote_valid_until"), rs.getString("quote_note"),
                rs.getString("decline_reason"), rs.getLong("version"), Sql.instant(rs, "created_at"));
    }

    private String write(List<BulkOrderLine> lines) {
        try {
            return json.writeValueAsString(lines);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private List<BulkOrderLine> read(String lines) {
        try {
            return json.readValue(lines, LINES);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored bulk-order lines are unreadable", ex);
        }
    }
}
