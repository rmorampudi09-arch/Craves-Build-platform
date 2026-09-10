package in.craves.integration.admin.deliveryintelligence;

import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.ActivityItem;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.AssignmentEvidence;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.AttentionItem;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.CandidateEvidence;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.DeliveryCommandEvidence;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.DeliveryEventEvidence;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.DeliveryJobEvidence;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.DeliveryUnitEvidence;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.HourlyActivity;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.Metrics;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.OrderInvestigationResponse;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.OverviewResponse;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.ProviderShare;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.RecoveryHealth;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.WebhookEvidence;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

@Repository
public class DeliveryIntelligenceReadRepository {
    private static final int MAX_DELIVERY_UNITS = 50;
    private static final int MAX_UNIT_EVENTS = 500;
    private final JdbcTemplate jdbcTemplate;

    public DeliveryIntelligenceReadRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public OverviewResponse overview(int hours, int limit) {
        OffsetDateTime generatedAt = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime since = generatedAt.minusHours(hours);
        return new OverviewResponse(
            generatedAt,
            hours,
            loadMetrics(since),
            loadHourlyActivity(since),
            loadProviderShare(since),
            loadRecoveryHealth(since),
            loadRecentActivity(since, limit),
            loadAttentionQueue(since, limit)
        );
    }

    public OrderInvestigationResponse investigate(String reference, UUID correlationId) {
        UUID orderId = resolveOrderId(reference);
        List<UUID> chefSubOrderIds = jdbcTemplate.query(
            """
            SELECT chef_sub_order_id
              FROM (
                    SELECT chef_sub_order_id, created_at
                      FROM delivery_schema.delivery_command
                     WHERE order_id = ?
                    UNION ALL
                    SELECT chef_sub_order_id, created_at
                      FROM delivery_schema.delivery_job
                     WHERE order_id = ?
                    UNION ALL
                    SELECT chef_sub_order_id, created_at
                      FROM delivery_schema.delivery_assignment
                     WHERE order_id = ?
                   ) units
             GROUP BY chef_sub_order_id
             ORDER BY MIN(created_at), chef_sub_order_id
             LIMIT ?
            """,
            (rs, rowNum) -> rs.getObject("chef_sub_order_id", UUID.class),
            orderId, orderId, orderId, MAX_DELIVERY_UNITS
        );
        if (chefSubOrderIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No delivery evidence was found for this order");
        }

        List<DeliveryUnitEvidence> units = new ArrayList<>(chefSubOrderIds.size());
        for (UUID chefSubOrderId : chefSubOrderIds) {
            DeliveryCommandEvidence command = loadCommand(chefSubOrderId);
            DeliveryJobEvidence job = loadJob(chefSubOrderId);
            AssignmentEvidence assignment = loadAssignment(chefSubOrderId);
            List<CandidateEvidence> candidates = assignment == null ? List.of() : loadCandidates(assignment.assignmentId());
            List<DeliveryEventEvidence> events = job == null ? List.of() : loadEvents(job.deliveryJobId());
            List<WebhookEvidence> webhooks = job == null ? List.of() : loadWebhooks(job.deliveryJobId(), job.providerDeliveryId());
            units.add(new DeliveryUnitEvidence(chefSubOrderId, command, job, assignment, candidates, events, webhooks));
        }
        return new OrderInvestigationResponse(correlationId, reference, orderId, List.copyOf(units));
    }

    public void recordInvestigationAudit(UUID actorIdentityId, UUID orderId, UUID correlationId) {
        jdbcTemplate.update(
            """
            INSERT INTO payment_schema.admin_investigation_audit
                (id, actor_identity_id, resource_type, resource_id, action, reason, correlation_id, created_at)
            VALUES (?, ?, 'DELIVERY_ORDER', ?, 'INVESTIGATE',
                    'Delivery Intelligence order investigation', ?, now())
            """,
            UUID.randomUUID(), actorIdentityId, orderId, correlationId
        );
    }

