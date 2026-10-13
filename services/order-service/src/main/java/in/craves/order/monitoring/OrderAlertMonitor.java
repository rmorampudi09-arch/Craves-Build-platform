package in.craves.order.monitoring;

import in.craves.order.config.WorkerSchedulingConfiguration;
import java.sql.ResultSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * CH-04: the stuck-order sweeper (alert 13) and the overdue chef acceptance check (alert 4).
 * Read-only: it reports, it never cancels or refunds. Each finding is one CRAVES_ALERT log line that the
 * Log Analytics rules in infra/monitoring turn into a page.
 */
@Component
@ConditionalOnProperty(prefix = "craves.monitoring", name = "enabled", havingValue = "true", matchIfMissing = true)
public class OrderAlertMonitor {
    private static final Logger LOGGER = LoggerFactory.getLogger(OrderAlertMonitor.class);

    // Non-terminal orders that should move without a customer action. PAYMENT_PENDING is left out: an abandoned
    // checkout is normal. Scheduled and meal-plan orders count from their service time, not from acceptance.
    static final String STUCK_ORDERS_SQL = """
        SELECT status, count(*) AS stuck,
               array_to_string((array_agg(id::text ORDER BY updated_at))[1:5], ',') AS sample
        FROM order_schema.customer_order
        WHERE updated_at < now() - (? * INTERVAL '1 minute')
          AND updated_at > now() - (? * INTERVAL '1 day')
          AND COALESCE(scheduled_service_at, requested_fulfilment_at, updated_at) < now() - (? * INTERVAL '1 minute')
          AND (status IN ('CREATED', 'PAID', 'CHEF_ACCEPTANCE_PENDING', 'CHEF_ACCEPTED', 'PREPARING',
                          'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'REFUND_PENDING')
               OR (status = 'CHEF_REJECTED' AND refund_requested_at IS NOT NULL))
        GROUP BY status
        """;

    static final String OVERDUE_ACCEPTANCE_SQL = """
        SELECT count(*)
        FROM order_schema.customer_order
        WHERE status = 'CHEF_ACCEPTANCE_PENDING'
          AND chef_acceptance_expires_at < now() - INTERVAL '2 minutes'
          AND chef_acceptance_expires_at > now() - (? * INTERVAL '1 day')
        """;

    private final JdbcTemplate jdbcTemplate;
    private final int stuckAfterMinutes;
    private final int lookbackDays;

    public OrderAlertMonitor(
        JdbcTemplate jdbcTemplate,
        @Value("${craves.monitoring.stuck-order-minutes:90}") int stuckAfterMinutes,
        @Value("${craves.monitoring.lookback-days:7}") int lookbackDays
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.stuckAfterMinutes = stuckAfterMinutes;
        this.lookbackDays = lookbackDays;
    }

    @Scheduled(
        scheduler = WorkerSchedulingConfiguration.MONITOR_SCHEDULER,
        initialDelayString = "${craves.monitoring.initial-delay-ms:60000}",
        fixedDelayString = "${craves.monitoring.fixed-delay-ms:300000}"
    )
    public void check() {
        try {
            jdbcTemplate.query(STUCK_ORDERS_SQL, (ResultSet row) -> {
                LOGGER.error(
                    "CRAVES_ALERT alert=STUCK_ORDER status={} count={} noTransitionMinutes={} sampleOrderIds={}",
                    row.getString("status"), row.getInt("stuck"), stuckAfterMinutes, row.getString("sample")
                );
            }, stuckAfterMinutes, lookbackDays, stuckAfterMinutes);

            Integer overdue = jdbcTemplate.queryForObject(OVERDUE_ACCEPTANCE_SQL, Integer.class, lookbackDays);
            if (overdue != null && overdue > 0) {
                LOGGER.error("CRAVES_ALERT alert=CHEF_ACCEPTANCE_OVERDUE count={}", overdue);
            }
        } catch (RuntimeException exception) {
            LOGGER.warn("Order alert monitor could not run its checks", exception);
        }
    }
}
