package in.craves.integration.monitoring;

import in.craves.integration.config.WorkerSchedulingConfiguration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * CH-04: silent-failure checks for money and delivery work owned by integration-service (alerts 3, 5, 7 and 8).
 * Read-only counts; each finding is one CRAVES_ALERT log line for the Log Analytics rules in infra/monitoring.
 */
@Component
@ConditionalOnProperty(prefix = "craves.monitoring", name = "enabled", havingValue = "true", matchIfMissing = true)
public class IntegrationAlertMonitor {
    private static final Logger LOGGER = LoggerFactory.getLogger(IntegrationAlertMonitor.class);

    // alert code -> count query; the single parameter is the lookback in days, so years-old rows do not page forever.
    static final Map<String, String> CHECKS = checks();

    private final JdbcTemplate jdbcTemplate;
    private final int lookbackDays;

    public IntegrationAlertMonitor(JdbcTemplate jdbcTemplate, @Value("${craves.monitoring.lookback-days:7}") int lookbackDays) {
        this.jdbcTemplate = jdbcTemplate;
        this.lookbackDays = lookbackDays;
    }

    private static Map<String, String> checks() {
        Map<String, String> checks = new LinkedHashMap<>();
        checks.put("REFUND_STALLED", """
            SELECT count(*) FROM payment_schema.refund
            WHERE status = 'REQUESTED' AND updated_at < now() - INTERVAL '10 minutes'
              AND updated_at > now() - (? * INTERVAL '1 day')
            """);
        checks.put("DELIVERY_COMMAND_STALLED", """
            SELECT count(*) FROM delivery_schema.delivery_command
            WHERE status = 'WAITING_FOR_PROVIDER' AND updated_at < now() - INTERVAL '10 minutes'
              AND updated_at > now() - (? * INTERVAL '1 day')
            """);
        checks.put("PAYOUT_STALLED", """
            SELECT count(*) FROM payment_schema.finance_payout_instruction
            WHERE status = 'RESERVED' AND updated_at < now() - INTERVAL '10 minutes'
              AND updated_at > now() - (? * INTERVAL '1 day')
            """);
        // Nothing publishes ledger_outbox yet, so this reports the backlog until a publisher exists (audit alert 8).
        checks.put("LEDGER_OUTBOX_BACKLOG", """
            SELECT count(*) FROM payment_schema.ledger_outbox
            WHERE status = 'PENDING' AND created_at < now() - INTERVAL '1 hour'
              AND created_at > now() - (? * INTERVAL '1 day')
            """);
        return Map.copyOf(checks);
    }

    @Scheduled(
        scheduler = WorkerSchedulingConfiguration.MONITOR_SCHEDULER,
        initialDelayString = "${craves.monitoring.initial-delay-ms:60000}",
        fixedDelayString = "${craves.monitoring.fixed-delay-ms:300000}"
    )
    public void check() {
        CHECKS.forEach((alert, sql) -> {
            try {
                Integer count = jdbcTemplate.queryForObject(sql, Integer.class, lookbackDays);
                if (count != null && count > 0) {
                    LOGGER.error("CRAVES_ALERT alert={} count={}", alert, count);
                }
            } catch (RuntimeException exception) {
                LOGGER.warn("Integration alert check {} could not run", alert, exception);
            }
        });
    }
}
