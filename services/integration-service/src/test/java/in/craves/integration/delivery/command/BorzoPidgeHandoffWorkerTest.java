package in.craves.integration.delivery.command;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.integration.config.BorzoProperties;
import in.craves.integration.config.PidgeProperties;
import in.craves.integration.delivery.borzo.BorzoApiClient;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository.Handoff;
import in.craves.integration.delivery.command.DeliveryJobRepository.HandoffJob;
import in.craves.integration.delivery.pidge.PidgeApiClient;
import in.craves.integration.delivery.pidge.PidgeBookingRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;

class BorzoPidgeHandoffWorkerTest {
    private final BorzoPidgeHandoffRepository handoffs = mock(BorzoPidgeHandoffRepository.class);
    private final DeliveryJobRepository jobs = mock(DeliveryJobRepository.class);
    private final DeliveryCommandRepository commands = mock(DeliveryCommandRepository.class);
    private final DeliveryOutboxRepository outbox = mock(DeliveryOutboxRepository.class);
    private final OrderHandoffEligibilityClient eligibility = mock(OrderHandoffEligibilityClient.class);
    private final DeliveryProviderCatalogRepository catalog = mock(DeliveryProviderCatalogRepository.class);
    private final BorzoApiClient borzo = mock(BorzoApiClient.class);
    private final BorzoProperties borzoProperties = mock(BorzoProperties.class);
    private final PidgeApiClient pidge = mock(PidgeApiClient.class);
    private final PidgeProperties pidgeProperties = mock(PidgeProperties.class);
    private final PidgeBookingRepository bookings = mock(PidgeBookingRepository.class);
    private final DeliveryStatusUpdateService statusUpdates = mock(DeliveryStatusUpdateService.class);
    private final BorzoPidgeHandoffCompletionService completion =
        mock(BorzoPidgeHandoffCompletionService.class);

    private BorzoPidgeHandoffWorker worker() {
        return worker(borzoProperties);
    }

    private BorzoPidgeHandoffWorker worker(BorzoProperties runtime) {
        return new BorzoPidgeHandoffWorker(handoffs, jobs, commands, outbox, eligibility,
            catalog, borzo, runtime, pidge, pidgeProperties, bookings,
            statusUpdates, completion);
    }

    @Test
    void claimsEachJobOnlyWhenReadyToProcessIt() {
        Handoff first = handoff("PROCESSING_BORZO");
        Handoff second = handoff("PROCESSING_BORZO");
        when(handoffs.claimDue(1)).thenReturn(List.of(first), List.of(second), List.of());
        when(jobs.findHandoffJob(first.deliveryJobId()))
            .thenReturn(Optional.of(job(first, "COURIER_ASSIGNED")));
        when(jobs.findHandoffJob(second.deliveryJobId()))
            .thenReturn(Optional.of(job(second, "COURIER_ASSIGNED")));

        worker().processDue();

        verify(handoffs, times(3)).claimDue(1);
        verify(handoffs).markRetainedByWorker(first.deliveryJobId());
        verify(handoffs).markRetainedByWorker(second.deliveryJobId());
        verify(borzo, never()).cancel(any());
    }

