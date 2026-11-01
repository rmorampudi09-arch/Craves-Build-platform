package in.craves.integration.delivery.command;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The next dispatch round from a decline itself (R16 5c). While riders decide, the order's command looks again only every
 * few seconds (FleetDispatcher.ROUND_CHECK_EVERY); with one rider per offer, each declined round would wait that long. Once
 * the decline commits, a command still waiting for its riders becomes due now and one message runs it. Without the message
 * (Service Bus down), the next check starts the round as before; a stale scheduled message finds the command not due and
 * is put back (DeliveryCommandWorker.handleUnclaimed).
 */
@Component
@ConditionalOnProperty(name = "craves.delivery-command.enabled", havingValue = "true")
public class DeliveryCommandWake {
    private static final Logger LOGGER = LoggerFactory.getLogger(DeliveryCommandWake.class);

    private final JdbcTemplate jdbc;
    private final DeliveryServiceBusPublisher publisher;
    private final ObjectMapper json;

    public DeliveryCommandWake(JdbcTemplate jdbc, DeliveryServiceBusPublisher publisher, ObjectMapper json) {
        this.jdbc = jdbc;
        this.publisher = publisher;
        this.json = json;
    }

    /** Call in the transaction that declined the offer: the wake runs after it commits, off the rider's request. */
    public void afterDecline(UUID offerId) {
        Runnable wake = () -> Thread.ofVirtual().name("fleet-decline-wake").start(() -> wake(offerId));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    wake.run();
                }
            });
        } else {
            wake.run();
        }
    }

    /** True when the offer's order was waiting for its riders and the message went. */
    boolean wake(UUID offerId) {
        try {
            List<String> due = jdbc.queryForList("""
                UPDATE delivery_schema.delivery_command c
                SET next_provider_retry_at = now(), updated_at = now()
                FROM fleet_schema.trip_offer o
                JOIN fleet_schema.trip t ON t.id = o.trip_id
                WHERE o.id = ? AND c.chef_sub_order_id = t.chef_sub_order_id AND c.status = 'WAITING_FOR_PROVIDER'
                RETURNING c.payload::text
                """, String.class, offerId);
            if (due.isEmpty()) {
                return false;
            }
            // One id per offer: a repeated wake for it is dropped by Service Bus duplicate detection.
            publisher.publishNow(json.readValue(due.get(0), DeliveryCommandMessage.class), "fleet-decline:" + offerId);
            LOGGER.info("FLEET_DECLINE_WAKE offer={}", offerId);
            return true;
        } catch (RuntimeException | JsonProcessingException exception) {
            LOGGER.warn("FLEET_DECLINE_WAKE offer={} failed: {}", offerId, exception.getClass().getSimpleName());
            return false;
        }
    }
}
