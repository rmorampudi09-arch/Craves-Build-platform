package in.craves.order.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.order.delivery.DeliveryStatusModels.DeliveryStatusChangedData;
import in.craves.order.delivery.DeliveryStatusModels.EventEnvelope;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DeliveryStatusEventValidatorTest {
    private final DeliveryStatusEventValidator validator = new DeliveryStatusEventValidator();

    @Test
    void acceptsCanonicalIntegrationEvent() {
        assertThatCode(() -> validator.validate(event("IN_TRANSIT", "https://track.example/1")))
            .doesNotThrowAnyException();
    }

    @Test
    void rejectsWrongSubject() {
        EventEnvelope<DeliveryStatusChangedData> valid = event("IN_TRANSIT", null);
        EventEnvelope<DeliveryStatusChangedData> invalid = new EventEnvelope<>(
            valid.eventId(),
            valid.eventType(),
            valid.eventVersion(),
            valid.occurredAt(),
            valid.correlationId(),
            valid.causationId(),
            valid.source(),
            "delivery-job/" + UUID.randomUUID(),
            valid.data()
        );

        assertThatThrownBy(() -> validator.validate(invalid))
            .isInstanceOf(DeliveryStatusEventValidator.DeliveryStatusValidationException.class)
            .hasMessageContaining("subject");
    }

    @Test
    void rejectsUnsupportedStatusAndUnsafeTrackingScheme() {
        assertThatThrownBy(() -> validator.validate(event("UNKNOWN", null)))
            .isInstanceOf(DeliveryStatusEventValidator.DeliveryStatusValidationException.class)
            .hasMessageContaining("Unsupported");

        assertThatThrownBy(() -> validator.validate(event("IN_TRANSIT", "javascript:alert(1)")))
            .isInstanceOf(DeliveryStatusEventValidator.DeliveryStatusValidationException.class)
            .hasMessageContaining("HTTP or HTTPS");
    }

    @Test
    void acceptsOnlyCompleteBorzoToPidgeHandoffMarkers() {
        EventEnvelope<DeliveryStatusChangedData> ordinary = event("SEARCHING", null);
        DeliveryStatusChangedData data = ordinary.data();
        assertThatCode(() -> validator.validate(withData(ordinary, new DeliveryStatusChangedData(
            data.deliveryJobId(), data.orderId(), data.chefSubOrderId(),
            "pidge", "pidge-order-1", "SEARCHING", null, data.observedAt(),
            "borzo", data.providerDeliveryId()
        )))).doesNotThrowAnyException();

        assertThatThrownBy(() -> validator.validate(withData(ordinary, new DeliveryStatusChangedData(
            data.deliveryJobId(), data.orderId(), data.chefSubOrderId(),
            "pidge", "pidge-order-1", "SEARCHING", null, data.observedAt(),
            "borzo", null
        )))).isInstanceOf(DeliveryStatusEventValidator.DeliveryStatusValidationException.class)
            .hasMessageContaining("both prior provider identifiers");

        assertThatThrownBy(() -> validator.validate(withData(ordinary, new DeliveryStatusChangedData(
            data.deliveryJobId(), data.orderId(), data.chefSubOrderId(),
            "pidge", "pidge-order-1", "SEARCHING", null, data.observedAt(),
            "shiprocket", data.providerDeliveryId()
        )))).isInstanceOf(DeliveryStatusEventValidator.DeliveryStatusValidationException.class)
            .hasMessageContaining("Borzo to Pidge");
    }

    @Test
    void continuationRequiresPriorBorzoIdentity() {
        EventEnvelope<DeliveryStatusChangedData> ordinary = event("SEARCHING", null);
        DeliveryStatusChangedData data = ordinary.data();
        assertThatCode(() -> validator.validate(withData(ordinary,
            new DeliveryStatusChangedData(data.deliveryJobId(), data.orderId(),
                data.chefSubOrderId(), "pidge", "pidge-order-1", "SEARCHING",
                null, data.observedAt(), "borzo", data.providerDeliveryId(), true))))
            .doesNotThrowAnyException();
        assertThatThrownBy(() -> validator.validate(withData(ordinary,
            new DeliveryStatusChangedData(data.deliveryJobId(), data.orderId(),
                data.chefSubOrderId(), "pidge", "pidge-order-1", "SEARCHING",
                null, data.observedAt(), null, null, true))))
            .isInstanceOf(DeliveryStatusEventValidator.DeliveryStatusValidationException.class)
            .hasMessageContaining("continuation requires prior provider");
    }

    @Test
    void deserializesOrdinaryEventsWithoutHandoffFields() throws Exception {
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        ObjectNode oldPayload = mapper.valueToTree(event("SEARCHING", null).data());
        oldPayload.remove("handoffFromProviderId");
        oldPayload.remove("handoffFromProviderDeliveryId");
        oldPayload.remove("handoffContinuation");

        DeliveryStatusChangedData decoded = mapper.treeToValue(
            oldPayload, DeliveryStatusChangedData.class);

        assertThat(decoded.hasHandoff()).isFalse();
        assertThat(decoded.handoffContinuation()).isNull();
        assertThat(decoded.providerId()).isEqualTo("borzo");
    }

    private static EventEnvelope<DeliveryStatusChangedData> withData(
        EventEnvelope<DeliveryStatusChangedData> event,
        DeliveryStatusChangedData data
    ) {
        return new EventEnvelope<>(event.eventId(), event.eventType(), event.eventVersion(),
            event.occurredAt(), event.correlationId(), event.causationId(), event.source(),
            event.subject(), data);
    }

    private static EventEnvelope<DeliveryStatusChangedData> event(
        String status,
        String trackingUrl
    ) {
        UUID deliveryJobId = UUID.randomUUID();
        UUID checkoutId = UUID.randomUUID();
        DeliveryStatusChangedData data = new DeliveryStatusChangedData(
            deliveryJobId,
            checkoutId,
            UUID.randomUUID(),
            "borzo",
            "provider-order-1",
            status,
            trackingUrl,
            Instant.parse("2026-07-28T08:30:00Z")
        );
        return new EventEnvelope<>(
            UUID.randomUUID(),
            "DELIVERY_STATUS_CHANGED",
            "1.0",
            Instant.parse("2026-07-28T08:30:01Z"),
            checkoutId,
            null,
            "integration-service",
            "delivery-job/" + deliveryJobId,
            data
        );
    }
}