    private Metrics loadMetrics(OffsetDateTime since) {
        return jdbcTemplate.query(
            """
            SELECT
                (SELECT COUNT(*) FROM delivery_schema.delivery_command WHERE created_at >= ?) AS command_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_command WHERE created_at >= ? AND status = 'COMPLETED') AS completed_command_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_job WHERE created_at >= ?) AS delivery_job_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_job WHERE created_at >= ? AND status = 'DELIVERED') AS delivered_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_job
                  WHERE created_at >= ? AND status NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED')) AS active_delivery_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_command
                  WHERE created_at >= ? AND (attempt_count > 1 OR provider_wait_attempt_count > 0 OR reconciliation_attempt_count > 0)) AS recovery_command_count,
                ((SELECT COUNT(*) FROM delivery_schema.delivery_command
                   WHERE created_at >= ? AND status IN ('FAILED', 'DEAD_LETTER', 'WAITING_FOR_PROVIDER', 'RECONCILIATION_PENDING'))
                 +
                 (SELECT COUNT(*) FROM delivery_schema.delivery_job
                   WHERE created_at >= ? AND tracking_dead_lettered_at IS NOT NULL)
                 +
                 (SELECT COUNT(*) FROM delivery_schema.delivery_webhook_inbox
                   WHERE received_at >= ? AND processing_status IN ('FAILED', 'DEAD_LETTER', 'REJECTED'))) AS attention_count
            """,
            (rs, rowNum) -> new Metrics(
                rs.getLong("command_count"),
                rs.getLong("completed_command_count"),
                rs.getLong("delivery_job_count"),
                rs.getLong("delivered_count"),
                rs.getLong("active_delivery_count"),
                rs.getLong("recovery_command_count"),
                rs.getLong("attention_count")
            ),
            since, since, since, since, since, since, since, since, since
        ).stream().findFirst().orElse(new Metrics(0, 0, 0, 0, 0, 0, 0));
    }

    private List<HourlyActivity> loadHourlyActivity(OffsetDateTime since) {
        return jdbcTemplate.query(
            """
            SELECT date_trunc('hour', observed_at) AS bucket_start,
                   COUNT(*) FILTER (WHERE kind = 'COMMAND') AS command_count,
                   COUNT(*) FILTER (WHERE kind = 'EVENT') AS delivery_event_count,
                   COUNT(*) FILTER (WHERE kind = 'EVENT' AND status = 'DELIVERED') AS delivered_count
              FROM (
                    SELECT created_at AS observed_at, 'COMMAND'::text AS kind, status
                      FROM delivery_schema.delivery_command
                     WHERE created_at >= ?
                    UNION ALL
                    SELECT occurred_at AS observed_at, 'EVENT'::text AS kind,
                           COALESCE(normalized_status, event_type) AS status
                      FROM delivery_schema.delivery_event
                     WHERE occurred_at >= ?
                   ) activity
             GROUP BY date_trunc('hour', observed_at)
             ORDER BY bucket_start
            """,
            (rs, rowNum) -> new HourlyActivity(
                rs.getObject("bucket_start", OffsetDateTime.class),
                rs.getLong("command_count"),
                rs.getLong("delivery_event_count"),
                rs.getLong("delivered_count")
            ),
            since, since
        );
    }

    private List<ProviderShare> loadProviderShare(OffsetDateTime since) {
        List<ProviderCount> counts = jdbcTemplate.query(
            """
            SELECT assignment.selected_provider_id AS provider_id,
                   COALESCE(provider.display_name, assignment.selected_provider_id) AS display_name,
                   COUNT(*) AS selection_count
              FROM delivery_schema.delivery_assignment assignment
              LEFT JOIN delivery_schema.delivery_provider provider
                ON provider.provider_id = assignment.selected_provider_id
             WHERE assignment.created_at >= ?
               AND assignment.selected_provider_id IS NOT NULL
             GROUP BY assignment.selected_provider_id, provider.display_name
             ORDER BY selection_count DESC, assignment.selected_provider_id
            """,
            (rs, rowNum) -> new ProviderCount(
                rs.getString("provider_id"),
                rs.getString("display_name"),
                rs.getLong("selection_count")
            ),
            since
        );
        long total = counts.stream().mapToLong(ProviderCount::selectionCount).sum();
        if (total == 0) {
            return List.of();
        }
        return counts.stream()
            .map(count -> new ProviderShare(
                count.providerId(),
                count.displayName(),
                count.selectionCount(),
                count.selectionCount() * 100.0d / total
            ))
            .toList();
    }

