package in.craves.integration.delivery.telemetry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.TelemetrySnapshot;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DeliveryTelemetryPublisherServiceTest {

    @Test
    void publishesOnlyWhenActiveTelemetryMateriallyChanges() {
        DeliveryTelemetryExtractionService extraction = mock(DeliveryTelemetryExtractionService.class);
        DeliveryTelemetryRepository repository = mock(DeliveryTelemetryRepository.class);
        DeliveryOutboxRepository outbox = mock(DeliveryOutboxRepository.class);
        DeliveryTelemetryPublisherService service = new DeliveryTelemetryPublisherService(
            extraction, repository, outbox, new ObjectMapper(), new SimpleMeterRegistry()
        );
        TrackingWorkItem workItem = workItem();
        TrackingSnapshot snapshot = snapshot(DeliveryStatus.IN_TRANSIT);
        Instant observedAt = snapshot.observedAt();
        TelemetrySnapshot telemetry = new TelemetrySnapshot(
            new BigDecimal("17.440001"), new BigDecimal("78.390001"), observedAt,
            null, null,
            Instant.parse("2026-08-20T05:00:00Z"), Instant.parse("2026-08-20T05:10:00Z"),
            observedAt, "TRACK"
        );

        when(extraction.extract("borzo", snapshot)).thenReturn(telemetry);
        when(repository.find(workItem.deliveryJobId())).thenReturn(Optional.of(
            new DeliveryTelemetryRepository.StoredTelemetry(
                "borzo", "12345", null, null, null, null, null, null, null, null
            )
        ));

        DeliveryTelemetryPublisherService.CaptureResult result = service.capture(workItem, snapshot);

        assertThat(result.published()).isTrue();
        verify(repository).update(workItem.deliveryJobId(), telemetry);
        verify(outbox).enqueue(
            org.mockito.ArgumentMatchers.eq(DeliveryTelemetryModels.DELIVERY_TELEMETRY_UPDATED),
            org.mockito.ArgumentMatchers.eq(workItem.deliveryJobId()),
            org.mockito.ArgumentMatchers.eq(workItem.orderId()),
            any()
        );
    }

    @Test
    void terminalDeliveryNeverPublishesLiveTelemetry() {
        DeliveryTelemetryExtractionService extraction = mock(DeliveryTelemetryExtractionService.class);
        DeliveryTelemetryRepository repository = mock(DeliveryTelemetryRepository.class);
        DeliveryOutboxRepository outbox = mock(DeliveryOutboxRepository.class);
        DeliveryTelemetryPublisherService service = new DeliveryTelemetryPublisherService(
            extraction, repository, outbox, new ObjectMapper(), new SimpleMeterRegistry()
        );
        TrackingWorkItem workItem = workItem();
        TrackingSnapshot snapshot = snapshot(DeliveryStatus.DELIVERED);

        DeliveryTelemetryPublisherService.CaptureResult result = service.capture(workItem, snapshot);

        assertThat(result.published()).isFalse();
        assertThat(result.outcome()).isEqualTo("TERMINAL_STATE");
        verify(extraction, never()).extract(any(), any());
        verify(repository, never()).update(any(), any());
        verify(outbox, never()).enqueue(any(), any(), any(), any());
    }

    private static TrackingWorkItem workItem() {
        return new TrackingWorkItem(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "borzo", "12345", 1
        );
    }

    private static TrackingSnapshot snapshot(DeliveryStatus status) {
        Instant observedAt = Instant.parse("2026-08-20T04:30:00Z");
        return new TrackingSnapshot(
            new ProviderDelivery(
                "borzo", "12345", "CRV", status, status.name().toLowerCase(),
                null, null, null, new ObjectMapper().createObjectNode(), observedAt
            ),
            null,
            observedAt
        );
    }
}
