package in.craves.advanced.orderamendments;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.AmendmentParty;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.AmendmentStatus;
import in.craves.advanced.orderamendments.OrderAmendmentDtos.OrderAmendmentLine;
import in.craves.advanced.platform.data.Sql;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class OrderAmendmentRepository {
    /** seq: the proposal's place in its order's sequence (1 for the first), so accepted changes replay in the order they were agreed. */
    record Row(UUID id, UUID orderId, int seq, UUID kitchenId, UUID customerId, AmendmentParty proposedBy, UUID proposerId,
               List<OrderAmendmentLine> changes, long foodDeltaPaise, String note, AmendmentStatus status, String answerNote, UUID answeredBy,
               Instant answeredAt, Instant expiresAt, long version, Instant createdAt) { }

    /** Advisory locks on a customer use the two-key form with this module's tag, apart from other modules' locks on the same person. */
    private static final int CUSTOMER_LOCK_SPACE = 0x4D313143;
    private static final TypeReference<List<OrderAmendmentLine>> LINES = new TypeReference<>() { };
    private static final String COLUMNS = "id, order_id, seq, kitchen_id, customer_id, proposed_by, proposer_id, changes::text AS changes, "
            + "food_delta_paise, note, status, answer_note, answered_by, answered_at, expires_at, version, created_at";
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    OrderAmendmentRepository(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Serialises proposals and answers on one order, so it never has two open proposals or two answers at once. */
    void lockOrder(UUID orderId) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(?)", orderId.getMostSignificantBits() ^ orderId.getLeastSignificantBits());
    }

    /** Taken before the order lock by proposals and alone by erasure, so erasing waits for a proposal being made right then. */
    void lockCustomer(UUID customerId) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(?, ?)", CUSTOMER_LOCK_SPACE, customerId.hashCode());
    }

    void insert(Row row, Instant now) {
        jdbc.update("INSERT INTO adv_order_amendments.amendment (id, order_id, seq, kitchen_id, customer_id, proposed_by, proposer_id, changes, "
                        + "food_delta_paise, note, status, expires_at, version, created_at, updated_at) "
                        + "VALUES (?,?,?,?,?,?,?,CAST(? AS jsonb),?,?,'PROPOSED',?,1,?,?)",
                row.id(), row.orderId(), row.seq(), row.kitchenId(), row.customerId(), row.proposedBy().name(), row.proposerId(), write(row.changes()),
                row.foodDeltaPaise(), row.note(), Sql.ts(row.expiresAt()), Sql.ts(now), Sql.ts(now));
    }

    Optional<Row> find(UUID id, boolean forUpdate) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_order_amendments.amendment WHERE id = ?" + (forUpdate ? " FOR UPDATE" : ""), this::row, id)
                .stream().findFirst();
    }

    /** In the order's sequence. */
    List<Row> ofOrder(UUID orderId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_order_amendments.amendment WHERE order_id = ? ORDER BY seq", this::row, orderId);
    }

    List<Row> ofCustomer(UUID customer, int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_order_amendments.amendment WHERE customer_id = ? ORDER BY created_at DESC, id LIMIT ?",
                this::row, customer, limit);
    }

    /** Customer proposals still waiting for these kitchens' answer, oldest first. */
    List<Row> awaitingKitchens(Collection<UUID> kitchenIds, Instant now, int limit) {
        if (kitchenIds.isEmpty()) return List.of();
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_order_amendments.amendment WHERE kitchen_id = ANY(CAST(? AS uuid[])) AND status = 'PROPOSED' "
                        + "AND proposed_by = 'CUSTOMER' AND expires_at > ? ORDER BY created_at, id LIMIT ?",
                this::row, kitchenIds.stream().map(UUID::toString).toArray(String[]::new), Sql.ts(now), limit);
    }

    void answer(UUID id, AmendmentStatus status, String answerNote, UUID answeredBy, Instant now) {
        jdbc.update("UPDATE adv_order_amendments.amendment SET status = ?, answer_note = ?, answered_by = ?, answered_at = ?, version = version + 1, "
                + "updated_at = ? WHERE id = ?", status.name(), answerNote, answeredBy, Sql.ts(now), Sql.ts(now), id);
    }

    List<Row> involving(UUID person) {
        return jdbc.query("SELECT " + COLUMNS + " FROM adv_order_amendments.amendment WHERE customer_id = ? OR proposer_id = ? OR answered_by = ? "
                + "ORDER BY created_at DESC, id", this::row, person, person, person);
    }

    /**
     * The customer's proposals and answers that never took effect are deleted; accepted ones belong to the order, so they stay
     * without the person and without any notes. A chef who erases is unlinked from what they proposed or answered. Returns the
     * number of rows touched (each once).
     */
    int erase(UUID person, UUID erased, Instant now) {
        int deleted = jdbc.update("DELETE FROM adv_order_amendments.amendment WHERE customer_id = ? AND status <> 'ACCEPTED'", person);
        // One statement, so a row is counted once; every CASE reads the row as it was before this update.
        int unlinked = jdbc.update("UPDATE adv_order_amendments.amendment SET "
                        + "note = CASE WHEN customer_id = ? THEN NULL ELSE note END, "
                        + "answer_note = CASE WHEN customer_id = ? THEN NULL ELSE answer_note END, "
                        + "changes = CASE WHEN customer_id = ? THEN (SELECT coalesce(jsonb_agg(item - 'note' ORDER BY idx), '[]'::jsonb) "
                        + "FROM jsonb_array_elements(changes) WITH ORDINALITY AS line(item, idx)) ELSE changes END, "
                        + "customer_id = CASE WHEN customer_id = ? THEN ? ELSE customer_id END, "
                        + "proposer_id = CASE WHEN proposer_id = ? THEN ? ELSE proposer_id END, "
                        + "answered_by = CASE WHEN answered_by = ? THEN ? ELSE answered_by END, "
                        + "updated_at = ? WHERE customer_id = ? OR proposer_id = ? OR answered_by = ?",
                person, person, person, person, erased, person, erased, person, erased, Sql.ts(now), person, person, person);
        return deleted + unlinked;
    }

    private Row row(ResultSet rs, int i) throws SQLException {
        return new Row(rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class), rs.getInt("seq"), rs.getObject("kitchen_id", UUID.class),
                rs.getObject("customer_id", UUID.class), AmendmentParty.valueOf(rs.getString("proposed_by")), rs.getObject("proposer_id", UUID.class),
                read(rs.getString("changes")), rs.getLong("food_delta_paise"), rs.getString("note"), AmendmentStatus.valueOf(rs.getString("status")),
                rs.getString("answer_note"), rs.getObject("answered_by", UUID.class), Sql.instant(rs, "answered_at"), Sql.instant(rs, "expires_at"),
                rs.getLong("version"), Sql.instant(rs, "created_at"));
    }

    private String write(List<OrderAmendmentLine> changes) {
        try {
            return json.writeValueAsString(changes);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private List<OrderAmendmentLine> read(String changes) {
        try {
            return json.readValue(changes, LINES);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored amendment changes are unreadable", ex);
        }
    }
}
