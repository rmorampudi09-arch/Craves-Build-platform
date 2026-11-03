package in.craves.integration.admin.deliveryexceptions;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * M25: operations open a case on a delivery job, acknowledge, assign, request a reassignment to another active provider,
 * then resolve or dismiss it. Recording only: nothing here books, cancels or re-dispatches a delivery (owner decision,
 * docs/advanced-features/modules.md), so a case can never cause a second rider or a second provider charge.
 */
@Service
public class DeliveryExceptionService {
    public enum Reason { PICKUP_DELAYED, RIDER_NOT_ASSIGNED, RIDER_UNREACHABLE, CUSTOMER_UNREACHABLE, ADDRESS_ISSUE, FOOD_DAMAGED, PROVIDER_CANCELLED, OTHER }
    public enum Status { OPEN, ACKNOWLEDGED, REASSIGNMENT_REQUESTED, RESOLVED, DISMISSED }
    public enum Action { ACKNOWLEDGE, ASSIGN, REQUEST_REASSIGNMENT, RESOLVE, DISMISS }

    public record CaseView(UUID id, UUID deliveryJobId, UUID orderId, String currentProviderId, String deliveryStatus,
        Reason reason, Status status, UUID assigneeId, String reassignToProviderId, String resolutionNote, UUID openedBy,
        int version, Instant createdAt, Instant updatedAt, Instant closedAt) {}
    public record EventView(long id, String action, Status status, UUID actorId, String note, Instant occurredAt) {}
    public record CaseDetail(CaseView exceptionCase, List<EventView> events) {}
    public record CasePage(List<CaseView> items, boolean hasMore) {}

    private static final Map<Status, Set<Status>> NEXT = Map.of(
        Status.OPEN, Set.of(Status.ACKNOWLEDGED, Status.REASSIGNMENT_REQUESTED, Status.RESOLVED, Status.DISMISSED),
        Status.ACKNOWLEDGED, Set.of(Status.REASSIGNMENT_REQUESTED, Status.RESOLVED, Status.DISMISSED),
        Status.REASSIGNMENT_REQUESTED, Set.of(Status.ACKNOWLEDGED, Status.RESOLVED, Status.DISMISSED),
        Status.RESOLVED, Set.of(),
        Status.DISMISSED, Set.of());
    private static final String SELECT = """
        SELECT c.*, j.provider_id AS current_provider_id, j.status AS delivery_status
          FROM delivery_schema.delivery_exception_case c JOIN delivery_schema.delivery_job j ON j.id = c.delivery_job_id
        """;

    private final JdbcTemplate jdbc;

    public DeliveryExceptionService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** The status an action leads to; ASSIGN keeps the status. Closed cases accept nothing. */
    static Status next(Status from, Action action) {
        if (from == Status.RESOLVED || from == Status.DISMISSED) throw conflict("Case is closed");
        Status to = switch (action) {
            case ACKNOWLEDGE -> Status.ACKNOWLEDGED;
            case ASSIGN -> from;
            case REQUEST_REASSIGNMENT -> Status.REASSIGNMENT_REQUESTED;
            case RESOLVE -> Status.RESOLVED;
            case DISMISS -> Status.DISMISSED;
        };
        if (action != Action.ASSIGN && !NEXT.get(from).contains(to)) throw conflict("Cannot " + action + " a case that is " + from);
        return to;
    }