    private RecoveryHealth loadRecoveryHealth(OffsetDateTime since) {
        return jdbcTemplate.query(
            """
            SELECT
                (SELECT COUNT(*) FROM delivery_schema.delivery_command
                  WHERE created_at >= ? AND attempt_count > 1) AS retried_command_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_command
                  WHERE created_at >= ? AND (reconciliation_attempt_count > 0 OR status = 'RECONCILIATION_PENDING')) AS reconciliation_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_command
                  WHERE created_at >= ? AND (provider_wait_attempt_count > 0 OR status = 'WAITING_FOR_PROVIDER')) AS provider_wait_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_webhook_inbox
                  WHERE received_at >= ? AND processing_status = 'DEAD_LETTER') AS webhook_dead_letter_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_job
                  WHERE created_at >= ? AND tracking_dead_lettered_at IS NOT NULL) AS tracking_dead_letter_count
            """,
            (rs, rowNum) -> new RecoveryHealth(
                rs.getLong("retried_command_count"),
                rs.getLong("reconciliation_count"),
                rs.getLong("provider_wait_count"),
                rs.getLong("webhook_dead_letter_count"),
                rs.getLong("tracking_dead_letter_count")
            ),
            since, since, since, since, since
        ).stream().findFirst().orElse(new RecoveryHealth(0, 0, 0, 0, 0));
    }

    private List<ActivityItem> loadRecentActivity(OffsetDateTime since, int limit) {
        return jdbcTemplate.query(
            """
            SELECT activity_id, order_id, chef_sub_order_id, provider_id,
                   activity_type, status, detail, occurred_at, attention
              FROM (
                    SELECT command.id::text AS activity_id,
                           command.order_id,
                           command.chef_sub_order_id,
                           command.reconciliation_provider_id AS provider_id,
                           'DELIVERY_COMMAND'::text AS activity_type,
                           command.status,
                           command.command_type AS detail,
                           command.updated_at AS occurred_at,
                           command.status IN ('FAILED', 'DEAD_LETTER', 'WAITING_FOR_PROVIDER', 'RECONCILIATION_PENDING') AS attention
                      FROM delivery_schema.delivery_command command
                     WHERE command.updated_at >= ?
                    UNION ALL
                    SELECT assignment.id::text,
                           assignment.order_id,
                           assignment.chef_sub_order_id,
                           assignment.selected_provider_id,
                           'PROVIDER_SELECTION'::text,
                           assignment.status,
                           assignment.strategy || ' · ' || assignment.scoring_version,
                           assignment.updated_at,
                           assignment.status = 'EXHAUSTED'
                      FROM delivery_schema.delivery_assignment assignment
                     WHERE assignment.updated_at >= ?
                    UNION ALL
                    SELECT event.id::text,
                           job.order_id,
                           job.chef_sub_order_id,
                           event.provider_id,
                           'STATUS_EVENT'::text,
                           COALESCE(event.normalized_status, event.event_type),
                           event.source || ' · ' || event.event_type,
                           event.occurred_at,
                           (NOT event.applied) OR COALESCE(event.normalized_status, '') = 'FAILED'
                      FROM delivery_schema.delivery_event event
                      JOIN delivery_schema.delivery_job job ON job.id = event.delivery_job_id
                     WHERE event.occurred_at >= ?
                   ) recent
             ORDER BY occurred_at DESC, activity_id DESC
             LIMIT ?
            """,
            (rs, rowNum) -> new ActivityItem(
                rs.getString("activity_id"),
                rs.getObject("order_id", UUID.class),
                rs.getObject("chef_sub_order_id", UUID.class),
                rs.getString("provider_id"),
                rs.getString("activity_type"),
                rs.getString("status"),
                rs.getString("detail"),
                rs.getObject("occurred_at", OffsetDateTime.class),
                rs.getBoolean("attention")
            ),
            since, since, since, limit
        );
    }