    @Test
    void rollbackCreateDisabledStillSettlesExistingBorzoHandoff() {
        Handoff handoff = handoff("PROCESSING_BORZO");
        HandoffJob job = job(handoff, "SEARCHING");
        BorzoProperties maintenance = productionMaintenanceProperties();
        org.assertj.core.api.Assertions.assertThat(maintenance.isCreateEnabled()).isFalse();
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(jobs.findHandoffJob(job.id())).thenReturn(Optional.of(job));
        when(pidgeProperties.productionCreateReady()).thenReturn(true);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));
        when(eligibility.eligible(job.chefSubOrderId(), job.orderId(),
            job.id(), job.providerDeliveryId())).thenReturn(true);
        when(outbox.hasPublishedBorzoStatus(job.id())).thenReturn(true);
        QuoteRequest request = mock(QuoteRequest.class);
        var command = mock(DeliveryCommandRepository.CommandRecord.class);
        var message = mock(DeliveryCommandModels.DeliveryCommandMessage.class);
        when(command.message()).thenReturn(message);
        when(message.deliveryRequest()).thenReturn(request);
        when(commands.findByChefSubOrderId(job.chefSubOrderId()))
            .thenReturn(Optional.of(command));
        when(pidge.quote(request)).thenReturn(mockAvailableQuote());
        when(borzo.readOrder(handoff.borzoProviderDeliveryId()))
            .thenReturn(delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.SEARCHING),
                delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.SEARCHING),
                delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.CANCELLED));
        when(borzo.cancel(handoff.borzoProviderDeliveryId()))
            .thenReturn(delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.CANCELLED));
        when(handoffs.markBorzoCancelled(job.id())).thenReturn(true);
        when(handoffs.markCancelIntent(job.id())).thenReturn(true);

        worker(maintenance).processDue();

        verify(borzo).cancel(handoff.borzoProviderDeliveryId());
        verify(handoffs).markBorzoCancelled(job.id());
        verify(pidge, never()).create(any());
    }

    @Test
    void externallyCancelledBorzoNeverAuthorizesPidge() {
        Handoff handoff = handoff("PROCESSING_BORZO");
        HandoffJob job = job(handoff, "SEARCHING");
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(jobs.findHandoffJob(job.id())).thenReturn(Optional.of(job));
        when(borzoProperties.isEnabled()).thenReturn(true);
        when(borzoProperties.productionReady()).thenReturn(true);
        when(borzo.readOrder(handoff.borzoProviderDeliveryId()))
            .thenReturn(delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.CANCELLED));

        worker().processDue();

        verify(handoffs).manualReview(eq(job.id()), any());
        verify(borzo, never()).cancel(any());
        verify(pidge, never()).create(any());
    }

    @Test
    void commercialIneligibilityNeverCancelsBorzoOrCreatesPidge() {
        Handoff handoff = handoff("PROCESSING_BORZO");
        HandoffJob job = job(handoff, "SEARCHING");
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(jobs.findHandoffJob(job.id())).thenReturn(Optional.of(job));
        when(borzoProperties.isEnabled()).thenReturn(true);
        when(borzoProperties.productionReady()).thenReturn(true);
        when(borzo.readOrder(handoff.borzoProviderDeliveryId()))
            .thenReturn(delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.SEARCHING));
        when(pidgeProperties.productionCreateReady()).thenReturn(true);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));

        worker().processDue();

        verify(borzo, never()).cancel(any());
        verify(pidge, never()).create(any());
        verify(pidge, never()).quote(any());
    }

    @Test
    void recoversConfirmedCancellationAfterLostBorzoResponse() {
        Handoff first = handoff("PROCESSING_BORZO");
        Handoff retry = new Handoff(first.deliveryJobId(), first.borzoProviderDeliveryId(),
            "PROCESSING_BORZO", 2, first.dueAt(), false, true);
        HandoffJob job = job(first, "SEARCHING");
        when(handoffs.claimDue(1)).thenReturn(List.of(first), List.of(retry), List.of());
        when(jobs.findHandoffJob(job.id())).thenReturn(Optional.of(job));
        when(borzoProperties.isEnabled()).thenReturn(true);
        when(borzoProperties.productionReady()).thenReturn(true);
        when(pidgeProperties.productionCreateReady()).thenReturn(true);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));
        when(eligibility.eligible(job.chefSubOrderId(), job.orderId(),
            job.id(), job.providerDeliveryId())).thenReturn(true);
        when(outbox.hasPublishedBorzoStatus(job.id())).thenReturn(true);
        prepareQuote(job);
        when(borzo.readOrder(first.borzoProviderDeliveryId()))
            .thenReturn(delivery("borzo", first.borzoProviderDeliveryId(), DeliveryStatus.SEARCHING),
                delivery("borzo", first.borzoProviderDeliveryId(), DeliveryStatus.SEARCHING),
                delivery("borzo", first.borzoProviderDeliveryId(), DeliveryStatus.CANCELLED));
        when(handoffs.markCancelIntent(job.id())).thenReturn(true);
        when(borzo.cancel(first.borzoProviderDeliveryId()))
            .thenThrow(new ResourceAccessException("uncertain cancellation response"));
        when(handoffs.markBorzoCancelled(job.id())).thenReturn(true);

        worker().processDue();

        verify(borzo).cancel(first.borzoProviderDeliveryId());
        verify(handoffs).markBorzoCancelled(job.id());
        verify(pidge, never()).create(any());
    }

    @Test
    void delayedBorzoWithoutCourierCanHandoffAfterConfirmedCancellation() {
        Handoff handoff = handoff("PROCESSING_BORZO");
        HandoffJob job = job(handoff, "DELAYED");
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(jobs.findHandoffJob(job.id())).thenReturn(Optional.of(job));
        when(borzoProperties.isEnabled()).thenReturn(true);
        when(borzoProperties.productionReady()).thenReturn(true);
        when(pidgeProperties.productionCreateReady()).thenReturn(true);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));
        when(eligibility.eligible(job.chefSubOrderId(), job.orderId(),
            job.id(), job.providerDeliveryId())).thenReturn(true);
        when(outbox.hasPublishedBorzoStatus(job.id())).thenReturn(true);
        prepareQuote(job);
        when(borzo.readOrder(handoff.borzoProviderDeliveryId()))
            .thenReturn(delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.DELAYED),
                delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.DELAYED),
                delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.CANCELLED));
        when(handoffs.markCancelIntent(job.id())).thenReturn(true);
        when(borzo.cancel(handoff.borzoProviderDeliveryId()))
            .thenReturn(delivery("borzo", handoff.borzoProviderDeliveryId(), DeliveryStatus.CANCELLED));
        when(handoffs.markBorzoCancelled(job.id())).thenReturn(true);

        worker().processDue();

        verify(borzo, times(2)).readCourier(handoff.borzoProviderDeliveryId());
        verify(borzo).cancel(handoff.borzoProviderDeliveryId());
        verify(handoffs).markBorzoCancelled(job.id());
    }

    @Test
    void orderTurnedIneligibleDuringPidgeCreateCompensatesConfirmedPidgeBooking() {
        Handoff handoff = handoff("PROCESSING_PIDGE");
        HandoffJob job = job(handoff, "SEARCHING");
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(jobs.findHandoffJob(job.id())).thenReturn(Optional.of(job));
        when(pidgeProperties.productionCreateReady()).thenReturn(true);
        when(catalog.activeProviderIds()).thenReturn(List.of("pidge"));
        when(eligibility.eligible(job.chefSubOrderId(), job.orderId(),
            job.id(), job.providerDeliveryId())).thenReturn(true, true, false);
        prepareQuote(job);
        ProviderDelivery booked = delivery("pidge", "pidge-42", DeliveryStatus.SEARCHING);
        ProviderDelivery cancelled = delivery("pidge", "pidge-42", DeliveryStatus.CANCELLED);
        when(pidge.create(any())).thenReturn(booked);
        when(pidge.track("pidge-42"))
            .thenReturn(new TrackingSnapshot(booked, null, Instant.now()),
                new TrackingSnapshot(cancelled, null, Instant.now()));
        when(pidge.cancel("pidge-42")).thenReturn(cancelled);

        worker().processDue();

        verify(pidge).cancel("pidge-42");
        verify(bookings).mark(job.chefSubOrderId().toString(), "CANCELLED");
        verify(handoffs).manualReview(eq(job.id()), any());
        verify(completion, never()).complete(any(), any());
    }

    @Test
    void timeoutAfterPidgeCreateDoesNotCancelAValidBooking() {
        Handoff baseline = handoff("PROCESSING_PIDGE");
        Handoff handoff = new Handoff(baseline.deliveryJobId(),
            baseline.borzoProviderDeliveryId(), baseline.state(), 20,
            baseline.dueAt(), true, true);
        HandoffJob job = job(handoff, "SEARCHING");
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(jobs.findHandoffJob(job.id())).thenReturn(Optional.of(job));
        when(pidgeProperties.productionCreateReady()).thenReturn(true);
        when(catalog.activeProviderIds()).thenReturn(List.of("pidge"));
        when(eligibility.eligible(job.chefSubOrderId(), job.orderId(),
            job.id(), job.providerDeliveryId()))
            .thenReturn(true, true)
            .thenThrow(new ResourceAccessException("order check timed out"));
        prepareQuote(job);
        when(pidge.create(any()))
            .thenReturn(delivery("pidge", "pidge-42", DeliveryStatus.SEARCHING));

        worker().processDue();

        verify(pidge, never()).cancel(any());
        verify(handoffs).retry(eq(job.id()), eq("PROCESSING_PIDGE"), any(), any());
        verify(completion, never()).complete(any(), any());
    }

    private void prepareQuote(HandoffJob job) {
        QuoteRequest request = mock(QuoteRequest.class);
        var command = mock(DeliveryCommandRepository.CommandRecord.class);
        var message = mock(DeliveryCommandModels.DeliveryCommandMessage.class);
        when(command.message()).thenReturn(message);
        when(message.deliveryRequest()).thenReturn(request);
        when(commands.findByChefSubOrderId(job.chefSubOrderId()))
            .thenReturn(Optional.of(command));
        when(pidge.quote(request)).thenReturn(mockAvailableQuote());
    }

    private static Handoff handoff(String state) {
        return new Handoff(UUID.randomUUID(), "1250032", state, 1,
            Instant.now().minusSeconds(1), false, false);
    }

    private static BorzoProperties productionMaintenanceProperties() {
        BorzoProperties runtime = new BorzoProperties();
        runtime.setEnabled(true);
        runtime.setCreateEnabled(false);
        runtime.setEnvironment("PRODUCTION");
        runtime.setProductionActivationApproved(true);
        runtime.setBaseUrl("https://robot-in.borzodelivery.com/api/business/1.8");
        runtime.setAuthToken("test-token");
        runtime.setCallbackSecret("test-callback-token");
        runtime.setCallbackUrl("https://api.craves.in/api/v1/delivery/webhooks/borzo");
        return runtime;
    }

    private static HandoffJob job(Handoff handoff, String status) {
        return new HandoffJob(handoff.deliveryJobId(), UUID.randomUUID(),
            UUID.randomUUID(), UUID.randomUUID(), "borzo",
            handoff.borzoProviderDeliveryId(), status, Instant.now().minusSeconds(30));
    }

    private static ProviderDelivery delivery(String providerId, String providerDeliveryId,
                                             DeliveryStatus status) {
        return new ProviderDelivery(providerId, providerDeliveryId, null, status,
            status.name(), null, null, null, null, Instant.now());
    }

    private static ProviderQuote mockAvailableQuote() {
        return new ProviderQuote("pidge", true, null, null, "INR", List.of(),
            null, Instant.now());
    }
}
