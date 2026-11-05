package in.craves.integration.admin.deadletters;

import in.craves.integration.admin.deadletters.AdminDeadLetterController.DeadLetter;
import in.craves.integration.admin.deadletters.AdminDeadLetterController.DeadLetterPage;
import in.craves.integration.admin.deadletters.AdminDeadLetterController.Source;
import in.craves.integration.admin.deadletters.AdminDeadLetterController.Status;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Reads the three failed-work stores the dead-letter console shows (handbook 105); never their payloads. */
@Repository
public class DeadLetterRepository {
    private static final String WEBHOOK_ROWS = "SELECT id, provider_id AS provider, normalized_status AS kind, processing_status AS status, "
        + "attempt_count, received_at AS first_seen_at, COALESCE(processing_started_at, received_at) AS last_changed_at, next_attempt_at, "
        + "provider_event_id, delivery_job_id, NULL::uuid AS order_id, NULL::uuid AS chef_sub_order_id, error_message AS last_error, "
        + "octet_length(raw_payload::text) AS payload_bytes FROM delivery_schema.delivery_webhook_inbox WHERE ";
    private static final String WEBHOOKS = WEBHOOK_ROWS + "processing_status = ?";
    private static final String CASHFREE = "SELECT id, 'cashfree' AS provider, NULL AS kind, processing_status AS status, attempt_count, "
        + "first_seen_at, last_seen_at AS last_changed_at, next_attempt_at, idempotency_key AS provider_event_id, "
        + "NULL::uuid AS delivery_job_id, NULL::uuid AS order_id, NULL::uuid AS chef_sub_order_id, last_error, "
        + "octet_length(raw_payload) AS payload_bytes FROM payment_schema.cashfree_webhook_delivery WHERE processing_status = ?";
    private static final String COMMANDS = "SELECT id, reconciliation_provider_id AS provider, command_type AS kind, status, attempt_count, "
        + "created_at AS first_seen_at, updated_at AS last_changed_at, COALESCE(next_provider_retry_at, dispatch_at) AS next_attempt_at, "
        + "NULL AS provider_event_id, NULL::uuid AS delivery_job_id, order_id, chef_sub_order_id, last_error, "
        + "octet_length(payload::text) AS payload_bytes FROM delivery_schema.delivery_command WHERE status = ?";

    private final JdbcTemplate jdbc;

    public DeadLetterRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public DeadLetterPage page(Source source, Status status, String provider, int limit, int offset) {
        String select = switch (source) {
            case DELIVERY_WEBHOOK -> WEBHOOKS + (provider == null ? "" : " AND provider_id = ?");
            case CASHFREE_WEBHOOK -> CASHFREE;
            case DELIVERY_COMMAND -> COMMANDS + (provider == null ? "" : " AND reconciliation_provider_id = ?");
        };
        List<Object> args = new ArrayList<>(List.of(status.name()));
        if (provider != null) args.add(provider);
        Long total = jdbc.queryForObject("SELECT count(*) FROM (" + select + ") AS matching", Long.class, args.toArray());
        args.add(limit);
        args.add(offset);
        List<DeadLetter> items = jdbc.query(select + " ORDER BY last_changed_at DESC, id LIMIT ? OFFSET ?",
            (rs, row) -> deadLetter(rs, source), args.toArray());
        return new DeadLetterPage(source, status, total == null ? 0 : total, limit, offset, items);
    }

    /** The table needs a resource id: a listing has none, so the call's correlation id stands for it. */
    public void audit(UUID actor, Source source, String reason, UUID correlationId) {
        jdbc.update("INSERT INTO payment_schema.admin_investigation_audit "
                + "(id, actor_identity_id, resource_type, resource_id, action, reason, correlation_id, created_at) "
                + "VALUES (?, ?, ?, ?, 'LIST_DEAD_LETTERS', ?, ?, now())",
            UUID.randomUUID(), actor, "DEAD_LETTERS_" + source.name(), correlationId, reason, correlationId);
    }

    /**
     * Gives a dead-lettered delivery webhook exactly one more attempt: FAILED and due now, one attempt short of the limit, so
     * the worker claims it once and dead-letters it again if it fails. A dead-lettered row is never claimed, so only one of
     * two admins retrying at once changes it; the other gets 409. Audited in the same transaction.
     */
    @Transactional
    public DeadLetter retryDeliveryWebhook(UUID id, int maxAttempts, UUID actor, String reason, UUID correlationId) {
        int changed = jdbc.update("UPDATE delivery_schema.delivery_webhook_inbox SET processing_status = 'FAILED', attempt_count = ?, "
            + "next_attempt_at = now(), processed_at = NULL WHERE id = ? AND processing_status = 'DEAD_LETTER'", Math.max(0, maxAttempts - 1), id);
        if (changed == 0) {
            List<String> status = jdbc.queryForList("SELECT processing_status FROM delivery_schema.delivery_webhook_inbox WHERE id = ?",
                String.class, id);
            if (status.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such delivery webhook");
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a dead-lettered webhook can be retried; this one is " + status.get(0));
        }
        jdbc.update("INSERT INTO payment_schema.admin_investigation_audit "
                + "(id, actor_identity_id, resource_type, resource_id, action, reason, correlation_id, created_at) "
                + "VALUES (?, ?, 'DEAD_LETTERS_DELIVERY_WEBHOOK', ?, 'RETRY_DEAD_LETTER', ?, ?, now())",
            UUID.randomUUID(), actor, id, reason, correlationId);
        return jdbc.queryForObject(WEBHOOK_ROWS + "id = ?", (rs, row) -> deadLetter(rs, Source.DELIVERY_WEBHOOK), id);
    }

    private static DeadLetter deadLetter(ResultSet rs, Source source) throws SQLException {
        Integer bytes = rs.getObject("payload_bytes", Integer.class);
        return new DeadLetter(rs.getObject("id", UUID.class), source, rs.getString("provider"), rs.getString("kind"),
            rs.getString("status"), rs.getInt("attempt_count"), rs.getObject("first_seen_at", OffsetDateTime.class),
            rs.getObject("last_changed_at", OffsetDateTime.class), rs.getObject("next_attempt_at", OffsetDateTime.class),
            rs.getString("provider_event_id"), rs.getObject("delivery_job_id", UUID.class), rs.getObject("order_id", UUID.class),
            rs.getObject("chef_sub_order_id", UUID.class), safe(rs.getString("last_error")), bytes);
    }

    /** One line of at most 500 characters, without control characters. */
    static String safe(String error) {
        if (error == null || error.isBlank()) return null;
        String line = error.replaceAll("\\p{Cntrl}", " ").trim();
        return line.length() > 500 ? line.substring(0, 500) : line;
    }
}