    private List<AttentionItem> loadAttentionQueue(OffsetDateTime since, int limit) {
        return jdbcTemplate.query(
            """
            SELECT reference_id, order_id, provider_id, kind, status, occurred_at, error_recorded
              FROM (
                    SELECT command.id::text AS reference_id,
                           command.order_id,
                           command.reconciliation_provider_id AS provider_id,
                           'COMMAND_RECOVERY'::text AS kind,
                           command.status,
                           command.updated_at AS occurred_at,
                           command.last_error IS NOT NULL AS error_recorded
                      FROM delivery_schema.delivery_command command
                     WHERE command.updated_at >= ?
                       AND command.status IN ('FAILED', 'DEAD_LETTER', 'WAITING_FOR_PROVIDER', 'RECONCILIATION_PENDING')
                    UNION ALL
                    SELECT job.id::text,
                           job.order_id,
                           job.provider_id,
                           'TRACKING_DEAD_LETTER'::text,
                           job.status,
                           COALESCE(job.tracking_dead_lettered_at, job.updated_at),
                           job.last_tracking_error IS NOT NULL
                      FROM delivery_schema.delivery_job job
                     WHERE job.updated_at >= ?
                       AND job.tracking_dead_lettered_at IS NOT NULL
                    UNION ALL
                    SELECT webhook.id::text,
                           job.order_id,
                           webhook.provider_id,
                           'WEBHOOK_PROCESSING'::text,
                           webhook.processing_status,
                           webhook.received_at,
                           webhook.error_message IS NOT NULL
                      FROM delivery_schema.delivery_webhook_inbox webhook
                      LEFT JOIN delivery_schema.delivery_job job ON job.id = webhook.delivery_job_id
                     WHERE webhook.received_at >= ?
                       AND webhook.processing_status IN ('FAILED', 'DEAD_LETTER', 'REJECTED')
                   ) attention
             ORDER BY occurred_at ASC, reference_id
             LIMIT ?
            """,
            (rs, rowNum) -> new AttentionItem(
                rs.getString("reference_id"),
                rs.getObject("order_id", UUID.class),
                rs.getString("provider_id"),
                rs.getString("kind"),
                rs.getString("status"),
                rs.getObject("occurred_at", OffsetDateTime.class),
                rs.getBoolean("error_recorded")
            ),
            since, since, since, limit
        );
    }

