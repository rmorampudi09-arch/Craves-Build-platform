package in.craves.order.service;

import in.craves.order.config.ChefAcceptanceWindowProperties;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class AutoRefundMetrics {
    private static final Logger LOGGER = LoggerFactory.getLogger(AutoRefundMetrics.class);

    private final JdbcTemplate jdbcTemplate;
    private final ChefAcceptanceWindowProperties properties;
    private final AtomicLong expiredBacklog = new AtomicLong();
    private final AtomicLong claimedBacklog = new AtomicLong();
    private final AtomicLong staleClaims = new AtomicLong();
    private final AtomicLong maxTimeoutAttempts = new AtomicLong();
    private final AtomicLong oldestOverdueSeconds = new AtomicLong();
    private final AtomicLong refundRequestOutboxBacklog = new AtomicLong();

    public AutoRefundMetrics(
        JdbcTemplate jdbcTemplate,
        ChefAcceptanceWindowProperties properties,
        MeterRegistry meterRegistry
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
        Gauge.builder("craves.auto.refund.timeout.expired.backlog", expiredBacklog, AtomicLong::get)
            .description("Expired chef-acceptance orders still awaiting timeout resolution")
            .register(meterRegistry);
        Gauge.builder("craves.auto.refund.timeout.claimed.backlog", claimedBacklog, AtomicLong::get)
            .description("Expired chef-acceptance orders currently claimed by timeout workers")
            .register(meterRegistry);
        Gauge.builder("craves.auto.refund.timeout.stale.claims", staleClaims, AtomicLong::get)
            .description("Expired timeout claims old enough to be reclaimed")
            .register(meterRegistry);
        Gauge.builder("craves.auto.refund.timeout.max.attempts", maxTimeoutAttempts, AtomicLong::get)
            .description("Maximum timeout claim attempt count among pending expired orders")
            .register(meterRegistry);
        Gauge.builder("craves.auto.refund.timeout.oldest.overdue.seconds", oldestOverdueSeconds, AtomicLong::get)
            .description("Age in seconds of the oldest unresolved expired chef-acceptance order")
            .register(meterRegistry);
        Gauge.builder("craves.auto.refund.request.outbox.backlog", refundRequestOutboxBacklog, AtomicLong::get)
            .description("REFUND_REQUESTED domain events not yet published")
            .register(meterRegistry);
    }

    @Scheduled(
        fixedDelayString = "${craves.chef-acceptance.metrics-fixed-delay-ms:30000}",
        initialDelayString = "${craves.chef-acceptance.metrics-initial-delay-ms:10000}"
    )
    public void refresh() {
        try {
            expiredBacklog.set(number("""
                SELECT COUNT(*)
                FROM order_schema.customer_order
                WHERE status = 'CHEF_ACCEPTANCE_PENDING'
                  AND chef_acceptance_expires_at IS NOT NULL
                  AND chef_acceptance_expires_at <= now()
                """));

            claimedBacklog.set(number("""
                SELECT COUNT(*)
                FROM order_schema.customer_order
                WHERE status = 'CHEF_ACCEPTANCE_PENDING'
                  AND chef_acceptance_expires_at IS NOT NULL
                  AND chef_acceptance_expires_at <= now()
                  AND chef_acceptance_timeout_claim_token IS NOT NULL
                """));

            staleClaims.set(jdbcTemplate.queryForObject(
                """
                    SELECT COUNT(*)
                    FROM order_schema.customer_order
                    WHERE status = 'CHEF_ACCEPTANCE_PENDING'
                      AND chef_acceptance_expires_at IS NOT NULL
                      AND chef_acceptance_expires_at <= now()
                      AND chef_acceptance_timeout_claim_token IS NOT NULL
                      AND chef_acceptance_timeout_claimed_at < now() - (? * INTERVAL '1 second')
                    """,
                Long.class,
                properties.validatedTimeoutClaimStaleSeconds()
            ));

            maxTimeoutAttempts.set(number("""
                SELECT COALESCE(MAX(chef_acceptance_timeout_attempt_count), 0)
                FROM order_schema.customer_order
                WHERE status = 'CHEF_ACCEPTANCE_PENDING'
                  AND chef_acceptance_expires_at IS NOT NULL
                  AND chef_acceptance_expires_at <= now()
                """));

            oldestOverdueSeconds.set(number("""
                SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MIN(chef_acceptance_expires_at)))::bigint, 0)
                FROM order_schema.customer_order
                WHERE status = 'CHEF_ACCEPTANCE_PENDING'
                  AND chef_acceptance_expires_at IS NOT NULL
                  AND chef_acceptance_expires_at <= now()
                """));

            refundRequestOutboxBacklog.set(number("""
                SELECT COUNT(*)
                FROM order_schema.domain_event_outbox
                WHERE event_type = 'REFUND_REQUESTED'
                  AND status <> 'PUBLISHED'
                """));
        } catch (RuntimeException exception) {
            LOGGER.warn("Auto-refund production metrics refresh failed: {}", safeMessage(exception));
        }
    }

    private long number(String sql) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class);
        return value == null ? 0L : value;
    }

    private static String safeMessage(Throwable exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) {
            return exception.getClass().getSimpleName();
        }
        String normalized = message.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 500 ? normalized.substring(0, 500) : normalized;
    }
}
