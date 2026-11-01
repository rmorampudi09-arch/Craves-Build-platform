package in.craves.order.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** R16 item 11: the explicit cancel integration-service reads (contracts/events/order-cancelled-v1.schema.json). */
class OrderCancelledEventFactoryTest {
    private final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().build();
    private final OrderCancelledEventFactory factory = new OrderCancelledEventFactory(objectMapper);

    @Test
    void createsOneVersionedEventPerChefOrderWithIsoTimestamps() throws Exception {
        UUID checkoutId = UUID.randomUUID();
        UUID chefSubOrderId = UUID.randomUUID();
        Instant cancelledAt = Instant.parse("2026-11-01T09:30:00Z");

        SerializedDomainEvent event = factory.create(new OrderCancelledEventData(checkoutId, chefSubOrderId, "CUSTOMER_CANCELLED",
            cancelledAt));

        assertThat(event.eventType()).isEqualTo("ORDER_CANCELLED");
        assertThat(event.eventVersion()).isEqualTo("1.0");
        assertThat(event.eventKey()).as("one per chef order in the outbox").isEqualTo("ORDER_CANCELLED:" + chefSubOrderId);
        assertThat(event.source()).isEqualTo("order-service");
        assertThat(event.subject()).isEqualTo(chefSubOrderId.toString());
        assertThat(event.correlationId()).as("the Service Bus transport needs one").isNotNull();
        assertThat(event.occurredAt()).isEqualTo(cancelledAt);
        JsonNode json = objectMapper.readTree(event.payloadJson());
        assertThat(json.path("eventId").asText()).isEqualTo(event.eventId().toString());
        assertThat(json.path("eventType").asText()).isEqualTo("ORDER_CANCELLED");
        assertThat(json.path("eventVersion").asText()).isEqualTo("1.0");
        assertThat(json.path("occurredAt").asText()).isEqualTo("2026-11-01T09:30:00Z");
        assertThat(json.path("source").asText()).isEqualTo("order-service");
        assertThat(json.path("subject").asText()).isEqualTo(chefSubOrderId.toString());
        JsonNode data = json.path("data");
        assertThat(data.path("checkoutId").asText()).isEqualTo(checkoutId.toString());
        assertThat(data.path("chefSubOrderId").asText()).isEqualTo(chefSubOrderId.toString());
        assertThat(data.path("reason").asText()).isEqualTo("CUSTOMER_CANCELLED");
        assertThat(data.path("cancelledAt").asText()).isEqualTo("2026-11-01T09:30:00Z");
        assertThat(data.size()).as("nothing about the customer").isEqualTo(4);
    }

    @Test
    void refusesAnEventWithoutItsOrderOrAReason() {
        assertThatThrownBy(() -> factory.create(new OrderCancelledEventData(UUID.randomUUID(), null, "CUSTOMER_CANCELLED", Instant.now())))
            .isInstanceOf(NullPointerException.class).hasMessage("chefSubOrderId is required");
        assertThatThrownBy(() -> factory.create(new OrderCancelledEventData(UUID.randomUUID(), UUID.randomUUID(), " ", Instant.now())))
            .isInstanceOf(IllegalArgumentException.class).hasMessage("reason is required");
        assertThatThrownBy(() -> factory.create(new OrderCancelledEventData(UUID.randomUUID(), UUID.randomUUID(), "CUSTOMER_CANCELLED", null)))
            .isInstanceOf(NullPointerException.class).hasMessage("cancelledAt is required");
    }
}