    private UUID resolveOrderId(String reference) {
        UUID parsedUuid = parseUuid(reference);
        if (parsedUuid != null) {
            List<UUID> uuidMatches = jdbcTemplate.query(
                """
                SELECT DISTINCT order_id
                  FROM (
                        SELECT order_id FROM delivery_schema.delivery_command
                         WHERE id = ? OR chef_sub_order_id = ? OR order_id = ?
                        UNION ALL
                        SELECT order_id FROM delivery_schema.delivery_job
                         WHERE id = ? OR chef_sub_order_id = ? OR order_id = ?
                        UNION ALL
                        SELECT order_id FROM delivery_schema.delivery_assignment
                         WHERE id = ? OR chef_sub_order_id = ? OR order_id = ?
                       ) matches
                 LIMIT 2
                """,
                (rs, rowNum) -> rs.getObject("order_id", UUID.class),
                parsedUuid, parsedUuid, parsedUuid,
                parsedUuid, parsedUuid, parsedUuid,
                parsedUuid, parsedUuid, parsedUuid
            );
            UUID resolved = oneOrderOrNull(uuidMatches);
            if (resolved != null) {
                return resolved;
            }
        }

        List<UUID> providerMatches = jdbcTemplate.query(
            """
            SELECT DISTINCT order_id
              FROM (
                    SELECT job.order_id
                      FROM delivery_schema.delivery_job job
                     WHERE job.provider_delivery_id = ?
                    UNION ALL
                    SELECT job.order_id
                      FROM delivery_schema.delivery_event event
                      JOIN delivery_schema.delivery_job job ON job.id = event.delivery_job_id
                     WHERE event.provider_event_id = ?
                    UNION ALL
                    SELECT job.order_id
                      FROM delivery_schema.delivery_webhook_inbox webhook
                      JOIN delivery_schema.delivery_job job
                        ON job.id = webhook.delivery_job_id
                        OR (webhook.delivery_job_id IS NULL AND job.provider_delivery_id = webhook.provider_delivery_id)
                     WHERE webhook.provider_event_id = ?
                        OR webhook.provider_delivery_id = ?
                        OR webhook.provider_order_id = ?
                   ) matches
             LIMIT 2
            """,
            (rs, rowNum) -> rs.getObject("order_id", UUID.class),
            reference, reference, reference, reference, reference
        );
        UUID resolved = oneOrderOrNull(providerMatches);
        if (resolved != null) {
            return resolved;
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Delivery reference was not found");
    }

    private UUID oneOrderOrNull(List<UUID> matches) {
        if (matches.size() > 1) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Delivery reference matched more than one order");
        }
        return matches.isEmpty() ? null : matches.get(0);
    }

