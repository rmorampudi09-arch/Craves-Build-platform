package in.craves.integration.admin;

import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/operations/delivery-intelligence")
public class AdminDeliveryIntelligenceDashboardController {
    private static final int DEFAULT_WINDOW_HOURS = 168;
    private static final int MAX_WINDOW_HOURS = 720;
    private final JdbcTemplate jdbcTemplate;

    public AdminDeliveryIntelligenceDashboardController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/summary")
    public ResponseEntity<DashboardSummary> summary(
        Authentication authentication,
        @RequestParam(defaultValue = "168") int windowHours
    ) {
        requireAdmin(authentication);
        int hours = validateWindow(windowHours);

        long assignments = count(
            "SELECT count(*) FROM delivery_schema.delivery_assignment WHERE created_at >= now() - (? * interval '1 hour')",
            hours
        );
        long delivered = count(
            "SELECT count(*) FROM delivery_schema.delivery_job WHERE delivered_at >= now() - (? * interval '1 hour')",
            hours
        );
        long active = count(
            """
            SELECT count(*) FROM delivery_schema.delivery_job
             WHERE created_at >= now() - (? * interval '1 hour')
               AND status NOT IN ('DELIVERED', 'CANCELLED', 'FAILED')
            """,
            hours
        );
        long failed = count(
            "SELECT count(*) FROM delivery_schema.delivery_job WHERE created_at >= now() - (? * interval '1 hour') AND status = 'FAILED'",
            hours
        );
        long fallbacks = count(
            """
            SELECT count(*)
              FROM delivery_schema.delivery_assignment a
              JOIN delivery_schema.delivery_assignment_candidate c ON c.id = a.selected_candidate_id
             WHERE a.created_at >= now() - (? * interval '1 hour')
               AND c.candidate_rank > 1
            """,
            hours
        );
        long deadLetters = count(
            """
            SELECT count(*) FROM delivery_schema.delivery_command
             WHERE created_at >= now() - (? * interval '1 hour')
               AND status = 'DEAD_LETTER'
            """,
            hours
        );
        long webhookFailures = count(
            """
            SELECT count(*) FROM delivery_schema.delivery_webhook_inbox
             WHERE received_at >= now() - (? * interval '1 hour')
               AND processing_status IN ('FAILED', 'REJECTED')
            """,
            hours
        );

        List<TrendPoint> trend = jdbcTemplate.query(
            """
            WITH days AS (
                SELECT generate_series(
                    date_trunc('day', now() - (? * interval '1 hour')),
                    date_trunc('day', now()), interval '1 day'
                ) AS day
            ), assignments AS (
                SELECT date_trunc('day', created_at) AS day, count(*) AS total
                  FROM delivery_schema.delivery_assignment
                 WHERE created_at >= now() - (? * interval '1 hour')
                 GROUP BY 1
            ), delivered AS (
                SELECT date_trunc('day', delivered_at) AS day, count(*) AS total
                  FROM delivery_schema.delivery_job
                 WHERE delivered_at >= now() - (? * interval '1 hour')
                 GROUP BY 1
            )
            SELECT d.day::date AS day, COALESCE(a.total, 0) AS assignments, COALESCE(x.total, 0) AS delivered
              FROM days d
              LEFT JOIN assignments a ON a.day = d.day
              LEFT JOIN delivered x ON x.day = d.day
             ORDER BY d.day
            """,
            (rs, rowNum) -> new TrendPoint(
                rs.getObject("day", LocalDate.class), rs.getLong("assignments"), rs.getLong("delivered")
            ), hours, hours, hours
        );

        List<ProviderPerformance> providers = jdbcTemplate.query(
            """
            SELECT p.provider_id, p.display_name, p.is_active,
                   COALESCE(a.selections, 0) AS selections,
                   o.average_score, COALESCE(o.outcomes, 0) AS outcomes,
                   r.stored_avg, r.lifetime_order_count
              FROM delivery_schema.delivery_provider p
              LEFT JOIN (
                  SELECT selected_provider_id AS provider_id, count(*) AS selections
                    FROM delivery_schema.delivery_assignment
                   WHERE created_at >= now() - (? * interval '1 hour')
                     AND selected_provider_id IS NOT NULL
                   GROUP BY selected_provider_id
              ) a ON a.provider_id = p.provider_id
              LEFT JOIN (
                  SELECT provider_id, avg(composite_score) AS average_score, count(*) AS outcomes
                    FROM delivery_schema.delivery_score_hot
                   WHERE occurred_at >= now() - (? * interval '1 hour')
                   GROUP BY provider_id
              ) o ON o.provider_id = p.provider_id
              LEFT JOIN delivery_schema.delivery_partner_rolling_state r ON r.provider_id = p.provider_id
             ORDER BY COALESCE(a.selections, 0) DESC, p.provider_id
            """,
            (rs, rowNum) -> new ProviderPerformance(
                rs.getString("provider_id"), rs.getString("display_name"), rs.getBoolean("is_active"),
                rs.getLong("selections"), nullableDouble(rs.getObject("average_score")), rs.getLong("outcomes"),
                nullableDouble(rs.getObject("stored_avg")), rs.getLong("lifetime_order_count")
            ), hours, hours
        );

        List<RecentDecision> recent = jdbcTemplate.query(
            """
            SELECT a.id, a.order_id, a.chef_sub_order_id, a.strategy, a.status, a.scoring_version,
                   a.selected_provider_id, a.created_at, c.candidate_rank, c.final_score,
                   c.pickup_eta_minutes, c.quoted_cost, c.currency, c.status AS candidate_status
              FROM delivery_schema.delivery_assignment a
              LEFT JOIN delivery_schema.delivery_assignment_candidate c ON c.id = a.selected_candidate_id
             WHERE a.created_at >= now() - (? * interval '1 hour')
             ORDER BY a.created_at DESC
             LIMIT 30
            """,
            (rs, rowNum) -> new RecentDecision(
                rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getObject("chef_sub_order_id", UUID.class), rs.getString("strategy"), rs.getString("status"),
                rs.getString("scoring_version"), rs.getString("selected_provider_id"),
                rs.getObject("candidate_rank", Integer.class), nullableDouble(rs.getObject("final_score")),
                nullableDouble(rs.getObject("pickup_eta_minutes")), rs.getBigDecimal("quoted_cost"),
                rs.getString("currency"), rs.getString("candidate_status"),
                rs.getObject("created_at", OffsetDateTime.class)
            ), hours
        );

        List<OperationalException> exceptions = jdbcTemplate.query(
            """
            SELECT id, order_id, chef_sub_order_id, status, attempt_count, last_error, updated_at
              FROM delivery_schema.delivery_command
             WHERE created_at >= now() - (? * interval '1 hour')
               AND status IN ('FAILED', 'DEAD_LETTER')
             ORDER BY updated_at DESC
             LIMIT 20
            """,
            (rs, rowNum) -> new OperationalException(
                rs.getObject("id", UUID.class), rs.getObject("order_id", UUID.class),
                rs.getObject("chef_sub_order_id", UUID.class), rs.getString("status"), rs.getInt("attempt_count"),
                safeError(rs.getString("last_error")), rs.getObject("updated_at", OffsetDateTime.class)
            ), hours
        );

        DashboardSummary body = new DashboardSummary(
            OffsetDateTime.now(), hours,
            new DashboardMetrics(assignments, delivered, active, failed, fallbacks, deadLetters, webhookFailures),
            trend, providers, recent, exceptions
        );
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<OrderInvestigation> investigateOrder(
        Authentication authentication,
        @PathVariable UUID orderId,
        @RequestHeader("X-Admin-Reason") String reason,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader
    ) {
        CravesPrincipal principal = requireAdmin(authentication);
        String validatedReason = validateReason(reason);
        UUID correlationId = correlationId(correlationHeader);
        boolean exactLocationAllowed = principal.hasAnyRole("PLATFORM_ADMIN", "SUPPORT_ADMIN", "OPERATIONS_ADMIN");

        AssignmentSnapshot assignment = jdbcTemplate.query(
            """
            SELECT id, chef_sub_order_id, order_id, strategy, status, scoring_version,
                   selected_candidate_id, selected_provider_id, selected_agent_id, created_at, updated_at
              FROM delivery_schema.delivery_assignment
             WHERE order_id = ?
             ORDER BY created_at DESC
             LIMIT 1
            """,
            (rs, rowNum) -> new AssignmentSnapshot(
                rs.getObject("id", UUID.class), rs.getObject("chef_sub_order_id", UUID.class),
                rs.getObject("order_id", UUID.class), rs.getString("strategy"), rs.getString("status"),
                rs.getString("scoring_version"), rs.getObject("selected_candidate_id", UUID.class),
                rs.getString("selected_provider_id"), rs.getString("selected_agent_id"),
                rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class)
            ), orderId
        ).stream().findFirst().orElse(null);

        List<CandidateSnapshot> candidates = assignment == null ? List.of() : jdbcTemplate.query(
            """
            SELECT id, candidate_rank, provider_id, provider_quote_id, agent_id, pickup_distance_km,
                   pickup_eta_minutes, quoted_cost, currency, predicted_success_probability,
                   combined_score, live_avg, stored_avg, momentum, exploration_sample,
                   provider_quality_score, proximity_score, final_score, status, created_at, updated_at
              FROM delivery_schema.delivery_assignment_candidate
             WHERE assignment_id = ?
             ORDER BY candidate_rank
            """,
            (rs, rowNum) -> new CandidateSnapshot(
                rs.getObject("id", UUID.class), rs.getInt("candidate_rank"), rs.getString("provider_id"),
                rs.getString("provider_quote_id"), rs.getString("agent_id"),
                nullableDouble(rs.getObject("pickup_distance_km")), nullableDouble(rs.getObject("pickup_eta_minutes")),
                rs.getBigDecimal("quoted_cost"), rs.getString("currency"),
                rs.getDouble("predicted_success_probability"), rs.getDouble("combined_score"),
                nullableDouble(rs.getObject("live_avg")), rs.getDouble("stored_avg"), rs.getString("momentum"),
                rs.getDouble("exploration_sample"), rs.getDouble("provider_quality_score"),
                rs.getDouble("proximity_score"), rs.getDouble("final_score"), rs.getString("status"),
                rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class)
            ), assignment.assignmentId()
        );

