package in.craves.order.event;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * ORDER_CANCELLED: order-service cancelled a chef order after the chef accepted it (R16 item 11). integration-service then
 * books no courier for it, ends its Craves rider trip (telling the rider) and cancels a Borzo or Pidge courier already
 * booked. One per chef order: the outbox's event key is the type and the order.
 *
 * <p>Nothing writes it yet: order-service has no customer or ops cancel after acceptance (a chef's decline or acceptance
 * timeout comes before it and requests a refund). The cancel that adds one writes it in its own transaction, and only
 * while ORDER_CANCELLED is on the publication allow-list (CRAVES_DOMAIN_EVENT_ENABLED_TYPES), as
 * ChefReadyForPickupService.markHandedOver does, so no unpublished row waits in the outbox:
 * <pre>
 * if (outboxProperties.normalizedEnabledEventTypes().contains(OrderCancelledEventFactory.EVENT_TYPE)) {
 *     outboxRepository.insert(orderId, cancelledEvents.create(new OrderCancelledEventData(checkoutId, orderId, reason, cancelledAt)));
 * }
 * </pre>
 * integration-service must run the release that reads it, and its subscription must let it through, before it is enabled
 * (docs/riders/BACKEND.md, dispatch chain step 7).
 */
@Component
public class OrderCancelledEventFactory {
    public static final String EVENT_TYPE = "ORDER_CANCELLED";
    public static final String EVENT_VERSION = "1.0";

    private final ObjectMapper objectMapper;

    public OrderCancelledEventFactory(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper.copy().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    public SerializedDomainEvent create(OrderCancelledEventData data) {
        Objects.requireNonNull(data, "event data is required");
        Objects.requireNonNull(data.checkoutId(), "checkoutId is required");
        Objects.requireNonNull(data.chefSubOrderId(), "chefSubOrderId is required");
        Objects.requireNonNull(data.cancelledAt(), "cancelledAt is required");
        if (!StringUtils.hasText(data.reason())) {
            throw new IllegalArgumentException("reason is required");
        }
        UUID eventId = UUID.randomUUID();
        String subject = data.chefSubOrderId().toString();
        DomainEventEnvelope<OrderCancelledEventData> envelope = new DomainEventEnvelope<>(eventId, EVENT_TYPE, EVENT_VERSION,
            data.cancelledAt(), eventId, null, OrderReadyForPickupEventFactory.SOURCE, subject, data);
        try {
            return new SerializedDomainEvent(eventId, EVENT_TYPE, EVENT_VERSION, data.cancelledAt(), eventId, null,
                OrderReadyForPickupEventFactory.SOURCE, subject, objectMapper.writeValueAsString(envelope));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("ORDER_CANCELLED serialization failed", exception);
        }
    }
}
