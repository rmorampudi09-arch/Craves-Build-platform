package in.craves.integration.delivery.telemetry;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderStatusUpdate;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusRepository.DeliveryJobState;
import in.craves.integration.delivery.status.DeliveryStatusRepository.TrackingWorkItem;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.DeliveryTelemetryUpdatedData;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.EventEnvelope;
import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.TelemetrySnapshot;
import io.micrometer.core.instrument.MeterRegistry;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeliveryTelemetryPublisherService {
    private final DeliveryTelemetryExtractionService extractionService;
    private final DeliveryTelemetryRepository repository;
    private final DeliveryOutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meterRegistry;

    public DeliveryTelemetryPublisherService(
        DeliveryTelemetryExtractionService extractionService,
        DeliveryTelemetryRepository repository,
        DeliveryOutboxRepository outboxRepository,
        ObjectMapper objectMapper,
        MeterRegistry meterRegistry
    ) {
        this.extractionService = extractionService;
        this.repository = repository;
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
    }

    @Transactional
    public CaptureResult capture(TrackingWorkItem workItem, TrackingSnapshot trackingSnapshot) {
        Objects.requireNonNull(workItem, "tracking work item is required");
        Objects.requireNonNull(trackingSnapshot, "tracking snapshot is required");
        if (trackingSnapshot.delivery() == null || trackingSnapshot.delivery().status() == null) {
            return result("NO_DELIVERY_STATE", false, workItem.providerId());
        }
        if (terminal(trackingSnapshot.delivery().status())) {
            return result("TERMINAL_STATE", false, workItem.providerId());
        }

        TelemetrySnapshot telemetry = extractionService.extract(workItem.providerId(), trackingSnapshot);
        return publishIfChanged(
            workItem.deliveryJobId(),
            workItem.orderId(),
            workItem.chefSubOrderId(),
            workItem.providerId(),
            workItem.providerDeliveryId(),
            trackingSnapshot.delivery().status(),
            telemetry
        );
    }

    @Transactional
    public CaptureResult captureWebhook(DeliveryJobState job, ProviderStatusUpdate update) {
        Objects.requireNonNull(job, "delivery job is required");
        Objects.requireNonNull(update, "provider status update is required");
        if (update.status() == null) {
            return result("NO_DELIVERY_STATE", false, job.providerId());
        }
        if (terminal(update.status())) {
            return result("TERMINAL_STATE", false, job.providerId());
        }
        TelemetrySnapshot telemetry = extractionService.extractWebhook(job.providerId(), update);
        return publishIfChanged(
            job.id(),
            job.orderId(),
            job.chefSubOrderId(),
            job.providerId(),
            job.providerDeliveryId(),
            update.status(),
            telemetry
        );
    }

    private CaptureResult publishIfChanged(
        UUID deliveryJobId,
        UUID orderId,
        UUID chefSubOrderId,
        String providerId,
        String providerDeliveryId,
        DeliveryStatus status,
        TelemetrySnapshot telemetry
    ) {
        if (telemetry == null || !telemetry.hasUsefulData()) {
            return result("NO_PROVIDER_TELEMETRY", false, providerId);
        }

        DeliveryTelemetryRepository.StoredTelemetry current = repository.find(deliveryJobId)
            .orElseThrow(() -> new IllegalStateException("Delivery job disappeared before telemetry capture"));
        if (!providerId.equalsIgnoreCase(current.providerId())
            || !providerDeliveryId.equals(current.providerDeliveryId())) {
            throw new IllegalStateException("Telemetry provider identity does not match delivery job");
        }
        if (current.observedAt() != null && !telemetry.observedAt().isAfter(current.observedAt())) {
            return result("STALE_TELEMETRY", false, providerId);
        }
        if (!changed(current, telemetry)) {
            return result("NO_TELEMETRY_CHANGE", false, providerId);
        }

        repository.update(deliveryJobId, telemetry);
        DeliveryTelemetryUpdatedData data = new DeliveryTelemetryUpdatedData(
            deliveryJobId,
            orderId,
            chefSubOrderId,
            providerId,
            providerDeliveryId,
            status.name(),
            telemetry.courierLatitude(),
            telemetry.courierLongitude(),
            telemetry.locationObservedAt(),
            telemetry.estimatedPickupAt(),
            telemetry.estimatedPickupStartAt(),
            telemetry.estimatedPickupEndAt(),
            telemetry.estimatedDropoffAt(),
            telemetry.estimatedDropoffStartAt(),
            telemetry.estimatedDropoffEndAt(),
            telemetry.observedAt()
        );
        EventEnvelope<DeliveryTelemetryUpdatedData> event = new EventEnvelope<>(
            UUID.randomUUID(),
            DeliveryTelemetryModels.DELIVERY_TELEMETRY_UPDATED,
            DeliveryTelemetryModels.EVENT_VERSION,
            Instant.now(),
            orderId,
            null,
            "integration-service",
            "delivery-job/" + deliveryJobId,
            data
        );
        outboxRepository.enqueue(
            DeliveryTelemetryModels.DELIVERY_TELEMETRY_UPDATED,
            deliveryJobId,
            orderId,
            objectMapper.valueToTree(event)
        );
        return result("PUBLISHED", true, providerId);
    }

    private CaptureResult result(String outcome, boolean published, String providerId) {
        meterRegistry.counter(
            "craves.integration.delivery.telemetry.capture",
            "provider", providerId == null ? "unknown" : providerId.toLowerCase(),
            "outcome", outcome.toLowerCase()
        ).increment();
        return new CaptureResult(published, outcome);
    }

    private static boolean changed(
        DeliveryTelemetryRepository.StoredTelemetry current,
        TelemetrySnapshot incoming
    ) {
        return different(current.courierLatitude(), incoming.courierLatitude())
            || different(current.courierLongitude(), incoming.courierLongitude())
            || different(current.estimatedPickupAt(), incoming.estimatedPickupAt())
            || different(current.estimatedPickupStartAt(), incoming.estimatedPickupStartAt())
            || different(current.estimatedPickupEndAt(), incoming.estimatedPickupEndAt())
            || different(current.estimatedDropoffAt(), incoming.estimatedDropoffAt())
            || different(current.estimatedDropoffStartAt(), incoming.estimatedDropoffStartAt())
            || different(current.estimatedDropoffEndAt(), incoming.estimatedDropoffEndAt());
    }

    private static boolean different(BigDecimal existing, BigDecimal incoming) {
        if (incoming == null) {
            return false;
        }
        return existing == null || existing.compareTo(incoming) != 0;
    }

    private static boolean different(Instant existing, Instant incoming) {
        return incoming != null && !incoming.equals(existing);
    }

    private static boolean terminal(DeliveryStatus status) {
        return status == DeliveryStatus.DELIVERED
            || status == DeliveryStatus.CANCELLED
            || status == DeliveryStatus.RETURNED
            || status == DeliveryStatus.FAILED;
    }

    public record CaptureResult(boolean published, String outcome) {
    }
}