        List<CommandSnapshot> commands = jdbcTemplate.query(
            """
            SELECT id, chef_sub_order_id, command_type, status, ready_at, dispatch_at, attempt_count,
                   reconciliation_provider_id, reconciliation_started_at, reconciliation_attempt_count,
                   next_reconciliation_at, last_error, created_at, updated_at
              FROM delivery_schema.delivery_command
             WHERE order_id = ?
             ORDER BY created_at
            """,
            (rs, rowNum) -> new CommandSnapshot(
                rs.getObject("id", UUID.class), rs.getObject("chef_sub_order_id", UUID.class),
                rs.getString("command_type"), rs.getString("status"),
                rs.getObject("ready_at", OffsetDateTime.class), rs.getObject("dispatch_at", OffsetDateTime.class),
                rs.getInt("attempt_count"), rs.getString("reconciliation_provider_id"),
                rs.getObject("reconciliation_started_at", OffsetDateTime.class),
                rs.getInt("reconciliation_attempt_count"), rs.getObject("next_reconciliation_at", OffsetDateTime.class),
                safeError(rs.getString("last_error")), rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
            ), orderId
        );

        List<JobSnapshot> jobs = jdbcTemplate.query(
            """
            SELECT id, chef_sub_order_id, assignment_id, provider_id, provider_delivery_id,
                   provider_quote_id, assigned_agent_id, status, provider_status, tracking_url,
                   booked_at, picked_up_at, delivered_at, last_status_observed_at, last_status_source,
                   courier_latitude, courier_longitude, courier_location_observed_at,
                   estimated_pickup_start_at, estimated_pickup_end_at,
                   estimated_dropoff_start_at, estimated_dropoff_end_at,
                   telemetry_observed_at, telemetry_source, created_at, updated_at
              FROM delivery_schema.delivery_job
             WHERE order_id = ?
             ORDER BY created_at
            """,
            (rs, rowNum) -> new JobSnapshot(
                rs.getObject("id", UUID.class), rs.getObject("chef_sub_order_id", UUID.class),
                rs.getObject("assignment_id", UUID.class), rs.getString("provider_id"),
                rs.getString("provider_delivery_id"), rs.getString("provider_quote_id"),
                rs.getString("assigned_agent_id"), rs.getString("status"), rs.getString("provider_status"),
                rs.getString("tracking_url"), rs.getObject("booked_at", OffsetDateTime.class),
                rs.getObject("picked_up_at", OffsetDateTime.class), rs.getObject("delivered_at", OffsetDateTime.class),
                rs.getObject("last_status_observed_at", OffsetDateTime.class), rs.getString("last_status_source"),
                exactLocationAllowed ? rs.getBigDecimal("courier_latitude") : null,
                exactLocationAllowed ? rs.getBigDecimal("courier_longitude") : null,
                rs.getObject("courier_location_observed_at", OffsetDateTime.class),
                rs.getObject("estimated_pickup_start_at", OffsetDateTime.class),
                rs.getObject("estimated_pickup_end_at", OffsetDateTime.class),
                rs.getObject("estimated_dropoff_start_at", OffsetDateTime.class),
                rs.getObject("estimated_dropoff_end_at", OffsetDateTime.class),
                rs.getObject("telemetry_observed_at", OffsetDateTime.class), rs.getString("telemetry_source"),
                rs.getObject("created_at", OffsetDateTime.class), rs.getObject("updated_at", OffsetDateTime.class)
            ), orderId
        );

