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
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.DeliveryJobState;
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
    void publishesOnlyWhenActiveTrackingTelemetryMateriallyChanges() {
        DeliveryTelemetryExtractionService extraction = mock(DeliveryTelemetryExtractionService.class);
        DeliveryTelemetryRepository repository = mock(DeliveryTelemetryRepository.class);
        DeliveryOutboxRepository outbox = mock(DeliveryOutboxRepository.class);
        DeliveryTelemetryPublisherService service = new DeliveryTelemetryPublisherService(
            extraction, repository, outbox, objectMapper(), new SimpleMeterRegistry()
        );
        TrackingWorkItem workItem = workItem();
        TrackingSnapshot snapshot = snapshot(DeliveryStatus.IN_TRANSIT);
        Instant observedAt = snapshot.observedAt();
        TelemetrySnapshot telemetry = new TelemetrySnapshot(
            new BigDecimal("17.440001"),
            new BigDecimal("78.390001"),
            observedAt,
            null,
            null,
            null,
            Instant.parse("2026-08-20T05:05:00Z"),
            Instant.parse("2026-08-20T05:00:00Z"),
            Instant.parse("2026-08-20T05:10:00Z"),
            observedAt,
            "TRACK"
        );

        when(extraction.extract("borzo", snapshot)).thenReturn(telemetry);
        when(repository.find(workItem.deliveryJobId())).thenReturn(Optional.of(emptyStored("borzo", "12345")));

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
    void publishesWebhookTelemetryEvenWhenProviderUsesPushData() {
        DeliveryTelemetryExtractionService extraction = mock(DeliveryTelemetryExtractionService.class);
        DeliveryTelemetryRepository repository = mock(DeliveryTelemetryRepository.class);
        DeliveryOutboxRepository outbox = mock(DeliveryOutboxRepository.class);
        DeliveryTelemetryPublisherService service = new DeliveryTelemetryPublisherService(
            extraction, repository, outbox, objectMapper(), new SimpleMeterRegistry()
        );
        UUID jobId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID subOrderId = UUID.randomUUID();
        Instant observedAt = Instant.parse("2026-08-20T04:31:00Z");
        DeliveryJobState job = new DeliveryJobState(
            jobId, orderId, subOrderId, "shiprocket", "AWB123", "IN_TRANSIT",
            "IN TRANSIT", "https://tracking.example/AWB123", observedAt.minusSeconds(30)
        );
        ProviderStatusUpdate update = new ProviderStatusUpdate(
            "shiprocket", "AWB123", "AWB123", DeliveryStatus.IN_TRANSIT,
            "IN TRANSIT", "https://tracking.example/AWB123", observedAt,
            objectMapper().createObjectNode()
        );
        TelemetrySnapshot telemetry = new TelemetrySnapshot(
            new BigDecimal("17.450001"), new BigDecimal("78.400001"), observedAt,
            null, null, null,
            Instant.parse("2026-08-20T05:10:00Z"), null, null,
            observedAt, "WEBHOOK"
        );

        when(extraction.extractWebhook("shiprocket", update)).thenReturn(telemetry);
        when(repository.find(jobId)).thenReturn(Optional.of(emptyStored("shiprocket", "AWB123")));

        var result = service.captureWebhook(job, update);

        assertThat(result.published()).isTrue();
        verify(repository).update(jobId, telemetry);
        verify(outbox).enqueue(
            org.mockito.ArgumentMatchers.eq(DeliveryTelemetryModels.DELIVERY_TELEMETRY_UPDATED),
            org.mockito.ArgumentMatchers.eq(jobId),
            org.mockito.ArgumentMatchers.eq(orderId),
            any()
        );
    }

    @Test
    void terminalDeliveryNeverPublishesLiveTelemetry() {
        DeliveryTelemetryExtractionService extraction = mock(DeliveryTelemetryExtractionService.class);
        DeliveryTelemetryRepository repository = mock(DeliveryTelemetryRepository.class);
        DeliveryOutboxRepository outbox = mock(DeliveryOutboxRepository.class);
        DeliveryTelemetryPublisherService service = new DeliveryTelemetryPublisherService(
            extraction, repository, outbox, objectMapper(), new SimpleMeterRegistry()
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

    private static DeliveryTelemetryRepository.StoredTelemetry emptyStored(
        String providerId,
        String providerDeliveryId
    ) {
        return new DeliveryTelemetryRepository.StoredTelemetry(
            providerId,
            providerDeliveryId,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
        );
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
                null, null, null, objectMapper().createObjectNode(), observedAt
            ),
            null,
            observedAt
        );
    }

    private static ObjectMapper objectMapper() {
        return new ObjectMapper().findAndRegisterModules();
    }
}