    @Transactional
    public CaseDetail open(UUID actor, UUID deliveryJobId, Reason reason, String note) {
        if (deliveryJobId == null || reason == null) throw bad("deliveryJobId and reason are required");
        String text = note(note, reason == Reason.OTHER);
        List<UUID> orders = jdbc.queryForList("SELECT order_id FROM delivery_schema.delivery_job WHERE id = ?", UUID.class, deliveryJobId);
        if (orders.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Delivery job not found");
        UUID id = UUID.randomUUID();
        try {
            jdbc.update("""
                INSERT INTO delivery_schema.delivery_exception_case (id, delivery_job_id, order_id, reason, status, opened_by)
                VALUES (?, ?, ?, ?, 'OPEN', ?)""", id, deliveryJobId, orders.get(0), reason.name(), actor);
        } catch (DuplicateKeyException e) {
            throw conflict("This delivery already has an active exception case");
        }
        event(id, "OPEN", Status.OPEN, actor, text);
        return detail(id);
    }

    @Transactional
    public CaseDetail act(UUID actor, UUID caseId, Action action, Integer expectedVersion, String note, UUID assigneeId, String providerId) {
        if (action == null || expectedVersion == null) throw bad("action and expectedVersion are required");
        CaseView current = find(caseId, true);
        if (current.version() != expectedVersion) throw conflict("Case changed since version " + expectedVersion);
        Status to = next(current.status(), action);
        String text = note(note, action == Action.RESOLVE || action == Action.DISMISS);
        UUID assignee = current.assigneeId();
        // Going back to ACKNOWLEDGED withdraws the request; resolve/dismiss keep it on record.
        String target = to == Status.ACKNOWLEDGED ? null : current.reassignToProviderId();
        if (action == Action.ASSIGN) {
            // shortcut: an assignee is a staff identity id taken as given (no Auth lookup), like M12's staff ids; none means the caller.
            assignee = assigneeId == null ? actor : assigneeId;
        }
        if (action == Action.REQUEST_REASSIGNMENT) {
            if (providerId == null || providerId.isBlank()) throw bad("providerId is required");
            target = providerId.trim().toLowerCase(java.util.Locale.ROOT);
            if (target.equals(current.currentProviderId())) throw bad("Choose a provider other than the current one");
            Boolean active = jdbc.query("SELECT is_active FROM delivery_schema.delivery_provider WHERE provider_id = ?",
                rs -> rs.next() ? rs.getBoolean(1) : null, target);
            if (!Boolean.TRUE.equals(active)) throw bad("Unknown or inactive provider");
        }
        boolean closing = to == Status.RESOLVED || to == Status.DISMISSED;
        jdbc.update("""
            UPDATE delivery_schema.delivery_exception_case
               SET status = ?, assignee_id = ?, reassign_to_provider_id = ?, resolution_note = COALESCE(?, resolution_note),
                   version = version + 1, updated_at = now(), closed_at = CASE WHEN ? THEN now() ELSE NULL END
             WHERE id = ? AND version = ?""",
            to.name(), assignee, target, closing ? text : null, closing, caseId, expectedVersion);
        event(caseId, action.name(), to, actor, text);
        return detail(caseId);
    }

    /** The order's delivery job when it has exactly one (there is one per kitchen sub-order). */
    public UUID jobForOrder(UUID orderId) {
        if (orderId == null) throw bad("deliveryJobId or orderId is required");
        List<UUID> jobs = jdbc.queryForList("SELECT id FROM delivery_schema.delivery_job WHERE order_id = ? ORDER BY created_at, id LIMIT 7",
            UUID.class, orderId);
        if (jobs.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No delivery job for this order");
        if (jobs.size() > 1) throw conflict("This order has a delivery job per kitchen; open the case with one of these delivery job IDs: "
            + String.join(", ", jobs.stream().limit(6).map(UUID::toString).toList()) + (jobs.size() > 6 ? " and more" : ""));
        return jobs.get(0);
    }

    public CaseDetail detail(UUID caseId) {
        CaseView view = find(caseId, false);
        List<EventView> events = jdbc.query("""
            SELECT id, action, status, actor_id, note, occurred_at FROM delivery_schema.delivery_exception_event
             WHERE case_id = ? ORDER BY id""",
            (rs, n) -> new EventView(rs.getLong("id"), rs.getString("action"), Status.valueOf(rs.getString("status")),
                rs.getObject("actor_id", UUID.class), rs.getString("note"), rs.getTimestamp("occurred_at").toInstant()), caseId);
        return new CaseDetail(view, events);
    }

    /** Active cases (open, acknowledged, reassignment requested) by default, most recently changed first. */
    public CasePage list(Status status, UUID orderId, int limit, int offset) {
        StringBuilder sql = new StringBuilder(SELECT).append(" WHERE ");
        List<Object> args = new java.util.ArrayList<>();
        if (status == null) sql.append("c.status NOT IN ('RESOLVED', 'DISMISSED')");
        else { sql.append("c.status = ?"); args.add(status.name()); }
        if (orderId != null) { sql.append(" AND c.order_id = ?"); args.add(orderId); }
        sql.append(" ORDER BY c.updated_at DESC, c.id LIMIT ? OFFSET ?");
        args.add(limit + 1);
        args.add(offset);
        List<CaseView> rows = jdbc.query(sql.toString(), (rs, n) -> map(rs), args.toArray());
        boolean more = rows.size() > limit;
        return new CasePage(more ? rows.subList(0, limit) : rows, more);
    }

    private CaseView find(UUID id, boolean lock) {
        List<CaseView> rows = jdbc.query(SELECT + " WHERE c.id = ?" + (lock ? " FOR UPDATE OF c" : ""), (rs, n) -> map(rs), id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Exception case not found");
        return rows.get(0);
    }

    private void event(UUID caseId, String action, Status status, UUID actor, String note) {
        jdbc.update("INSERT INTO delivery_schema.delivery_exception_event (case_id, action, status, actor_id, note) VALUES (?, ?, ?, ?, ?)",
            caseId, action, status.name(), actor, note);
    }

    /** Trimmed note of at most 1000 characters; control characters other than line breaks and tabs are refused. */
    static String note(String value, boolean required) {
        String text = value == null ? null : value.strip();
        if (text == null || text.isEmpty()) {
            if (required) throw bad("note is required");
            return null;
        }
        if (text.length() > 1000) throw bad("note must be at most 1000 characters");
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isISOControl(c) && c != '\n' && c != '\r' && c != '\t') throw bad("note contains control characters");
        }
        return text;
    }

    private static CaseView map(ResultSet rs) throws SQLException {
        return new CaseView(rs.getObject("id", UUID.class), rs.getObject("delivery_job_id", UUID.class),
            rs.getObject("order_id", UUID.class), rs.getString("current_provider_id"), rs.getString("delivery_status"),
            Reason.valueOf(rs.getString("reason")), Status.valueOf(rs.getString("status")), rs.getObject("assignee_id", UUID.class),
            rs.getString("reassign_to_provider_id"), rs.getString("resolution_note"), rs.getObject("opened_by", UUID.class),
            rs.getInt("version"), instant(rs.getTimestamp("created_at")), instant(rs.getTimestamp("updated_at")),
            instant(rs.getTimestamp("closed_at")));
    }

    private static Instant instant(Timestamp t) { return t == null ? null : t.toInstant(); }
    private static ResponseStatusException bad(String m) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, m); }
    private static ResponseStatusException conflict(String m) { return new ResponseStatusException(HttpStatus.CONFLICT, m); }
}
