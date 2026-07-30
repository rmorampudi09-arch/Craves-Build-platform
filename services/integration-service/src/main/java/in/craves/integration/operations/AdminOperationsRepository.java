package in.craves.integration.operations;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.operations.AdminOperationsModels.AddCaseNoteRequest;
import in.craves.integration.operations.AdminOperationsModels.CaseDetails;
import in.craves.integration.operations.AdminOperationsModels.CaseNoteResponse;
import in.craves.integration.operations.AdminOperationsModels.CaseResponse;
import in.craves.integration.operations.AdminOperationsModels.CreateCaseRequest;
import in.craves.integration.operations.AdminOperationsModels.InvestigationSnapshot;
import in.craves.integration.operations.AdminOperationsModels.RetryReleaseResponse;
import in.craves.integration.operations.AdminOperationsModels.UpdateCaseRequest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class AdminOperationsRepository {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AdminOperationsRepository(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public CaseResponse create(CreateCaseRequest request, UUID actor) {
        UUID id = UUID.randomUUID();
        String reference = "CRV-OPS-" + id.toString().substring(0, 8).toUpperCase();
        jdbcTemplate.update(
            "INSERT INTO payment_schema.operations_case " +
                "(id, case_reference, category, priority, status, subject_type, subject_id, order_id, checkout_id, " +
                "payment_order_id, refund_id, delivery_job_id, subscription_id, customer_identity_id, chef_identity_id, " +
                "summary, description, created_by_identity_id, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())",
            id, reference, request.category(), request.priority(), request.subjectType(), request.subjectId(),
            request.orderId(), request.checkoutId(), request.paymentOrderId(), request.refundId(),
            request.deliveryJobId(), request.subscriptionId(), request.customerIdentityId(), request.chefIdentityId(),
            request.summary(), request.description(), actor
        );
        CaseResponse created = getCase(id);
        audit(id, "CREATE_CASE", "OPERATIONS_CASE", id, actor, request.description(), null, created);
        return created;
    }

    public List<CaseResponse> list(String status, int limit) {
        if (status == null || status.isBlank()) {
            return jdbcTemplate.query(
                "SELECT * FROM payment_schema.operations_case ORDER BY updated_at DESC LIMIT ?",
                this::mapCase,
                limit
            );
        }
        return jdbcTemplate.query(
            "SELECT * FROM payment_schema.operations_case WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
            this::mapCase,
            status,
            limit
        );
    }

    public CaseDetails details(UUID id) {
        return new CaseDetails(getCase(id), jdbcTemplate.query(
            "SELECT id, note_type, body, actor_identity_id, created_at " +
                "FROM payment_schema.operations_case_note WHERE case_id = ? ORDER BY created_at",
            this::mapNote,
            id
        ));
    }

    @Transactional
    public CaseResponse update(UUID id, UpdateCaseRequest request, UUID actor) {
        CaseResponse existing = lockCase(id);
        boolean closing = "CLOSED".equals(request.status());
        jdbcTemplate.update(
            "UPDATE payment_schema.operations_case SET status = ?, assigned_admin_identity_id = ?, " +
                "closure_reason = CASE WHEN ? THEN ? ELSE closure_reason END, " +
                "closed_by_identity_id = CASE WHEN ? THEN ? ELSE closed_by_identity_id END, " +
                "closed_at = CASE WHEN ? THEN now() ELSE closed_at END, version = version + 1, updated_at = now() WHERE id = ?",
            request.status(), request.assignedAdminIdentityId(), closing, request.reason(),
            closing, actor, closing, id
        );
        CaseResponse updated = getCase(id);
        audit(id, "UPDATE_CASE", "OPERATIONS_CASE", id, actor, request.reason(), existing, updated);
        return updated;
    }

    @Transactional
    public CaseNoteResponse addNote(UUID caseId, AddCaseNoteRequest request, UUID actor) {
        getCase(caseId);
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
            "INSERT INTO payment_schema.operations_case_note " +
                "(id, case_id, note_type, body, actor_identity_id, created_at) VALUES (?, ?, ?, ?, ?, now())",
            id, caseId, request.noteType(), request.body(), actor
        );
        CaseNoteResponse note = jdbcTemplate.query(
            "SELECT id, note_type, body, actor_identity_id, created_at " +
                "FROM payment_schema.operations_case_note WHERE id = ?",
            this::mapNote,
            id
        ).stream().findFirst().orElseThrow();
        audit(caseId, "ADD_NOTE", "OPERATIONS_CASE_NOTE", id, actor, request.body(), null, note);
        return note;
    }

    public InvestigationSnapshot snapshot(String entityType, UUID entityId) {
        Map<String, Object> fields = switch (entityType) {
            case "PAYMENT_ORDER" -> single(
                "SELECT id, checkout_id, customer_identity_id, craves_payment_order_ref, cashfree_order_id, " +
                    "amount, currency, status, provider_status, created_at, updated_at " +
                    "FROM payment_schema.payment_order WHERE id = ?",
                entityId
            );
            case "REFUND" -> single(
                "SELECT id, checkout_id, chef_sub_order_id, customer_identity_id, cashfree_order_id, " +
                    "cf_refund_id, amount, currency, status, provider_status, attempt_count, next_attempt_at, last_error, created_at, updated_at " +
                    "FROM payment_schema.refund WHERE id = ?",
                entityId
            );
            case "DELIVERY_JOB" -> single(
                "SELECT id, chef_sub_order_id, provider_id, provider_order_id, provider_delivery_id, status, provider_status, " +
                    "last_status_observed_at, last_status_source, next_tracking_at, tracking_attempt_count, last_tracking_error, created_at, updated_at " +
                    "FROM delivery_schema.delivery_job WHERE id = ?",
                entityId
            );
            case "SUBSCRIPTION_PAYMENT" -> single(
                "SELECT id, invoice_id, subscription_id, plan_id, customer_identity_id, chef_identity_id, cycle_start, cycle_end, " +
                    "amount, currency, status, cashfree_order_id, provider_status, attempt_count, last_error, created_at, updated_at, paid_at " +
                    "FROM payment_schema.subscription_payment_intent WHERE id = ? OR invoice_id = ?",
                entityId, entityId
            );
            case "CHEF_EARNING" -> single(
                "SELECT id, order_id, chef_identity_id, order_source, currency, gross_amount, commission_amount, " +
                    "tax_withheld_amount, adjustment_amount, net_payable, allocation_reference, status, approved_at, reversed_at, created_at, updated_at " +
                    "FROM payment_schema.chef_earning_entry WHERE id = ?",
                entityId
            );
            case "CHEF_SETTLEMENT" -> single(
                "SELECT id, batch_reference, currency, total_amount, entry_count, status, external_reference, failure_reason, " +
                    "created_at, submitted_at, completed_at, updated_at FROM payment_schema.chef_settlement_batch WHERE id = ?",
                entityId
            );
            default -> throw new IllegalArgumentException("Unsupported investigation entity type");
        };
        if (fields.isEmpty()) {
            throw new IllegalArgumentException("Investigation entity was not found");
        }
        return new InvestigationSnapshot(entityType, entityId, fields, Instant.now());
    }

    @Transactional
    public RetryReleaseResponse releaseRetry(
        UUID caseId,
        String domain,
        UUID recordId,
        UUID actor,
        String reason
    ) {
        CaseResponse caseValue = lockCase(caseId);
        if ("CLOSED".equals(caseValue.status())) {
            throw new IllegalStateException("A closed operations case cannot release work for retry");
        }
        StatusChange change = switch (domain) {
            case "PAYMENT_WEBHOOK" -> release(
                "SELECT processing_status FROM payment_schema.cashfree_webhook_delivery WHERE id = ? FOR UPDATE",
                "UPDATE payment_schema.cashfree_webhook_delivery SET processing_status = 'FAILED', " +
                    "last_error = NULL, last_seen_at = now() WHERE id = ? AND processing_status IN ('FAILED', 'PROCESSING')",
                recordId,
                "FAILED"
            );
            case "REFUND" -> release(
                "SELECT status FROM payment_schema.refund WHERE id = ? FOR UPDATE",
                "UPDATE payment_schema.refund SET status = 'RETRY', next_attempt_at = now(), lock_token = NULL, locked_at = NULL, " +
                    "last_error = NULL, updated_at = now() WHERE id = ? AND status IN ('FAILED', 'DEAD_LETTER')",
                recordId,
                "RETRY"
            );
            case "REFUND_STATUS_OUTBOX" -> release(
                "SELECT status FROM payment_schema.refund_status_outbox WHERE id = ? FOR UPDATE",
                "UPDATE payment_schema.refund_status_outbox SET status = 'FAILED', next_attempt_at = now(), lock_token = NULL, locked_at = NULL, " +
                    "last_error = NULL, updated_at = now() WHERE id = ? AND status IN ('FAILED', 'DEAD_LETTER', 'PROCESSING')",
                recordId,
                "FAILED"
            );
            case "DELIVERY_WEBHOOK" -> release(
                "SELECT processing_status FROM delivery_schema.delivery_webhook_inbox WHERE id = ? FOR UPDATE",
                "UPDATE delivery_schema.delivery_webhook_inbox SET processing_status = 'FAILED', next_attempt_at = now(), " +
                    "processing_started_at = NULL, error_message = NULL WHERE id = ? AND processing_status IN ('FAILED', 'DEAD_LETTER', 'PROCESSING')",
                recordId,
                "FAILED"
            );
            case "DELIVERY_TRACKING" -> release(
                "SELECT status FROM delivery_schema.delivery_job WHERE id = ? FOR UPDATE",
                "UPDATE delivery_schema.delivery_job SET next_tracking_at = now(), tracking_processing_started_at = NULL, " +
                    "tracking_dead_lettered_at = NULL, last_tracking_error = NULL, updated_at = now() " +
                    "WHERE id = ? AND status NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED')",
                recordId,
                "TRACKING_DUE"
            );
            case "SUBSCRIPTION_PAYMENT_STATUS_OUTBOX" -> release(
                "SELECT status FROM payment_schema.subscription_payment_status_outbox WHERE id = ? FOR UPDATE",
                "UPDATE payment_schema.subscription_payment_status_outbox SET status = 'FAILED', next_attempt_at = now(), " +
                    "lock_token = NULL, locked_at = NULL, last_error = NULL, updated_at = now() " +
                    "WHERE id = ? AND status IN ('FAILED', 'DEAD_LETTER', 'PROCESSING')",
                recordId,
                "FAILED"
            );
            default -> throw new IllegalArgumentException("Unsupported retry release domain");
        };
        UUID releaseId = UUID.randomUUID();
        jdbcTemplate.update(
            "INSERT INTO payment_schema.admin_retry_release " +
                "(id, case_id, domain, record_id, previous_status, release_status, actor_identity_id, reason, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())",
            releaseId, caseId, domain, recordId, change.previousStatus(), change.newStatus(), actor, reason
        );
        RetryReleaseResponse response = new RetryReleaseResponse(
            releaseId, caseId, domain, recordId, change.previousStatus(), change.newStatus(), Instant.now()
        );
        audit(caseId, "RELEASE_RETRY", domain, recordId, actor, reason,
            Map.of("status", change.previousStatus()), Map.of("status", change.newStatus()));
        return response;
    }

    private StatusChange release(String selectSql, String updateSql, UUID id, String newStatus) {
        List<String> states = jdbcTemplate.query(selectSql, (rs, rowNum) -> rs.getString(1), id);
        if (states.isEmpty()) {
            throw new IllegalArgumentException("Retry record was not found");
        }
        int updated = jdbcTemplate.update(updateSql, id);
        if (updated != 1) {
            throw new IllegalStateException("Retry record is not in an eligible state");
        }
        return new StatusChange(states.getFirst(), newStatus);
    }

    private Map<String, Object> single(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbcTemplate.query(
            sql,
            (rs, rowNum) -> {
                Map<String, Object> values = new LinkedHashMap<>();
                var metadata = rs.getMetaData();
                for (int index = 1; index <= metadata.getColumnCount(); index++) {
                    values.put(metadata.getColumnLabel(index), rs.getObject(index));
                }
                return Map.copyOf(values);
            },
            args
        );
        return rows.isEmpty() ? Map.of() : rows.getFirst();
    }

    private CaseResponse getCase(UUID id) {
        return jdbcTemplate.query(
            "SELECT * FROM payment_schema.operations_case WHERE id = ?",
            this::mapCase,
            id
        ).stream().findFirst().orElseThrow(() -> new IllegalArgumentException("Operations case was not found"));
    }

    private CaseResponse lockCase(UUID id) {
        return jdbcTemplate.query(
            "SELECT * FROM payment_schema.operations_case WHERE id = ? FOR UPDATE",
            this::mapCase,
            id
        ).stream().findFirst().orElseThrow(() -> new IllegalArgumentException("Operations case was not found"));
    }

    private void audit(
        UUID caseId,
        String action,
        String entityType,
        UUID entityId,
        UUID actor,
        String reason,
        Object oldState,
        Object newState
    ) {
        try {
            jdbcTemplate.update(
                "INSERT INTO payment_schema.admin_operation_audit " +
                    "(id, case_id, action, entity_type, entity_id, actor_identity_id, reason, old_state, new_state, correlation_id, created_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), ?, now())",
                UUID.randomUUID(), caseId, action, entityType, entityId, actor, reason,
                oldState == null ? null : objectMapper.writeValueAsString(oldState),
                newState == null ? null : objectMapper.writeValueAsString(newState),
                UUID.randomUUID()
            );
        } catch (Exception exception) {
            throw new IllegalStateException("Admin operation audit serialization failed", exception);
        }
    }

    private CaseResponse mapCase(ResultSet rs, int rowNum) throws SQLException {
        return new CaseResponse(
            rs.getObject("id", UUID.class), rs.getString("case_reference"), rs.getString("category"),
            rs.getString("priority"), rs.getString("status"), rs.getString("subject_type"),
            rs.getObject("subject_id", UUID.class), rs.getObject("order_id", UUID.class),
            rs.getObject("checkout_id", UUID.class), rs.getObject("payment_order_id", UUID.class),
            rs.getObject("refund_id", UUID.class), rs.getObject("delivery_job_id", UUID.class),
            rs.getObject("subscription_id", UUID.class), rs.getObject("customer_identity_id", UUID.class),
            rs.getObject("chef_identity_id", UUID.class), rs.getString("summary"), rs.getString("description"),
            rs.getObject("assigned_admin_identity_id", UUID.class), rs.getString("closure_reason"),
            instant(rs, "created_at"), instant(rs, "updated_at"), instant(rs, "closed_at")
        );
    }

    private CaseNoteResponse mapNote(ResultSet rs, int rowNum) throws SQLException {
        return new CaseNoteResponse(
            rs.getObject("id", UUID.class), rs.getString("note_type"), rs.getString("body"),
            rs.getObject("actor_identity_id", UUID.class), instant(rs, "created_at")
        );
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private record StatusChange(String previousStatus, String newStatus) {
    }
}
