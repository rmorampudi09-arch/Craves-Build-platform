package in.craves.order.outbox;

import in.craves.order.config.DomainEventOutboxProperties;
import in.craves.order.event.OrderCancelledEventData;
import in.craves.order.event.OrderCancelledEventFactory;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Writes ORDER_CANCELLED for a chef order its caller has just cancelled. It runs in the caller's transaction, so the event
 * commits or rolls back with the cancel. While ORDER_CANCELLED is off the publication allow-list
 * (CRAVES_DOMAIN_EVENT_ENABLED_TYPES) nothing is written, as with ORDER_HANDED_OVER, so no unpublished row waits in the
 * outbox. A repeat writes nothing new: the outbox's event key is the type and the order. A refund is not a cancel and
 * never calls this.
 */
@Component
public class OrderCancelledEventWriter {
    private final JdbcTemplate jdbcTemplate;
    private final OrderCancelledEventFactory events;
    private final OrderDomainOutboxRepository outboxRepository;
    private final DomainEventOutboxProperties outboxProperties;

    public OrderCancelledEventWriter(
        JdbcTemplate jdbcTemplate,
        OrderCancelledEventFactory events,
        OrderDomainOutboxRepository outboxRepository,
        DomainEventOutboxProperties outboxProperties
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.events = events;
        this.outboxRepository = outboxRepository;
        this.outboxProperties = outboxProperties;
    }

    /** reason is a code such as CHEF_DECLINED (contracts/events/order-cancelled-v1.schema.json). */
    public void write(UUID chefSubOrderId, String reason) {
        if (!outboxProperties.normalizedEnabledEventTypes().contains(OrderCancelledEventFactory.EVENT_TYPE)) {
            return;
        }
        // A meal-plan order has no checkout; it stands in for its own (as ORDER_READY_FOR_PICKUP). The cancel set updated_at.
        OrderCancelledEventData data = jdbcTemplate.queryForObject(
            "SELECT COALESCE(checkout_id, id), updated_at FROM order_schema.customer_order WHERE id = ?",
            (resultSet, rowNumber) -> new OrderCancelledEventData(
                resultSet.getObject(1, UUID.class), chefSubOrderId, reason, resultSet.getTimestamp(2).toInstant()),
            chefSubOrderId
        );
        outboxRepository.insert(chefSubOrderId, events.create(data));
    }
}
