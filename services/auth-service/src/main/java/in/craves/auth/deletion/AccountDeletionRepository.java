package in.craves.auth.deletion;

import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.DeletionStep;
import in.craves.auth.deletion.DeletionModel.Phase;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.StepStatus;
import in.craves.auth.deletion.DeletionModel.Via;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * Hand-written SQL for the deletion tables. Every call is one short statement: the Hikari pool is 3 and no
 * call here may be held across an HTTP call. Only {@link #lockOpen} needs the caller's transaction.
 */
@Repository
public class AccountDeletionRepository {
    private static final String OPEN = "('PENDING_REVIEW', 'SCHEDULED', 'WAITING_ON_OPEN_ITEMS', 'ERASING')";
    private static final String REQUEST_COLUMNS =
        "id, identity_id, scope, status, requested_via, requested_at, due_at, reviewed_by, reviewed_at, review_note, "
            + "blockers_json, next_check_at, locked_at, reminder_sent_at, final_notice_sent_at, completed_at, cancelled_at";
    /** The columns {@link #transition} may set besides status: names go into the SQL text, so they are a closed list. */
    private static final Set<String> SETTABLE = Set.of(
        "due_at", "reviewed_by", "reviewed_at", "review_note", "blockers_json", "next_check_at", "locked_at",
        "reminder_sent_at", "final_notice_sent_at", "completed_at", "cancelled_at");

    private static final RowMapper<DeletionRequest> REQUEST = (rs, n) -> new DeletionRequest(
        rs.getObject("id", UUID.class), rs.getObject("identity_id", UUID.class),
        Scope.valueOf(rs.getString("scope")), RequestStatus.valueOf(rs.getString("status")),
        Via.valueOf(rs.getString("requested_via")), instant(rs, "requested_at"), instant(rs, "due_at"),
        rs.getObject("reviewed_by", UUID.class), instant(rs, "reviewed_at"), rs.getString("review_note"),
        rs.getString("blockers_json"), instant(rs, "next_check_at"), instant(rs, "locked_at"),
        instant(rs, "reminder_sent_at"), instant(rs, "final_notice_sent_at"), instant(rs, "completed_at"),
        instant(rs, "cancelled_at"));

    private static final RowMapper<DeletionStep> STEP = (rs, n) -> new DeletionStep(
        rs.getObject("request_id", UUID.class), Phase.valueOf(rs.getString("phase")), rs.getString("service"),
        StepStatus.valueOf(rs.getString("status")), rs.getInt("attempts"), rs.getString("last_error"),
        rs.getObject("erased_count", Integer.class), instant(rs, "next_attempt_at"), instant(rs, "completed_at"));

    private final JdbcTemplate jdbc;

    public AccountDeletionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<DeletionRequest> findOpen(UUID identityId) {
        return one("identity_id = ? AND status IN " + OPEN, identityId);
    }

    public Optional<DeletionRequest> findLatest(UUID identityId) {
        return one("identity_id = ? ORDER BY requested_at DESC, id DESC LIMIT 1", identityId);
    }

    public Optional<DeletionRequest> find(UUID requestId) {
        return one("id = ?", requestId);
    }

    /**
     * The open request, locked. Call inside a transaction. The identity row is locked first: with no open request
     * there is nothing else to lock, and this is what makes two concurrent "request" calls take turns.
     */
    public Optional<DeletionRequest> lockOpen(UUID identityId) {
        jdbc.queryForList("SELECT id FROM auth_identity WHERE id = ? FOR UPDATE", identityId);
        return one("identity_id = ? AND status IN " + OPEN + " FOR UPDATE", identityId);
    }

    /** Throws DuplicateKeyException when the identity already has an open request. {@code dueAt} is null while PENDING_REVIEW. */
    public DeletionRequest insert(UUID identityId, Scope scope, RequestStatus status, Via via, Instant requestedAt, Instant dueAt) {
        return jdbc.queryForObject(
            "INSERT INTO account_deletion_request (id, identity_id, scope, status, requested_via, requested_at, due_at) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING " + REQUEST_COLUMNS,
            REQUEST, UUID.randomUUID(), identityId, scope.name(), status.name(), via.name(), ts(requestedAt), ts(dueAt));
    }

    /** Rows that exist already are left alone, so a retry never resets a step's progress. */
    public void insertSteps(UUID requestId, Phase phase, List<String> services, Instant runAfter) {
        jdbc.batchUpdate(
            "INSERT INTO account_deletion_step (request_id, phase, service, next_attempt_at) VALUES (?, ?, ?, ?) "
                + "ON CONFLICT DO NOTHING",
            services, services.size(), (ps, service) -> {
                ps.setObject(1, requestId);
                ps.setString(2, phase.name());
                ps.setString(3, service);
                ps.setTimestamp(4, ts(runAfter));
            });
    }

    /** In lifecycle order (PREPARE, ERASE, RELEASE, SWEEP), then service: the first step not DONE is the next one to run. */
    public List<DeletionStep> steps(UUID requestId) {
        return jdbc.query(
            "SELECT request_id, phase, service, status, attempts, last_error, erased_count, next_attempt_at, completed_at "
                + "FROM account_deletion_step WHERE request_id = ? "
                + "ORDER BY CASE phase WHEN 'PREPARE' THEN 1 WHEN 'ERASE' THEN 2 WHEN 'RELEASE' THEN 3 ELSE 4 END, service",
            STEP, requestId);
    }

    /**
     * Moves a request from one status to another and sets the extra columns (keys from {@link #SETTABLE}; Instant values
     * are converted) in the same statement. False when the request was not in {@code from}. {@code from == to} just sets columns.
     */
    public boolean transition(UUID requestId, RequestStatus from, RequestStatus to, Consumer<Map<String, Object>> extraColumns) {
        Map<String, Object> extra = new LinkedHashMap<>();
        extraColumns.accept(extra);
        StringBuilder sql = new StringBuilder("UPDATE account_deletion_request SET status = ?, updated_at = now()");
        List<Object> args = new ArrayList<>();
        args.add(to.name());
        extra.forEach((column, value) -> {
            if (!SETTABLE.contains(column)) throw new IllegalArgumentException("Column cannot be set: " + column);
            sql.append(", ").append(column).append(" = ?");
            args.add(value instanceof Instant instant ? ts(instant) : value);
        });
        sql.append(" WHERE id = ? AND status = ?");
        args.add(requestId);
        args.add(from.name());
        return jdbc.update(sql.toString(), args.toArray()) == 1;
    }

    private static final String CLAIM_DUE = """
        UPDATE account_deletion_request
           SET lease_until = ?, updated_at = now()
         WHERE id IN (
               SELECT r.id
                 FROM account_deletion_request r
                WHERE (r.lease_until IS NULL OR r.lease_until <= ?)
                  AND (EXISTS (SELECT 1 FROM account_deletion_step s
                                WHERE s.request_id = r.id AND s.status IN ('PENDING', 'BLOCKED')
                                  AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= ?)
                                  AND (s.phase IN ('RELEASE', 'SWEEP') OR r.status IN %s))
                       OR (r.status = 'ERASING'
                           AND NOT EXISTS (SELECT 1 FROM account_deletion_step s
                                            WHERE s.request_id = r.id AND s.status IN ('PENDING', 'BLOCKED')))
                       OR (r.status = 'SCHEDULED'
                           AND (r.due_at <= ? OR (r.reminder_sent_at IS NULL AND r.due_at <= ?)))
                       OR (r.status = 'WAITING_ON_OPEN_ITEMS' AND (r.next_check_at IS NULL OR r.next_check_at <= ?)))
                ORDER BY r.updated_at, r.id
                LIMIT ?
                  FOR UPDATE OF r SKIP LOCKED)
        RETURNING id
        """.formatted(OPEN);

    /**
     * Leases up to {@code limit} requests with work due at {@code now} until {@code now + lease} and returns their ids.
     * One statement with SKIP LOCKED: two workers never get the same request, and a lease that ran out is claimable again.
     * Work due, where a NULL time means "due now":
     * a step not DONE whose next_attempt_at has come (PREPARE and ERASE only while the request is open; RELEASE and SWEEP
     * outlive it, so they count in any status); an ERASING request with no step left to run (a crash after the last step or
     * before the first one: the worker finishes or re-creates them); the day-30 check or a reminder of a SCHEDULED request;
     * the daily re-check of a waiting request. Least recently touched first. The reminder is due {@code reminderLead} before due_at.
     */
    public List<UUID> claimDue(Instant now, int limit, Duration lease, Duration reminderLead) {
        Timestamp at = ts(now);
        return jdbc.queryForList(CLAIM_DUE, UUID.class, ts(now.plus(lease)), at, at, at, ts(now.plus(reminderLead)), at, limit);
    }

    /**
     * Ends a claim once its work is recorded, so the next due work is picked up at the next tick, not when the lease runs out.
     * {@code leaseUntil} is the claim's own lease ({@code now + lease} of {@link #claimDue}): a worker that overran it and
     * releases late leaves the newer lease of the worker that claimed the request since.
     */
    public void releaseLease(UUID requestId, Instant leaseUntil) {
        jdbc.update("UPDATE account_deletion_request SET lease_until = NULL WHERE id = ? AND lease_until = ?", requestId, ts(leaseUntil));
    }

    /**
     * Records one call's result. A non-null {@code error} is a failed attempt: attempts + 1. BLOCKED and DONE leave attempts alone.
     * The error is cut to the column size; callers pass codes (HTTP 503, TIMEOUT), never body text.
     * A step already DONE is never changed: a late answer from a worker that overran its lease cannot undo it.
     */
    public void recordStep(UUID requestId, Phase phase, String service, StepStatus status, Integer erasedCount, String error, Instant nextAttemptAt) {
        String completedAt = status == StepStatus.DONE ? "now()" : "NULL";
        int updated = jdbc.update(
            "UPDATE account_deletion_step SET status = ?, attempts = attempts + ?, last_error = ?, erased_count = ?, "
                + "next_attempt_at = ?, completed_at = " + completedAt + ", updated_at = now() "
                + "WHERE request_id = ? AND phase = ? AND service = ? AND status <> 'DONE'",
            status.name(), error == null ? 0 : 1, error == null || error.length() <= 300 ? error : error.substring(0, 300),
            erasedCount, ts(nextAttemptAt), requestId, phase.name(), service);
        if (updated == 0 && jdbc.queryForObject("SELECT count(*) FROM account_deletion_step WHERE request_id = ? AND phase = ? "
                + "AND service = ?", Integer.class, requestId, phase.name(), service) == 0) {
            throw new IllegalStateException("Deletion step not found: " + requestId + " " + phase + " " + service);
        }
    }

    /** True while the customer side of this person is being erased: sign-in must not give the customer role back. */
    public boolean hasErasingCustomerSide(UUID identityId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM account_deletion_request "
                + "WHERE identity_id = ? AND status = 'ERASING' AND scope IN ('CUSTOMER', 'ALL'))",
            Boolean.class, identityId));
    }

    /** Oldest first by (requested_at, id); a null {@code status} means any, a null {@code afterRequestedAt} means from the start. */
    public List<DeletionRequest> page(RequestStatus status, Instant afterRequestedAt, UUID afterId, int limit) {
        StringBuilder sql = new StringBuilder("SELECT " + REQUEST_COLUMNS + " FROM account_deletion_request WHERE true");
        List<Object> args = new ArrayList<>();
        if (status != null) {
            sql.append(" AND status = ?");
            args.add(status.name());
        }
        if (afterRequestedAt != null) {
            sql.append(" AND (requested_at, id) > (?, ?)");
            args.add(ts(afterRequestedAt));
            args.add(afterId);
        }
        sql.append(" ORDER BY requested_at, id LIMIT ?");
        args.add(limit);
        return jdbc.query(sql.toString(), REQUEST, args.toArray());
    }

    private Optional<DeletionRequest> one(String where, Object... args) {
        return jdbc.query("SELECT " + REQUEST_COLUMNS + " FROM account_deletion_request WHERE " + where, REQUEST, args)
            .stream().findFirst();
    }

    private static Timestamp ts(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
