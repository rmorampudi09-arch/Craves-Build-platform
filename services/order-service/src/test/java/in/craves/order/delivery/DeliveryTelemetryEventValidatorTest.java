package in.craves.order.delivery;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.order.delivery.DeliveryTelemetryModels.DeliveryTelemetryUpdatedData;
import in.craves.order.delivery.DeliveryTelemetryModels.EventEnvelope;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DeliveryTelemetryEventValidatorTest {
    private final DeliveryTelemetryEventValidator validator = new DeliveryTelemetryEventValidator();

    @Test
    void acceptsValidTelemetryEvent() {
        validator.validate(validEvent(new BigDecimal("17.44"), new BigDecimal("78.39")));
    }

    @Test
    void rejectsSingleCoordinate() {
        assertThatThrownBy(() -> validator.validate(validEvent(new BigDecimal("17.44"), null)))
            .isInstanceOf(DeliveryTelemetryEventValidator.DeliveryTelemetryValidationException.class)
            .hasMessageContaining("latitude and longitude");
    }

    @Test
    void rejectsInvalidDropoffWindow() {
        EventEnvelope<DeliveryTelemetryUpdatedData> base = validEvent(null, null);
        DeliveryTelemetryUpdatedData data = base.data();
        EventEnvelope<DeliveryTelemetryUpdatedData> invalid = new EventEnvelope<>(
            base.eventId(), base.eventType(), base.eventVersion(), base.occurredAt(),
            base.correlationId(), base.causationId(), base.source(), base.subject(),
            new DeliveryTelemetryUpdatedData(
                data.deliveryJobId(), data.orderId(), data.chefSubOrderId(), data.providerId(),
                data.providerDeliveryId(), data.status(), null, null, null,
                null, null,
                Instant.parse("2026-08-20T05:10:00Z"),
                Instant.parse("2026-08-20T05:00:00Z"),
                data.observedAt()
            )
        );

        assertThatThrownBy(() -> validator.validate(invalid))
            .isInstanceOf(DeliveryTelemetryEventValidator.DeliveryTelemetryValidationException.class)
            .hasMessageContaining("dropoff window end");
    }

    private static EventEnvelope<DeliveryTelemetryUpdatedData> validEvent(
        BigDecimal latitude,
        BigDecimal longitude
    ) {
        UUID eventId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID chefSubOrderId = UUID.randomUUID();
        UUID deliveryJobId = UUID.randomUUID();
        Instant observedAt = Instant.parse("2026-08-20T04:30:00Z");
        DeliveryTelemetryUpdatedData data = new DeliveryTelemetryUpdatedData(
            deliveryJobId,
            orderId,
            chefSubOrderId,
            "borzo",
            "12345",
            "IN_TRANSIT",
            latitude,
            longitude,
            latitude == null ? null : observedAt,
            Instant.parse("2026-08-20T04:35:00Z"),
            Instant.parse("2026-08-20T04:45:00Z"),
            Instant.parse("2026-08-20T05:00:00Z"),
            Instant.parse("2026-08-20T05:10:00Z"),
            observedAt
        );
        return new EventEnvelope<>(
            eventId,
            "DELIVERY_TELEMETRY_UPDATED",
            "1.0",
            observedAt,
            orderId,
            null,
            "integration-service",
            "delivery-job/" + deliveryJobId,
            data
        );
    }
}
