package in.craves.order.event;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class OrderReadyForPickupEventFactoryTest {
    private final JsonMapper objectMapper = JsonMapper.builder().findAndAddModules().build();
    private final OrderReadyForPickupEventFactory factory =
        new OrderReadyForPickupEventFactory(objectMapper);

    @Test
    void createsVersionedReadyForPickupEventWithoutDeliveryPii() throws Exception {
        UUID orderId = UUID.randomUUID();
        UUID subOrderId = UUID.randomUUID();
        Instant readyAt = Instant.parse("2026-09-09T01:00:00Z");

        SerializedDomainEvent event = factory.create(
            new OrderReadyForPickupEventData(orderId, subOrderId, readyAt),
            null,
            "ready-test-key"
        );

        assertThat(event.eventType()).isEqualTo("ORDER_READY_FOR_PICKUP");
        assertThat(event.eventVersion()).isEqualTo("1.0");
        assertThat(event.subject()).isEqualTo(subOrderId.toString());
        assertThat(event.eventKey()).isEqualTo("ORDER_READY_FOR_PICKUP:" + subOrderId);

        JsonNode payload = objectMapper.readTree(event.payloadJson());
        assertThat(payload.path("data").path("orderId").asText()).isEqualTo(orderId.toString());
        assertThat(payload.path("data").path("chefSubOrderId").asText()).isEqualTo(subOrderId.toString());
        assertThat(payload.path("data").path("readyAt").asText()).isEqualTo(readyAt.toString());
        assertThat(event.payloadJson()).doesNotContain("contactPhone", "address", "recipientName");
    }
}
