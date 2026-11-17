package in.craves.integration.delivery.command;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Behind CRAVES_DELIVERY_COMMAND_SWEEPER_ENABLED (off: nothing here runs). A delivery command is run by Service Bus
 * messages; one whose message never comes stays where it is. Every reconciliation tick (15 s) this finds commands that are
 * due with nobody working on them and sends each one message under a new id, and ends a command still without a courier
 * once its promised ready time is courier-wait-cap-minutes old. The worker's own rules do the rest (claim, takeover after
 * the lease, attempt limit). RECONCILIATION_PENDING is not swept: the reconciliation worker polls it and ends it itself.
 */
@Component
public class DeliveryCommandSweeper {
    private static final Logger log = LoggerFactory.getLogger(DeliveryCommandSweeper.class);
    /** last_error of a command ended by the cap, and the worker's receipt for a later message of it. */
    static final String WAIT_CAP = "COURIER_WAIT_CAP";

    // Commands dispatched over a day ago stay as they are: switching the sweeper on re-sends no old order.
    private static final String OPEN_RECENT = """
        c.status IN ('SCHEDULED', 'WAITING_FOR_PROVIDER', 'FAILED', 'PROCESSING') AND c.dispatch_at > now() - INTERVAL '24 hours'
        """;
    // Due for longer than the margin, and not written for as long (the rescue's own claim writes updated_at).
    // A command held for the food (food-timed dispatch) stays SCHEDULED with its first dispatch_at, so with that on an
    // untapped one counts as due only once its longest hold is over.
    private static final String IDLE_DUE = """
        c.updated_at < now() - make_interval(secs => :margin)
        AND ((c.status = 'SCHEDULED'
              AND CASE WHEN :foodTimed AND c.ready_at = c.promised_ready_at
                       THEN GREATEST(c.dispatch_at, c.promised_ready_at + make_interval(mins => :holdMinutes))
                       ELSE c.dispatch_at END < now() - make_interval(secs => :margin))
          OR (c.status = 'WAITING_FOR_PROVIDER' AND c.next_provider_retry_at < now() - make_interval(secs => :margin))
          OR (c.status = 'FAILED' AND c.updated_at < now() - make_interval(secs => :margin
                + LEAST(:retryBase * power(2, LEAST(GREATEST(c.attempt_count, 1) - 1, 20)), :retryMax)))
          OR (c.status = 'PROCESSING' AND c.processing_started_at < now() - make_interval(mins => :leaseMinutes, secs => :margin)))
        """;
    // Craves riders deciding (an open fleet stage) is not a wait on couriers.
    private static final String PAST_CAP = """
        COALESCE(c.promised_ready_at, c.ready_at, c.dispatch_at) < now() - make_interval(mins => :capMinutes)
        AND NOT EXISTS (SELECT 1 FROM fleet_schema.trip t JOIN fleet_schema.trip_stage s ON s.trip_id = t.id
                        WHERE t.chef_sub_order_id = c.chef_sub_order_id AND s.state = 'OPEN' AND s.provider = 'CRAVES_FLEET')
        """;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;
    private final DeliveryServiceBusPublisher publisher;
    private final DeliveryCommandProperties properties;
    private final DeliveryCommandRetryProperties retry;

