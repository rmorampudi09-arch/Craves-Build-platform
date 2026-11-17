package in.craves.integration.monitoring;

import in.craves.integration.config.WorkerSchedulingConfiguration;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.CourierApiUsage;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
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
    private DeliveryCommandProperties deliveryProperties;

    public IntegrationAlertMonitor(JdbcTemplate jdbcTemplate, @Value("${craves.monitoring.lookback-days:7}") int lookbackDays) {
        this.jdbcTemplate = jdbcTemplate;
        this.lookbackDays = lookbackDays;
    }

    /** The courier API usage switches (provider-api-usage-enabled, caps); without them, or off, usage is neither written nor alerted. */
    @Autowired(required = false)
    public void setDeliveryProperties(DeliveryCommandProperties deliveryProperties) {
        this.deliveryProperties = deliveryProperties;
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
        // The courier booking journal (V191; empty until CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED). updated_at is the state's age.
        checks.put("COURIER_UNRESOLVED_BOOKING", """
            SELECT count(*) FROM delivery_schema.provider_create_attempt
            WHERE created_at > now() - (? * INTERVAL '1 day') AND updated_at < now() - INTERVAL '10 minutes'
              AND (state IN ('INTENT', 'UNKNOWN')
                   OR (state = 'ORPHAN_SUSPECT' AND provider_ref IS NULL AND updated_at > now() - INTERVAL '2 hours'))
            """);
        // A courier refusing over 20% of at least 3 bookings in 15 minutes: an empty wallet or a changed key, not bad luck.
        checks.put("COURIER_REJECTED_RATE", """
            SELECT count(*) FROM (
                SELECT provider_id FROM delivery_schema.provider_create_attempt
                WHERE created_at > now() - INTERVAL '15 minutes' AND created_at > now() - (? * INTERVAL '1 day')
                GROUP BY provider_id
                HAVING count(*) >= 3 AND count(*) FILTER (WHERE state = 'REJECTED') * 5 > count(*)
            ) refusing
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
        if (deliveryProperties != null && deliveryProperties.isProviderApiUsageEnabled()) {
            courierApiUsage();
        }
    }

    /**
     * CRAVES_DELIVERY_PROVIDER_API_USAGE_ENABLED: adds this replica's courier API calls since the last run to the day's
     * row (India), so the row is the total over all replicas, at most one run behind. COURIER_API_USAGE_HIGH is logged once
     * per courier per day, by the replica whose update marks the row; COURIER_API_RATE_LIMITED by each replica that saw a 429.
     */
    void courierApiUsage() {
        CourierApiUsage.drainRateLimited().forEach((provider, count) ->
            LOGGER.error("CRAVES_ALERT alert=COURIER_API_RATE_LIMITED provider={} count={}", provider, count));
        CourierApiUsage.drainCalls().forEach((provider, calls) -> {
            try {
                jdbcTemplate.update("""
                    INSERT INTO delivery_schema.provider_api_usage (provider_id, day, calls)
                    VALUES (?, (now() AT TIME ZONE 'Asia/Kolkata')::date, ?)
                    ON CONFLICT (provider_id, day) DO UPDATE SET calls = provider_api_usage.calls + EXCLUDED.calls
                    """, provider, calls.intValue());
            } catch (RuntimeException exception) {
                CourierApiUsage.putBack(provider, calls);
                LOGGER.warn("Courier API usage of {} could not be written", provider, exception);
            }
        });
        int percent = deliveryProperties.getProviderApiUsageAlertPercent();
        deliveryProperties.getProviderApiDailyCaps().forEach((provider, cap) -> {
            if (cap == null || cap <= 0) {
                return;
            }
            try {
                jdbcTemplate.queryForList("""
                    UPDATE delivery_schema.provider_api_usage SET alerted_at = now()
                    WHERE provider_id = ? AND day = (now() AT TIME ZONE 'Asia/Kolkata')::date AND alerted_at IS NULL
                      AND calls::bigint * 100 >= ?::bigint * ?
                    RETURNING calls
                    """, Integer.class, provider, cap, percent).forEach(calls ->
                    LOGGER.error("CRAVES_ALERT alert=COURIER_API_USAGE_HIGH provider={} calls={} cap={} percent={}", provider, calls, cap,
                        percent));
            } catch (RuntimeException exception) {
                LOGGER.warn("Courier API usage of {} could not be checked", provider, exception);
            }
        });
    }
}