        List<EventSnapshot> events = jdbcTemplate.query(
            """
            SELECT e.id, e.delivery_job_id, e.provider_id, e.provider_event_id,
                   e.event_type, e.normalized_status, e.occurred_at, e.created_at
              FROM delivery_schema.delivery_event e
              JOIN delivery_schema.delivery_job j ON j.id = e.delivery_job_id
             WHERE j.order_id = ?
             ORDER BY e.occurred_at, e.created_at
            """,
            (rs, rowNum) -> new EventSnapshot(
                rs.getObject("id", UUID.class), rs.getObject("delivery_job_id", UUID.class),
                rs.getString("provider_id"), rs.getString("provider_event_id"), rs.getString("event_type"),
                rs.getString("normalized_status"), rs.getObject("occurred_at", OffsetDateTime.class),
                rs.getObject("created_at", OffsetDateTime.class)
            ), orderId
        );

        List<OutcomeSnapshot> outcomes = jdbcTemplate.query(
            """
            SELECT delivery_id, chef_sub_order_id, provider_id, composite_score, status,
                   distance_km, area, occurred_at, breakdown
              FROM delivery_schema.delivery_score_hot
             WHERE order_id = ?
             ORDER BY occurred_at
            """,
            (rs, rowNum) -> new OutcomeSnapshot(
                rs.getObject("delivery_id", UUID.class), rs.getObject("chef_sub_order_id", UUID.class),
                rs.getString("provider_id"), rs.getDouble("composite_score"), rs.getString("status"),
                rs.getDouble("distance_km"), rs.getString("area"), rs.getObject("occurred_at", OffsetDateTime.class)
            ), orderId
        );

