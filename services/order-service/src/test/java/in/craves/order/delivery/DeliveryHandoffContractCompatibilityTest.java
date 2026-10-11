package in.craves.order.delivery;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.order.delivery.DeliveryStatusModels.*;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;

class DeliveryHandoffContractCompatibilityTest {
    final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    final DeliveryStatusEventValidator validator = new DeliveryStatusEventValidator();
    EventEnvelope<DeliveryStatusChangedData> legacy() {
        UUID job = UUID.randomUUID(), checkout = UUID.randomUUID();
        return new EventEnvelope<>(UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0", Instant.now(), checkout,
            null, "integration-service", "delivery-job/" + job, new DeliveryStatusChangedData(job, checkout,
            UUID.randomUUID(), "borzo", "old-test", "SEARCHING", null, Instant.now()));
    }
    EventEnvelope<DeliveryStatusChangedData> parse(ObjectNode node) throws Exception {
        return json.readValue(node.toString(), json.getTypeFactory().constructParametricType(EventEnvelope.class, DeliveryStatusChangedData.class));
    }
    @Test void originalEightFieldEventAndConstructorRemainAccepted() throws Exception {
        var event = legacy(); assertFalse(event.data().hasHandoff());
        ObjectNode wire = json.valueToTree(event); ((ObjectNode)wire.path("data")).remove(java.util.List.of("handoffFromProviderId", "handoffFromProviderDeliveryId", "handoffContinuation"));
        assertDoesNotThrow(() -> validator.validate(parse(wire)));
    }
    @ParameterizedTest @ValueSource(strings={"wrongOldProvider","wrongNewProvider","missingOldId","blankOldId","missingOldProvider","falseContinuation","continuationAlone"})
    void malformedProvenanceCannotEnableProviderSwitch(String mutation) throws Exception {
        ObjectNode wire = json.valueToTree(legacy()); var data = (ObjectNode)wire.path("data");
        data.put("providerId", "pidge").put("providerDeliveryId", "new-test").put("handoffFromProviderId", "borzo").put("handoffFromProviderDeliveryId", "old-test");
        switch(mutation) {
            case "wrongOldProvider" -> data.put("handoffFromProviderId", "other");
            case "wrongNewProvider" -> data.put("providerId", "other");
            case "missingOldId" -> data.remove("handoffFromProviderDeliveryId");
            case "blankOldId" -> data.put("handoffFromProviderDeliveryId", " ");
            case "missingOldProvider" -> data.remove("handoffFromProviderId");
            case "falseContinuation" -> data.put("handoffContinuation", false);
            case "continuationAlone" -> { data.remove("handoffFromProviderId"); data.remove("handoffFromProviderDeliveryId"); data.put("handoffContinuation", true); }
            default -> throw new AssertionError();
        }
        assertEquals("Unsupported delivery handoff provenance", assertThrows(DeliveryStatusEventValidator.DeliveryStatusValidationException.class,
            () -> validator.validate(parse(wire))).getMessage());
    }
    @ParameterizedTest @ValueSource(strings={"CHEF_ACCEPTED", "PREPARING"})
    void deliveredEventDoesNotChangeChefCommercialEligibility(String status) {
        assertEquals(status, DeliveryStatusUpdateService.commercialStatusForDelivery(status, "DELIVERED"));
    }
}