    public DeliveryCommandSweeper(JdbcTemplate jdbc,
                                  ObjectMapper json,
                                  ObjectProvider<DeliveryServiceBusPublisher> publisher,
                                  DeliveryCommandProperties properties,
                                  DeliveryCommandRetryProperties retry) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
        this.json = json;
        this.publisher = publisher.getIfAvailable();
        this.properties = properties;
        this.retry = retry;
    }

    /** Never throws: the caller's own work goes on whatever happens here. */
    public void sweep() {
        if (!properties.isSweeperEnabled() || !properties.isEnabled() || publisher == null) {
            return;
        }
        try {
            Map<String, Object> settings = Map.of(
                "margin", properties.getSweeperMarginSeconds(),
                "capMinutes", properties.getCourierWaitCapMinutes(),
                "limit", properties.getReconciliationBatchSize(),
                "foodTimed", properties.isFoodTimedDispatchEnabled(),
                "holdMinutes", (int) DeliveryCommandScheduler.MAX_READY_CORRECTION.toMinutes(),
                "retryBase", retry.getBaseSeconds(),
                "retryMax", retry.getMaxSeconds(),
                // The lease the worker's takeover claim uses.
                "leaseMinutes", properties.isBookingJournalEnabled() ? ProviderCreateAttemptRepository.COMMAND_LEASE_MINUTES : 10);
            endCapped(settings);
            for (Map<String, Object> row : claimIdleDue(settings)) {
                resend(row);
            }
        } catch (RuntimeException ex) {
            log.error("Delivery command sweep could not run", ex);
        }
    }

    /** Still waiting on couriers, or due with nobody working on it, past the cap: ended, and a person is told. */
    private void endCapped(Map<String, Object> settings) {
        List<Map<String, Object>> ended = jdbc.queryForList("""
            WITH capped AS (
                SELECT c.id, c.status AS was FROM delivery_schema.delivery_command c
                WHERE %s AND %s AND (c.status = 'WAITING_FOR_PROVIDER' OR (%s))
                ORDER BY c.dispatch_at
                FOR UPDATE OF c SKIP LOCKED
                LIMIT :limit
            )
            UPDATE delivery_schema.delivery_command c
            SET status = 'DEAD_LETTER', processing_started_at = NULL, next_provider_retry_at = NULL,
                last_error = '%s', updated_at = now()
            FROM capped WHERE c.id = capped.id
            RETURNING c.id, c.chef_sub_order_id, c.order_id, capped.was
            """.formatted(OPEN_RECENT, PAST_CAP, IDLE_DUE, WAIT_CAP), settings);
        for (Map<String, Object> row : ended) {
            log.error("CRAVES_ALERT alert=DELIVERY_COURIER_WAIT_CAP commandId={} chefSubOrderId={} orderId={} was={} capMinutes={}",
                row.get("id"), row.get("chef_sub_order_id"), row.get("order_id"), row.get("was"), settings.get("capMinutes"));
        }
    }

    /** The claim: only the replica whose update moved updated_at sends, and nobody sends again within the margin. */
    private List<Map<String, Object>> claimIdleDue(Map<String, Object> settings) {
        return jdbc.queryForList("""
            WITH due AS (
                SELECT c.id FROM delivery_schema.delivery_command c
                WHERE %s AND %s AND NOT (%s)
                ORDER BY c.updated_at
                FOR UPDATE OF c SKIP LOCKED
                LIMIT :limit
            )
            UPDATE delivery_schema.delivery_command c
            SET updated_at = now()
            FROM due WHERE c.id = due.id
            RETURNING c.id, c.chef_sub_order_id, c.status, c.attempt_count, CAST(c.payload AS text) AS payload
            """.formatted(OPEN_RECENT, IDLE_DUE, PAST_CAP), settings);
    }

    private void resend(Map<String, Object> row) {
        try {
            // A new id each time: the queue drops a repeated one for 10 minutes.
            publisher.publishNow(json.readValue((String) row.get("payload"), DeliveryCommandMessage.class),
                "delivery-sweep:" + row.get("id") + ":" + UUID.randomUUID());
            log.warn("CRAVES_ALERT alert=DELIVERY_COMMAND_SWEPT commandId={} chefSubOrderId={} status={} attemptCount={}",
                row.get("id"), row.get("chef_sub_order_id"), row.get("status"), row.get("attempt_count"));
        } catch (RuntimeException | JsonProcessingException ex) {
            // Due again one margin from now.
            log.error("CRAVES_ALERT alert=DELIVERY_COMMAND_SWEPT commandId={} chefSubOrderId={} status={} sent=false reason={}",
                row.get("id"), row.get("chef_sub_order_id"), row.get("status"), ex.getClass().getSimpleName());
        }
    }
}
