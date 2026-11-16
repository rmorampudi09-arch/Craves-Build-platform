package in.craves.integration.delivery.command;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The courier booking journal (V191): one row per booking attempt, committed before the courier is called. Every state
 * change is a compare-and-set, so only the caller whose update changed a row acts on it. Two partial unique indexes hold
 * the rules: one unresolved booking per order, and a courier booked again for an order only after refusals.
 */
@Repository
public class ProviderCreateAttemptRepository {
    public static final String INTENT = "INTENT";
    public static final String UNKNOWN = "UNKNOWN";
    public static final String REJECTED = "REJECTED";
    public static final String ORPHAN_SUSPECT = "ORPHAN_SUSPECT";
    /** After this many refusals a courier is used up for the order: the fleet's re-booking retries every 5 seconds. */
    static final int MAX_ATTEMPTS = 3;

    private static final String TABLE = "delivery_schema.provider_create_attempt";
    private static final String COLUMNS = "chef_sub_order_id, provider_id, attempt_no, client_ref, state, provider_ref, created_at, updated_at";
    private static final RowMapper<Attempt> ROW = (rs, row) -> new Attempt(rs.getObject("chef_sub_order_id", UUID.class),
        rs.getString("provider_id"), rs.getInt("attempt_no"), rs.getString("client_ref"), rs.getString("state"),
        rs.getString("provider_ref"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant());

    private final JdbcTemplate jdbc;
    private final DeliveryCommandProperties properties;

    public ProviderCreateAttemptRepository(JdbcTemplate jdbc, DeliveryCommandProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    /** CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED: every caller asks here before any journal branch. */
    public boolean enabled() {
        return properties.isBookingJournalEnabled();
    }

    /** 26 characters: both halves of the order id in base 36. With the attempt digit it fits Borzo's 32-character limit. */
    static String clientRefPrefix(UUID chefSubOrderId) {
        return base36(chefSubOrderId.getMostSignificantBits()) + base36(chefSubOrderId.getLeastSignificantBits());
    }

    private static String base36(long half) {
        String digits = Long.toUnsignedString(half, 36);
        return "0".repeat(13 - digits.length()) + digits;
    }

    /** Whether one courier may be booked (again) for the order, given all its rows: only refusals, none later found, under the cap. */
    static boolean bookable(List<Attempt> rowsOfOneCourier) {
        return rowsOfOneCourier.size() < MAX_ATTEMPTS && rowsOfOneCourier.stream()
            .allMatch(row -> REJECTED.equals(row.state()) && row.providerRef() == null);
    }

    public List<Attempt> forOrder(UUID chefSubOrderId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM " + TABLE + " WHERE chef_sub_order_id = ? ORDER BY provider_id, attempt_no",
            ROW, chefSubOrderId);
    }

    public Optional<Attempt> find(String providerId, String clientRef) {
        return jdbc.query("SELECT " + COLUMNS + " FROM " + TABLE + " WHERE provider_id = ? AND client_ref = ?", ROW, providerId, clientRef)
            .stream().findFirst();
    }

    /** The next attempt for the order and courier, as INTENT, committed before the caller calls the courier. Empty when an index or the cap refuses it. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<Attempt> begin(UUID chefSubOrderId, String providerId) {
        return jdbc.query("""
            INSERT INTO delivery_schema.provider_create_attempt (chef_sub_order_id, provider_id, attempt_no, client_ref, state)
            SELECT CAST(? AS uuid), CAST(? AS varchar), next.n, CAST(? AS varchar) || next.n, 'INTENT'
            FROM (SELECT COALESCE(max(attempt_no), 0) + 1 AS n FROM delivery_schema.provider_create_attempt
                  WHERE chef_sub_order_id = ? AND provider_id = ?) next
            WHERE next.n <= ?
            ON CONFLICT DO NOTHING
            RETURNING\s""" + COLUMNS, ROW, chefSubOrderId, providerId, clientRefPrefix(chefSubOrderId), chefSubOrderId, providerId,
            MAX_ATTEMPTS).stream().findFirst();
    }

    /** Compare-and-set by primary key. nextCheckAt null clears any due check; error null keeps the last one. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean move(Attempt attempt, Set<String> from, String to, String error, Instant nextCheckAt) {
        List<Object> arguments = new ArrayList<>(List.of(to));
        arguments.add(timestamp(nextCheckAt));
        arguments.add(error == null ? null : error.substring(0, Math.min(500, error.length())));
        arguments.add(attempt.chefSubOrderId());
        arguments.add(attempt.providerId());
        arguments.add(attempt.attemptNo());
        arguments.addAll(from);
        return jdbc.update("UPDATE " + TABLE + " SET state = ?, updated_at = now(), next_check_at = ?, error = COALESCE(?, error) "
            + "WHERE chef_sub_order_id = ? AND provider_id = ? AND attempt_no = ? AND state IN (" + "?, ".repeat(from.size() - 1) + "?)",
            arguments.toArray()) == 1;
    }

    /**
     * The booking is the order's delivery job: call inside the transaction that writes the job, so a row never says
     * "booked" without one. At most one row per order and courier is in these states (the per-courier index).
     */
    public boolean confirm(UUID chefSubOrderId, String providerId, String providerRef) {
        return jdbc.update("UPDATE " + TABLE + " SET state = CASE WHEN state = 'INTENT' THEN 'CONFIRMED' ELSE 'ADOPTED' END, "
            + "provider_ref = ?, next_check_at = NULL, updated_at = now() "
            + "WHERE chef_sub_order_id = ? AND provider_id = ? AND state IN ('INTENT', 'UNKNOWN', 'ORPHAN_SUSPECT')",
            providerRef, chefSubOrderId, providerId) == 1;
    }

    /** A booking that was made but is not the order's job (another job got there first): kept on record for a person to cancel. */
    public boolean stray(UUID chefSubOrderId, String providerId, String providerRef) {
        return jdbc.update("UPDATE " + TABLE + " SET state = 'ORPHAN_SUSPECT', provider_ref = ?, next_check_at = NULL, updated_at = now() "
            + "WHERE chef_sub_order_id = ? AND provider_id = ? AND state IN ('INTENT', 'UNKNOWN')", providerRef, chefSubOrderId, providerId) == 1;
    }

    /**
     * Unresolved rows nobody is working on (the order's command finished or died without resolving them) become orphan
     * suspects with a lookup due now. 15 minutes is longer than the command's 10-minute lease.
     */
    public int sweepAbandoned() {
        return jdbc.update("""
            UPDATE delivery_schema.provider_create_attempt a
            SET state = 'ORPHAN_SUSPECT', next_check_at = now(), updated_at = now()
            WHERE a.state IN ('INTENT', 'UNKNOWN') AND a.updated_at < now() - INTERVAL '15 minutes'
              AND NOT EXISTS (SELECT 1 FROM delivery_schema.delivery_command c
                              WHERE c.chef_sub_order_id = a.chef_sub_order_id AND c.status IN ('PROCESSING', 'RECONCILIATION_PENDING'))
            """);
    }

    /**
     * Rows whose lookup is due, each handed to one replica. An orphan suspect is due again every 5 minutes until it is
     * 2 hours old; any other row is not due again unless the caller says so (checkAgain). updated_at is left alone.
     */
    public List<Attempt> claimDueChecks(int limit) {
        return jdbc.query("""
            WITH due AS (
                SELECT chef_sub_order_id, provider_id, attempt_no FROM delivery_schema.provider_create_attempt
                WHERE next_check_at <= now() AND state IN ('ORPHAN_SUSPECT', 'REJECTED')
                ORDER BY next_check_at FOR UPDATE SKIP LOCKED LIMIT ?
            )
            UPDATE delivery_schema.provider_create_attempt a
            SET next_check_at = CASE WHEN a.state = 'ORPHAN_SUSPECT' AND a.created_at > now() - INTERVAL '2 hours'
                                     THEN now() + INTERVAL '5 minutes' END
            FROM due
            WHERE a.chef_sub_order_id = due.chef_sub_order_id AND a.provider_id = due.provider_id AND a.attempt_no = due.attempt_no
            RETURNING a.chef_sub_order_id, a.provider_id, a.attempt_no, a.client_ref, a.state, a.provider_ref, a.created_at, a.updated_at
            """, ROW, limit);
    }

    /** A lookup found the booking at the courier: its id is kept, and the courier is no longer bookable for the order. */
    public void foundAt(Attempt attempt, String providerRef) {
        jdbc.update("UPDATE " + TABLE + " SET provider_ref = ?, next_check_at = NULL WHERE chef_sub_order_id = ? AND provider_id = ? "
            + "AND attempt_no = ?", providerRef, attempt.chefSubOrderId(), attempt.providerId(), attempt.attemptNo());
    }

    public void checkAgain(Attempt attempt, Instant at) {
        jdbc.update("UPDATE " + TABLE + " SET next_check_at = ? WHERE chef_sub_order_id = ? AND provider_id = ? AND attempt_no = ?",
            timestamp(at), attempt.chefSubOrderId(), attempt.providerId(), attempt.attemptNo());
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    public record Attempt(UUID chefSubOrderId, String providerId, int attemptNo, String clientRef, String state, String providerRef,
                          Instant createdAt, Instant updatedAt) {}
}