    private DeliveryCommandEvidence loadCommand(UUID chefSubOrderId) {
        return jdbcTemplate.query(
            """
            SELECT id, order_id, chef_sub_order_id, command_type, status,
                   ready_at, dispatch_at, attempt_count, provider_wait_attempt_count,
                   reconciliation_attempt_count, idempotency_key,
                   provider_wait_started_at, next_provider_retry_at,
                   reconciliation_provider_id, reconciliation_client_reference,
                   reconciliation_started_at, next_reconciliation_at,
                   last_error IS NOT NULL AS error_recorded,
                   created_at, updated_at
              FROM delivery_schema.delivery_command
             WHERE chef_sub_order_id = ?
             ORDER BY updated_at DESC
             LIMIT 1
            """,
            (rs, rowNum) -> new DeliveryCommandEvidence(
                rs.getObject("id", UUID.class),
                rs.getObject("order_id", UUID.class),
                rs.getObject("chef_sub_order_id", UUID.class),
                rs.getString("command_type"),
                rs.getString("status"),
                rs.getObject("ready_at", OffsetDateTime.class),
                rs.getObject("dispatch_at", OffsetDateTime.class),
                rs.getInt("attempt_count"),
                rs.getInt("provider_wait_attempt_count"),
                rs.getInt("reconciliation_attempt_count"),
                rs.getString("idempotency_key"),
                rs.getObject("provider_wait_started_at", OffsetDateTime.class),
                rs.getObject("next_provider_retry_at", OffsetDateTime.class),
                rs.getString("reconciliation_provider_id"),
                rs.getString("reconciliation_client_reference"),
                rs.getObject("reconciliation_started_at", OffsetDateTime.class),
                rs.getObject("next_reconciliation_at", OffsetDateTime.class),
                rs.getBoolean("error_recorded"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
            ),
            chefSubOrderId
        ).stream().findFirst().orElse(null);
    }

    private DeliveryJobEvidence loadJob(UUID chefSubOrderId) {
        return jdbcTemplate.query(
            """
            SELECT id, order_id, chef_sub_order_id, assignment_id, provider_id,
                   provider_delivery_id, provider_quote_id, assigned_agent_id,
                   status, provider_status, booked_at, picked_up_at, delivered_at,
                   last_status_observed_at, last_status_source, tracking_attempt_count,
                   tracking_dead_lettered_at, last_tracking_error IS NOT NULL AS tracking_error_recorded,
                   courier_latitude, courier_longitude, courier_location_observed_at,
                   estimated_pickup_start_at, estimated_pickup_end_at,
                   estimated_dropoff_start_at, estimated_dropoff_end_at,
                   telemetry_observed_at, telemetry_source, created_at, updated_at
              FROM delivery_schema.delivery_job
             WHERE chef_sub_order_id = ?
             ORDER BY updated_at DESC
             LIMIT 1
            """,
            (rs, rowNum) -> new DeliveryJobEvidence(
                rs.getObject("id", UUID.class),
                rs.getObject("order_id", UUID.class),
                rs.getObject("chef_sub_order_id", UUID.class),
                rs.getObject("assignment_id", UUID.class),
                rs.getString("provider_id"),
                rs.getString("provider_delivery_id"),
                rs.getString("provider_quote_id"),
                rs.getString("assigned_agent_id"),
                rs.getString("status"),
                rs.getString("provider_status"),
                rs.getObject("booked_at", OffsetDateTime.class),
                rs.getObject("picked_up_at", OffsetDateTime.class),
                rs.getObject("delivered_at", OffsetDateTime.class),
                rs.getObject("last_status_observed_at", OffsetDateTime.class),
                rs.getString("last_status_source"),
                rs.getInt("tracking_attempt_count"),
                rs.getObject("tracking_dead_lettered_at", OffsetDateTime.class),
                rs.getBoolean("tracking_error_recorded"),
                rs.getBigDecimal("courier_latitude"),
                rs.getBigDecimal("courier_longitude"),
                rs.getObject("courier_location_observed_at", OffsetDateTime.class),
                rs.getObject("estimated_pickup_start_at", OffsetDateTime.class),
                rs.getObject("estimated_pickup_end_at", OffsetDateTime.class),
                rs.getObject("estimated_dropoff_start_at", OffsetDateTime.class),
                rs.getObject("estimated_dropoff_end_at", OffsetDateTime.class),
                rs.getObject("telemetry_observed_at", OffsetDateTime.class),
                rs.getString("telemetry_source"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
            ),
            chefSubOrderId
        ).stream().findFirst().orElse(null);
    }

    private AssignmentEvidence loadAssignment(UUID chefSubOrderId) {
        return jdbcTemplate.query(
            """
            SELECT id, strategy, status, scoring_version, selected_candidate_id,
                   selected_provider_id, selected_agent_id, created_at, updated_at
              FROM delivery_schema.delivery_assignment
             WHERE chef_sub_order_id = ?
             ORDER BY updated_at DESC
             LIMIT 1
            """,
            (rs, rowNum) -> new AssignmentEvidence(
                rs.getObject("id", UUID.class),
                rs.getString("strategy"),
                rs.getString("status"),
                rs.getString("scoring_version"),
                rs.getObject("selected_candidate_id", UUID.class),
                rs.getString("selected_provider_id"),
                rs.getString("selected_agent_id"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
            ),
            chefSubOrderId
        ).stream().findFirst().orElse(null);
    }

    private List<CandidateEvidence> loadCandidates(UUID assignmentId) {
        return jdbcTemplate.query(
            """
            SELECT id, provider_id, provider_quote_id, agent_id, candidate_rank,
                   pickup_distance_km, pickup_eta_minutes, quoted_cost, currency,
                   predicted_success_probability, combined_score, live_avg, stored_avg,
                   momentum, provider_quality_score, proximity_score, final_score,
                   status, created_at
              FROM delivery_schema.delivery_assignment_candidate
             WHERE assignment_id = ?
             ORDER BY candidate_rank, created_at
             LIMIT 100
            """,
            (rs, rowNum) -> new CandidateEvidence(
                rs.getObject("id", UUID.class),
                rs.getString("provider_id"),
                rs.getString("provider_quote_id"),
                rs.getString("agent_id"),
                rs.getInt("candidate_rank"),
                nullableDouble(rs, "pickup_distance_km"),
                nullableDouble(rs, "pickup_eta_minutes"),
                rs.getBigDecimal("quoted_cost"),
                rs.getString("currency"),
                rs.getDouble("predicted_success_probability"),
                rs.getDouble("combined_score"),
                nullableDouble(rs, "live_avg"),
                rs.getDouble("stored_avg"),
                rs.getString("momentum"),
                rs.getDouble("provider_quality_score"),
                rs.getDouble("proximity_score"),
                rs.getDouble("final_score"),
                rs.getString("status"),
                rs.getObject("created_at", OffsetDateTime.class)
            ),
            assignmentId
        );
    }

    private List<DeliveryEventEvidence> loadEvents(UUID deliveryJobId) {
        return jdbcTemplate.query(
            """
            SELECT id, provider_id, provider_event_id, event_type, normalized_status,
                   provider_status, source, applied, ignored_reason, occurred_at, created_at
              FROM delivery_schema.delivery_event
             WHERE delivery_job_id = ?
             ORDER BY occurred_at, created_at, id
             LIMIT ?
            """,
            (rs, rowNum) -> new DeliveryEventEvidence(
                rs.getObject("id", UUID.class),
                rs.getString("provider_id"),
                rs.getString("provider_event_id"),
                rs.getString("event_type"),
                rs.getString("normalized_status"),
                rs.getString("provider_status"),
                rs.getString("source"),
                rs.getBoolean("applied"),
                rs.getString("ignored_reason"),
                rs.getObject("occurred_at", OffsetDateTime.class),
                rs.getObject("created_at", OffsetDateTime.class)
            ),
            deliveryJobId, MAX_UNIT_EVENTS
        );
    }

    private List<WebhookEvidence> loadWebhooks(UUID deliveryJobId, String providerDeliveryId) {
        if (providerDeliveryId == null || providerDeliveryId.isBlank()) {
            return jdbcTemplate.query(
                """
                SELECT id, provider_id, provider_event_id, processing_status,
                       normalized_status, processing_result, attempt_count,
                       error_message IS NOT NULL AS error_recorded,
                       received_at, processed_at
                  FROM delivery_schema.delivery_webhook_inbox
                 WHERE delivery_job_id = ?
                 ORDER BY received_at, id
                 LIMIT ?
                """,
                (rs, rowNum) -> webhookEvidence(rs),
                deliveryJobId, MAX_UNIT_EVENTS
            );
        }
        return jdbcTemplate.query(
            """
            SELECT id, provider_id, provider_event_id, processing_status,
                   normalized_status, processing_result, attempt_count,
                   error_message IS NOT NULL AS error_recorded,
                   received_at, processed_at
              FROM delivery_schema.delivery_webhook_inbox
             WHERE delivery_job_id = ? OR provider_delivery_id = ?
             ORDER BY received_at, id
             LIMIT ?
            """,
            (rs, rowNum) -> webhookEvidence(rs),
            deliveryJobId, providerDeliveryId, MAX_UNIT_EVENTS
        );
    }

    private static WebhookEvidence webhookEvidence(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new WebhookEvidence(
            rs.getObject("id", UUID.class),
            rs.getString("provider_id"),
            rs.getString("provider_event_id"),
            rs.getString("processing_status"),
            rs.getString("normalized_status"),
            rs.getString("processing_result"),
            rs.getInt("attempt_count"),
            rs.getBoolean("error_recorded"),
            rs.getObject("received_at", OffsetDateTime.class),
            rs.getObject("processed_at", OffsetDateTime.class)
        );
    }

    private static Double nullableDouble(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        double value = rs.getDouble(column);
        return rs.wasNull() ? null : value;
    }

    private static UUID parseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private record ProviderCount(String providerId, String displayName, long selectionCount) {}
}
