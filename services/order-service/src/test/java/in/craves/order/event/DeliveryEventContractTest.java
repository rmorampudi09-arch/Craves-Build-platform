package in.craves.order.event;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The JSON order-service writes for integration-service's delivery subscription is exactly the fixture. integration-service
 * keeps the same files (services/integration-service/src/test/resources/contracts) and reads them with its own models in
 * DeliveryServiceBusProcessorsTest, so change both copies together.
 */
class DeliveryEventContractTest {
    private final JsonMapper json = JsonMapper.builder().findAndAddModules().build();

    @Test
    void orderCancelledIsWrittenAsTheFixtureIntegrationServiceReads() throws Exception {
        ObjectNode fixture = fixture("order-cancelled-v1.json");
        JsonNode data = fixture.path("data");

        SerializedDomainEvent event = new OrderCancelledEventFactory(json).create(new OrderCancelledEventData(
            uuid(data, "checkoutId"), uuid(data, "chefSubOrderId"), data.path("reason").asText(),
            Instant.parse(data.path("cancelledAt").asText())));

        assertThat(json.readTree(event.payloadJson())).isEqualTo(withIdsOf(event, fixture));
        // The transport sends these as the Service Bus subject and the aggregateId property integration-service checks.
        assertThat(event.eventType()).isEqualTo("ORDER_CANCELLED");
        assertThat(event.subject()).isEqualTo(data.path("chefSubOrderId").asText());
    }

    @Test
    void orderReadyForPickupIsWrittenAsTheFixtureIntegrationServiceReads() throws Exception {
        ObjectNode fixture = fixture("order-ready-for-pickup-v1.json");
        JsonNode data = fixture.path("data");

        SerializedDomainEvent event = new OrderReadyForPickupEventFactory(json).create(new OrderReadyForPickupEventData(
            uuid(data, "orderId"), uuid(data, "chefSubOrderId"), Instant.parse(data.path("readyAt").asText())), null, null);

        assertThat(json.readTree(event.payloadJson())).isEqualTo(withIdsOf(event, fixture));
        assertThat(event.eventType()).isEqualTo("ORDER_READY_FOR_PICKUP");
        assertThat(event.subject()).isEqualTo(data.path("chefSubOrderId").asText());
    }

    /** Each event has a new random id, which is also its correlation id when the caller gave none. */
    private static ObjectNode withIdsOf(SerializedDomainEvent event, ObjectNode fixture) {
        assertThat(event.correlationId()).isEqualTo(event.eventId());
        fixture.put("eventId", event.eventId().toString());
        fixture.put("correlationId", event.eventId().toString());
        return fixture;
    }

    private ObjectNode fixture(String name) throws IOException {
        try (InputStream stream = getClass().getResourceAsStream("/contracts/" + name)) {
            return (ObjectNode) json.readTree(stream);
        }
    }

    private static UUID uuid(JsonNode data, String field) {
        return UUID.fromString(data.path(field).asText());
    }
}