        if (assignment == null && commands.isEmpty() && jobs.isEmpty() && outcomes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Delivery activity was not found for this order");
        }

        jdbcTemplate.update(
            """
            INSERT INTO payment_schema.admin_investigation_audit
                (id, actor_identity_id, resource_type, resource_id, action, reason, correlation_id, created_at)
            VALUES (?, ?, 'DELIVERY_ORDER', ?, 'INVESTIGATE', ?, ?, now())
            """,
            UUID.randomUUID(), principal.identityId(), orderId, validatedReason, correlationId
        );

        OrderInvestigation body = new OrderInvestigation(
            orderId, exactLocationAllowed, assignment, candidates, commands, jobs, events, outcomes
        );
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .header("X-Correlation-ID", correlationId.toString()).body(body);
    }

    private long count(String sql, Object... args) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class, args);
        return value == null ? 0L : value;
    }

    private static int validateWindow(int windowHours) {
        if (windowHours < 1 || windowHours > MAX_WINDOW_HOURS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "windowHours must be between 1 and 720");
        }
        return windowHours == 0 ? DEFAULT_WINDOW_HOURS : windowHours;
    }

    private static CravesPrincipal requireAdmin(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CravesPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves access token is required");
        }
        if (!principal.hasAnyRole(
            "PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN"
        )) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Administrator role is required");
        }
        return principal;
    }

    private static String validateReason(String value) {
        String normalized = value == null ? "" : value.replace('\n', ' ').replace('\r', ' ').trim();
        if (normalized.length() < 10 || normalized.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Admin-Reason must contain 10 to 500 characters");
        }
        return normalized;
    }

    private static UUID correlationId(String value) {
        if (value == null || value.isBlank()) return UUID.randomUUID();
        try { return UUID.fromString(value.trim()); }
        catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Correlation-ID must be a UUID");
        }
    }

    private static Double nullableDouble(Object value) {
        return value instanceof Number number ? number.doubleValue() : null;
    }

    private static String safeError(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 500 ? normalized.substring(0, 500) : normalized;
    }

    public record DashboardSummary(
        OffsetDateTime generatedAt,
        int windowHours,
        DashboardMetrics metrics,
        List<TrendPoint> trend,
        List<ProviderPerformance> providers,
        List<RecentDecision> recentDecisions,
        List<OperationalException> exceptions
    ) {}

    public record DashboardMetrics(
        long assignments,
        long delivered,
        long active,
        long failed,
        long fallbacks,
        long deadLetters,
        long webhookFailures
    ) {}

    public record TrendPoint(LocalDate day, long assignments, long delivered) {}

    public record ProviderPerformance(
        String providerId,
        String displayName,
        boolean active,
        long selections,
        Double averageOutcomeScore,
        long outcomes,
        Double storedAverageScore,
        long lifetimeOrderCount
    ) {}

    public record RecentDecision(
        UUID assignmentId,
        UUID orderId,
        UUID chefSubOrderId,
        String strategy,
        String assignmentStatus,
        String scoringVersion,
        String selectedProviderId,
        Integer selectedRank,
        Double finalScore,
        Double pickupEtaMinutes,
        BigDecimal quotedCost,
        String currency,
        String candidateStatus,
        OffsetDateTime createdAt
    ) {}

    public record OperationalException(
        UUID commandId,
        UUID orderId,
        UUID chefSubOrderId,
        String status,
        int attemptCount,
        String lastError,
        OffsetDateTime updatedAt
    ) {}

    public record OrderInvestigation(
        UUID orderId,
        boolean exactCourierLocationAllowed,
        AssignmentSnapshot assignment,
        List<CandidateSnapshot> candidates,
        List<CommandSnapshot> commands,
        List<JobSnapshot> jobs,
        List<EventSnapshot> events,
        List<OutcomeSnapshot> outcomes
    ) {}

    public record AssignmentSnapshot(
        UUID assignmentId,
        UUID chefSubOrderId,
        UUID orderId,
        String strategy,
        String status,
        String scoringVersion,
        UUID selectedCandidateId,
        String selectedProviderId,
        String selectedAgentId,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}

    public record CandidateSnapshot(
        UUID candidateId,
        int rank,
        String providerId,
        String providerQuoteId,
        String agentId,
        Double pickupDistanceKm,
        Double pickupEtaMinutes,
        BigDecimal quotedCost,
        String currency,
        double predictedSuccessProbability,
        double combinedScore,
        Double liveAverage,
        double storedAverage,
        String momentum,
        double explorationSample,
        double providerQualityScore,
        double proximityScore,
        double finalScore,
        String status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}

    public record CommandSnapshot(
        UUID commandId,
        UUID chefSubOrderId,
        String commandType,
        String status,
        OffsetDateTime readyAt,
        OffsetDateTime dispatchAt,
        int attemptCount,
        String reconciliationProviderId,
        OffsetDateTime reconciliationStartedAt,
        int reconciliationAttemptCount,
        OffsetDateTime nextReconciliationAt,
        String lastError,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}

    public record JobSnapshot(
        UUID deliveryJobId,
        UUID chefSubOrderId,
        UUID assignmentId,
        String providerId,
        String providerDeliveryId,
        String providerQuoteId,
        String assignedAgentId,
        String status,
        String providerStatus,
        String trackingUrl,
        OffsetDateTime bookedAt,
        OffsetDateTime pickedUpAt,
        OffsetDateTime deliveredAt,
        OffsetDateTime lastStatusObservedAt,
        String lastStatusSource,
        BigDecimal courierLatitude,
        BigDecimal courierLongitude,
        OffsetDateTime courierLocationObservedAt,
        OffsetDateTime estimatedPickupStartAt,
        OffsetDateTime estimatedPickupEndAt,
        OffsetDateTime estimatedDropoffStartAt,
        OffsetDateTime estimatedDropoffEndAt,
        OffsetDateTime telemetryObservedAt,
        String telemetrySource,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}

    public record EventSnapshot(
        UUID eventId,
        UUID deliveryJobId,
        String providerId,
        String providerEventId,
        String eventType,
        String normalizedStatus,
        OffsetDateTime occurredAt,
        OffsetDateTime createdAt
    ) {}

    public record OutcomeSnapshot(
        UUID deliveryId,
        UUID chefSubOrderId,
        String providerId,
        double compositeScore,
        String status,
        double distanceKm,
        String area,
        OffsetDateTime occurredAt
    ) {}
}
