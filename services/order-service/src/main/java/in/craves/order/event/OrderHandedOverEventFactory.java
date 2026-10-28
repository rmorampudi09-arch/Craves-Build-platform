package in.craves.order.event;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * ORDER_HANDED_OVER: the chef handed the food to the courier (markHandedOver). The rider fleet keeps a trip with its rider
 * after it (integration-service, WORKPLAN P2-05). One per chef order: the outbox's event key is the type and the order.
 */
@Component
public class OrderHandedOverEventFactory {
    public static final String EVENT_TYPE = "ORDER_HANDED_OVER";
    public static final String EVENT_VERSION = "1.0";

    private final ObjectMapper objectMapper;

    public OrderHandedOverEventFactory(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper.copy().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    public SerializedDomainEvent create(OrderHandedOverEventData data) {
        Objects.requireNonNull(data, "event data is required");
        Objects.requireNonNull(data.orderId(), "orderId is required");
        Objects.requireNonNull(data.chefSubOrderId(), "chefSubOrderId is required");
        Objects.requireNonNull(data.handedOverAt(), "handedOverAt is required");
        UUID eventId = UUID.randomUUID();
        String subject = data.chefSubOrderId().toString();
        DomainEventEnvelope<OrderHandedOverEventData> envelope = new DomainEventEnvelope<>(eventId, EVENT_TYPE, EVENT_VERSION,
            data.handedOverAt(), eventId, null, OrderReadyForPickupEventFactory.SOURCE, subject, data);
        try {
            return new SerializedDomainEvent(eventId, EVENT_TYPE, EVENT_VERSION, data.handedOverAt(), eventId, null,
                OrderReadyForPickupEventFactory.SOURCE, subject, objectMapper.writeValueAsString(envelope));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("ORDER_HANDED_OVER serialization failed", exception);
        }
    }
}
