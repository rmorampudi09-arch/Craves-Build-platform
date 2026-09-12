package in.craves.integration.admin.deliveryintelligence;

import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceHistoryModels.OverviewResponse;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.ActivityItem;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.AttentionItem;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.HourlyActivity;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.Metrics;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.ProviderShare;
import in.craves.integration.admin.deliveryintelligence.DeliveryIntelligenceModels.RecoveryHealth;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeliveryIntelligenceHistoryReadRepository {
    private final JdbcTemplate jdbcTemplate;

    public DeliveryIntelligenceHistoryReadRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public OverviewResponse overview(
        int hours,
        int limit,
        String sort,
        int activityOffset,
        int attentionOffset,
        OffsetDateTime customFrom,
        OffsetDateTime customTo
    ) {
        OffsetDateTime generatedAt = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime windowStart;
        OffsetDateTime windowEnd;

        if (hours == 0 && customFrom != null && customTo != null) {
            windowStart = customFrom;
            windowEnd = customTo;
        } else if (hours == 0) {
            windowStart = loadAllTimeStart(generatedAt);
            windowEnd = generatedAt;
        } else {
            windowStart = generatedAt.minusHours(hours);
            windowEnd = generatedAt;
        }

        Page<ActivityItem> activity = loadRecentActivity(windowStart, windowEnd, limit, activityOffset, sort);
        Page<AttentionItem> attention = loadAttentionQueue(windowStart, windowEnd, limit, attentionOffset, sort);

        return new OverviewResponse(
            generatedAt,
            hours,
            windowStart,
            windowEnd,
            limit,
            activityOffset,
            attentionOffset,
            activity.hasMore(),
            attention.hasMore(),
            loadMetrics(windowStart, windowEnd),
            loadHourlyActivity(windowStart, windowEnd),
            loadProviderShare(windowStart, windowEnd),
            loadRecoveryHealth(windowStart, windowEnd),
            activity.items(),
            attention.items()
        );
    }

    private OffsetDateTime loadAllTimeStart(OffsetDateTime fallback) {
        return jdbcTemplate.query(
            """
            SELECT MIN(observed_at) AS earliest
              FROM (
                    SELECT created_at AS observed_at FROM delivery_schema.delivery_command
                    UNION ALL
                    SELECT created_at FROM delivery_schema.delivery_job
                    UNION ALL
                    SELECT created_at FROM delivery_schema.delivery_assignment
                    UNION ALL
                    SELECT occurred_at FROM delivery_schema.delivery_event
                    UNION ALL
                    SELECT received_at FROM delivery_schema.delivery_webhook_inbox
                   ) evidence
            """,
            (rs, rowNum) -> rs.getObject("earliest", OffsetDateTime.class)
        ).stream().findFirst().filter(value -> value != null).orElse(fallback);
    }

    private Metrics loadMetrics(OffsetDateTime from, OffsetDateTime to) {
        return jdbcTemplate.query(
            """
            SELECT
                (SELECT COUNT(*) FROM delivery_schema.delivery_command WHERE created_at >= ? AND created_at < ?) AS command_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_command WHERE created_at >= ? AND created_at < ? AND status = 'COMPLETED') AS completed_command_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_job WHERE created_at >= ? AND created_at < ?) AS delivery_job_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_job WHERE created_at >= ? AND created_at < ? AND status = 'DELIVERED') AS delivered_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_job
                  WHERE created_at >= ? AND created_at < ? AND status NOT IN ('DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED')) AS active_delivery_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_command
                  WHERE created_at >= ? AND created_at < ? AND (attempt_count > 1 OR provider_wait_attempt_count > 0 OR reconciliation_attempt_count > 0)) AS recovery_command_count,
                ((SELECT COUNT(*) FROM delivery_schema.delivery_command
                   WHERE created_at >= ? AND created_at < ? AND status IN ('FAILED', 'DEAD_LETTER', 'WAITING_FOR_PROVIDER', 'RECONCILIATION_PENDING'))
                 +
                 (SELECT COUNT(*) FROM delivery_schema.delivery_job
                   WHERE created_at >= ? AND created_at < ? AND tracking_dead_lettered_at IS NOT NULL)
                 +
                 (SELECT COUNT(*) FROM delivery_schema.delivery_webhook_inbox
                   WHERE received_at >= ? AND received_at < ? AND processing_status IN ('FAILED', 'DEAD_LETTER', 'REJECTED'))) AS attention_count
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
            from, to,
            from, to,
            from, to,
            from, to,
            from, to,
            from, to,
            from, to,
            from, to,
            from, to
        ).stream().findFirst().orElse(new Metrics(0, 0, 0, 0, 0, 0, 0));
    }

    private List<HourlyActivity> loadHourlyActivity(OffsetDateTime from, OffsetDateTime to) {
        return jdbcTemplate.query(
            """
            SELECT date_trunc('hour', observed_at) AS bucket_start,
                   COUNT(*) FILTER (WHERE kind = 'COMMAND') AS command_count,
                   COUNT(*) FILTER (WHERE kind = 'EVENT') AS delivery_event_count,
                   COUNT(*) FILTER (WHERE kind = 'EVENT' AND status = 'DELIVERED') AS delivered_count
              FROM (
                    SELECT created_at AS observed_at, 'COMMAND'::text AS kind, status
                      FROM delivery_schema.delivery_command
                     WHERE created_at >= ? AND created_at < ?
                    UNION ALL
                    SELECT occurred_at AS observed_at, 'EVENT'::text AS kind,
                           COALESCE(normalized_status, event_type) AS status
                      FROM delivery_schema.delivery_event
                     WHERE occurred_at >= ? AND occurred_at < ?
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
            from, to, from, to
        );
    }

    private List<ProviderShare> loadProviderShare(OffsetDateTime from, OffsetDateTime to) {
        List<ProviderCount> counts = jdbcTemplate.query(
            """
            SELECT assignment.selected_provider_id AS provider_id,
                   COALESCE(provider.display_name, assignment.selected_provider_id) AS display_name,
                   COUNT(*) AS selection_count
              FROM delivery_schema.delivery_assignment assignment
              LEFT JOIN delivery_schema.delivery_provider provider
                ON provider.provider_id = assignment.selected_provider_id
             WHERE assignment.created_at >= ?
               AND assignment.created_at < ?
               AND assignment.selected_provider_id IS NOT NULL
             GROUP BY assignment.selected_provider_id, provider.display_name
             ORDER BY selection_count DESC, assignment.selected_provider_id
            """,
            (rs, rowNum) -> new ProviderCount(
                rs.getString("provider_id"),
                rs.getString("display_name"),
                rs.getLong("selection_count")
            ),
            from, to
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

    private RecoveryHealth loadRecoveryHealth(OffsetDateTime from, OffsetDateTime to) {
        return jdbcTemplate.query(
            """
            SELECT
                (SELECT COUNT(*) FROM delivery_schema.delivery_command
                  WHERE created_at >= ? AND created_at < ? AND attempt_count > 1) AS retried_command_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_command
                  WHERE created_at >= ? AND created_at < ? AND (reconciliation_attempt_count > 0 OR status = 'RECONCILIATION_PENDING')) AS reconciliation_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_command
                  WHERE created_at >= ? AND created_at < ? AND (provider_wait_attempt_count > 0 OR status = 'WAITING_FOR_PROVIDER')) AS provider_wait_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_webhook_inbox
                  WHERE received_at >= ? AND received_at < ? AND processing_status = 'DEAD_LETTER') AS webhook_dead_letter_count,
                (SELECT COUNT(*) FROM delivery_schema.delivery_job
                  WHERE created_at >= ? AND created_at < ? AND tracking_dead_lettered_at IS NOT NULL) AS tracking_dead_letter_count
            """,
            (rs, rowNum) -> new RecoveryHealth(
                rs.getLong("retried_command_count"),
                rs.getLong("reconciliation_count"),
                rs.getLong("provider_wait_count"),
                rs.getLong("webhook_dead_letter_count"),
                rs.getLong("tracking_dead_letter_count")
            ),
            from, to,
            from, to,
            from, to,
            from, to,
            from, to
        ).stream().findFirst().orElse(new RecoveryHealth(0, 0, 0, 0, 0));
    }

    private Page<ActivityItem> loadRecentActivity(
        OffsetDateTime from,
        OffsetDateTime to,
        int limit,
        int offset,
        String sort
    ) {
        String direction = "asc".equals(sort) ? "ASC" : "DESC";
        String sql = """
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
                     WHERE command.updated_at >= ? AND command.updated_at < ?
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
                     WHERE assignment.updated_at >= ? AND assignment.updated_at < ?
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
                     WHERE event.occurred_at >= ? AND event.occurred_at < ?
                   ) recent
             ORDER BY occurred_at
            """.stripTrailing() + " " + direction + ", activity_id " + direction + "\n LIMIT ? OFFSET ?";

        List<ActivityItem> rows = jdbcTemplate.query(
            sql,
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
            from, to,
            from, to,
            from, to,
            limit + 1,
            offset
        );
        return page(rows, limit);
    }

    private Page<AttentionItem> loadAttentionQueue(
        OffsetDateTime from,
        OffsetDateTime to,
        int limit,
        int offset,
        String sort
    ) {
        String direction = "asc".equals(sort) ? "ASC" : "DESC";
        String sql = """
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
                     WHERE command.updated_at >= ? AND command.updated_at < ?
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
                     WHERE job.updated_at >= ? AND job.updated_at < ?
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
                     WHERE webhook.received_at >= ? AND webhook.received_at < ?
                       AND webhook.processing_status IN ('FAILED', 'DEAD_LETTER', 'REJECTED')
                   ) attention
             ORDER BY occurred_at
            """.stripTrailing() + " " + direction + ", reference_id " + direction + "\n LIMIT ? OFFSET ?";

        List<AttentionItem> rows = jdbcTemplate.query(
            sql,
            (rs, rowNum) -> new AttentionItem(
                rs.getString("reference_id"),
                rs.getObject("order_id", UUID.class),
                rs.getString("provider_id"),
                rs.getString("kind"),
                rs.getString("status"),
                rs.getObject("occurred_at", OffsetDateTime.class),
                rs.getBoolean("error_recorded")
            ),
            from, to,
            from, to,
            from, to,
            limit + 1,
            offset
        );
        return page(rows, limit);
    }

    private static <T> Page<T> page(List<T> rows, int limit) {
        boolean hasMore = rows.size() > limit;
        List<T> items = hasMore ? List.copyOf(rows.subList(0, limit)) : List.copyOf(rows);
        return new Page<>(items, hasMore);
    }

    private record ProviderCount(String providerId, String displayName, long selectionCount) {}
    private record Page<T>(List<T> items, boolean hasMore) {}
}
