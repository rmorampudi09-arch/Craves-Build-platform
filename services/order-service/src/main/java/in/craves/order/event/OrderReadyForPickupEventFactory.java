package in.craves.order.event;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class OrderReadyForPickupEventFactory {
    public static final String EVENT_TYPE = "ORDER_READY_FOR_PICKUP";
    public static final String EVENT_VERSION = "1.0";
    public static final String SOURCE = "order-service";

    private final ObjectMapper objectMapper;

    public OrderReadyForPickupEventFactory(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper.copy()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    public SerializedDomainEvent create(
        OrderReadyForPickupEventData data,
        UUID requestedCorrelationId,
        String idempotencyKey
    ) {
        validate(data);

        UUID eventId = UUID.randomUUID();
        UUID correlationId = requestedCorrelationId == null ? eventId : requestedCorrelationId;
        UUID causationId = causationId(idempotencyKey);
        String subject = data.chefSubOrderId().toString();

        DomainEventEnvelope<OrderReadyForPickupEventData> envelope = new DomainEventEnvelope<>(
            eventId,
            EVENT_TYPE,
            EVENT_VERSION,
            data.readyAt(),
            correlationId,
            causationId,
            SOURCE,
            subject,
            data
        );

        try {
            return new SerializedDomainEvent(
                eventId,
                EVENT_TYPE,
                EVENT_VERSION,
                data.readyAt(),
                correlationId,
                causationId,
                SOURCE,
                subject,
                objectMapper.writeValueAsString(envelope)
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("ORDER_READY_FOR_PICKUP serialization failed", exception);
        }
    }

    private static void validate(OrderReadyForPickupEventData data) {
        Objects.requireNonNull(data, "event data is required");
        Objects.requireNonNull(data.orderId(), "orderId is required");
        Objects.requireNonNull(data.chefSubOrderId(), "chefSubOrderId is required");
        Objects.requireNonNull(data.readyAt(), "readyAt is required");
    }

    private static UUID causationId(String idempotencyKey) {
        if (!StringUtils.hasText(idempotencyKey)) {
            return null;
        }
        return UUID.nameUUIDFromBytes(
            ("order-ready-for-pickup:" + idempotencyKey.trim())
                .getBytes(StandardCharsets.UTF_8)
        );
    }
}
