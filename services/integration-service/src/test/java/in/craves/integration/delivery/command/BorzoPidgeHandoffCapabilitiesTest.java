package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import in.craves.integration.config.BorzoProperties;
import in.craves.integration.config.PidgeProperties;
import in.craves.integration.delivery.borzo.BorzoApiClient;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository.Handoff;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository.RetainedSearch;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryJobRepository.HandoffJob;
import in.craves.integration.delivery.pidge.PidgeApiClient;
import in.craves.integration.delivery.pidge.PidgeBookingRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Capability;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.TrackingSnapshot;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/** The Borzo-to-Pidge handoff with CRAVES_DELIVERY_COURIER_CAPABILITIES_ENABLED on: Borzo kept, and the Pidge phase's end. */
class BorzoPidgeHandoffCapabilitiesTest {
    final BorzoPidgeHandoffRepository handoffs = mock(BorzoPidgeHandoffRepository.class);
    final DeliveryJobRepository jobs = mock(DeliveryJobRepository.class);
    final DeliveryCommandRepository commands = mock(DeliveryCommandRepository.class);
    final OrderHandoffEligibilityClient eligibility = mock(OrderHandoffEligibilityClient.class);
    final DeliveryProviderCatalogRepository catalog = mock(DeliveryProviderCatalogRepository.class);
    final BorzoApiClient borzo = mock(BorzoApiClient.class);
    final BorzoProperties borzoProperties = mock(BorzoProperties.class);
    final PidgeApiClient pidge = mock(PidgeApiClient.class);
    final PidgeProperties pidgeProperties = mock(PidgeProperties.class);
    final PidgeBookingRepository bookings = mock(PidgeBookingRepository.class);
    final DeliveryStatusRepository cases = mock(DeliveryStatusRepository.class);
    final BorzoPidgeHandoffCompletionService completion = mock(BorzoPidgeHandoffCompletionService.class);
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final QuoteRequest request = mock(QuoteRequest.class);
    final List<String> alerts = new CopyOnWriteArrayList<>();
    final AppenderBase<ILoggingEvent> logged = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            if (event.getFormattedMessage().startsWith("CRAVES_ALERT")) {
                alerts.add(event.getFormattedMessage());
            }
        }
    };
    BorzoPidgeHandoffWorker worker;

    @BeforeEach
    void setUp() {
        properties.setCourierCapabilitiesEnabled(true);
        worker = new BorzoPidgeHandoffWorker(handoffs, jobs, commands, mock(DeliveryOutboxRepository.class), eligibility, catalog, borzo,
            borzoProperties, pidge, pidgeProperties, bookings, mock(DeliveryStatusUpdateService.class), completion);
        worker.setCapabilities(properties, cases);
        when(pidge.capabilities()).thenReturn(Set.of(Capability.PROVIDER_EVENT_TIME));
        when(pidgeProperties.productionCreateReady()).thenReturn(true);
        when(borzoProperties.isEnabled()).thenReturn(true);
        when(borzoProperties.productionReady()).thenReturn(true);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));
        logged.start();
        ((Logger) LoggerFactory.getLogger(BorzoPidgeHandoffWorker.class)).addAppender(logged);
    }

    @AfterEach
    void stop() {
        ((Logger) LoggerFactory.getLogger(BorzoPidgeHandoffWorker.class)).detachAppender(logged);
    }

    @Test
    void borzoIsKeptForAnOrderPidgeCannotCarry() {
        Handoff handoff = new Handoff(UUID.randomUUID(), "1250032", "PROCESSING_BORZO", 1, Instant.now().minusSeconds(1), false, false);
        HandoffJob job = job(handoff);
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(request.thermoboxRequired()).thenReturn(true);
        when(borzo.readOrder("1250032")).thenReturn(delivery("borzo", DeliveryStatus.SEARCHING));

        worker.processDue();

        verify(handoffs).markRetainedByWorker(job.id());
        verify(borzo, never()).cancel(any());
        verify(pidge, never()).quote(any());
        verify(handoffs, never()).manualReview(any(), any());

        // With the flag off the same order goes on to the Pidge quote as before.
        properties.setCourierCapabilitiesEnabled(false);
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        worker.processDue();
        verify(pidge).quote(request);
        verify(handoffs, org.mockito.Mockito.times(1)).retainedSearchesPastCap(anyInt());
    }

    @Test
    void aKeptBorzoSearchPastTheWaitCapGetsOneCaseAndOneAlert() {
        RetainedSearch search = new RetainedSearch(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        when(handoffs.retainedSearchesPastCap(20)).thenReturn(List.of(search));
        when(cases.openSystemCase(eq(search.deliveryJobId()), eq(search.orderId()), eq("RIDER_NOT_ASSIGNED"), any())).thenReturn(true, false);
        when(handoffs.claimDue(1)).thenReturn(List.of());

        worker.processDue();
        worker.processDue();

        assertThat(alerts).singleElement().asString().isEqualTo("CRAVES_ALERT alert=DELIVERY_COURIER_WAIT_CAP jobId=" + search.deliveryJobId()
            + " chefSubOrderId=" + search.chefSubOrderId() + " orderId=" + search.orderId() + " was=RETAINED_BORZO capMinutes=20");
    }

    @Test
    void thePidgePhaseEndsAtItsTenthTryWhenNothingWasSentToPidge() {
        // The Borzo phase took 5 claims of this handoff, so the Pidge phase's tenth try is claim 15.
        Handoff ninth = pidgePhase(14);
        Handoff tenth = pidgePhase(15);
        job(ninth);
        HandoffJob job = job(tenth);
        when(handoffs.pidgePhaseTry(ninth.deliveryJobId(), 14)).thenReturn(9);
        when(handoffs.pidgePhaseTry(tenth.deliveryJobId(), 15)).thenReturn(10);
        when(handoffs.claimDue(1)).thenReturn(List.of(ninth), List.of(tenth), List.of());
        when(pidge.quote(request)).thenReturn(new ProviderQuote("pidge", false, null, null, "INR", List.of(), null, Instant.now()));

        worker.processDue();

        verify(handoffs).retry(eq(ninth.deliveryJobId()), eq("PROCESSING_PIDGE"), any(), any());
        verify(handoffs).manualReview(eq(tenth.deliveryJobId()), contains("no currently available"));
        verify(handoffs, never()).retry(eq(tenth.deliveryJobId()), any(), any(), any());
        verify(cases).openSystemCase(eq(job.id()), eq(job.orderId()), eq("RIDER_NOT_ASSIGNED"),
            org.mockito.ArgumentMatchers.argThat(note -> note.contains("after 10 tries") && note.contains("Nothing was booked with Pidge")));
        assertThat(alerts).singleElement().asString().startsWith("CRAVES_ALERT alert=DELIVERY_HANDOFF_NO_COURIER orderId=" + job.orderId()
            + " jobId=" + job.id());
    }

    @Test
    void aLostPidgeAnswerIsOnlyLookedUpFromThenOnAndEndsAtTheAttemptLimit() {
        Handoff lost = pidgePhase(3);
        Handoff tenth = pidgePhase(11);
        Handoff limit = pidgePhase(21);
        job(lost);
        job(tenth);
        HandoffJob ended = job(limit);
        when(handoffs.pidgePhaseTry(lost.deliveryJobId(), 3)).thenReturn(2);
        when(handoffs.pidgePhaseTry(tenth.deliveryJobId(), 11)).thenReturn(10);
        when(handoffs.pidgePhaseTry(limit.deliveryJobId(), 21)).thenReturn(20);
        when(handoffs.claimDue(1)).thenReturn(List.of(lost), List.of(tenth), List.of(limit), List.of());
        when(pidge.quote(request)).thenReturn(new ProviderQuote("pidge", true, null, null, "INR", List.of(), null, Instant.now()));
        when(pidge.create(any())).thenThrow(new ProviderCreateUncertainException("pidge", "ref", Instant.now(), new RuntimeException("timeout")));

        worker.processDue();

        verify(handoffs).awaitPidgeOutcome(eq(lost.deliveryJobId()), any(), any());
        verify(handoffs).awaitPidgeOutcome(eq(tenth.deliveryJobId()), any(), any());
        verify(handoffs, never()).retry(any(), any(), any(), any());
        verify(handoffs).manualReview(eq(limit.deliveryJobId()), contains("outcome is still unknown"));
        verify(cases).openSystemCase(eq(ended.id()), eq(ended.orderId()), eq("RIDER_NOT_ASSIGNED"), contains("check Pidge first"));
        assertThat(alerts).hasSize(1);
    }

    /** Pidge holds a booking and a later step fails: the phase is never ended as "not booked". */
    @Test
    void aPidgeBookingThatExistsButIsNotConfirmedReadyKeepsThePhaseOnTheLookup() {
        HandoffJob job = bookedAtPidgeOnTry(12);
        when(pidge.reconcileCreate(eq(job.chefSubOrderId().toString()), any()))
            .thenReturn(CreateReconciliationResult.found(delivery("pidge", DeliveryStatus.PENDING)));

        worker.processDue();

        verify(handoffs).awaitPidgeOutcome(eq(job.id()), any(), contains("not confirmed ready"));
        verify(handoffs, never()).manualReview(any(), any());
        verify(cases, never()).openSystemCase(any(), any(), any(), any());
    }

    @Test
    void aPidgeBookingWhoseCompletionFailsKeepsThePhaseOnTheLookup() {
        HandoffJob job = bookedAtPidgeOnTry(12);
        when(pidge.reconcileCreate(eq(job.chefSubOrderId().toString()), any()))
            .thenReturn(CreateReconciliationResult.found(delivery("pidge", DeliveryStatus.SEARCHING)));
        org.mockito.Mockito.doThrow(new IllegalStateException("job could not be switched")).when(completion).complete(any(), any());

        worker.processDue();

        verify(handoffs).awaitPidgeOutcome(eq(job.id()), any(), contains("could not be switched"));
        verify(handoffs, never()).manualReview(any(), any());
    }

    @Test
    void aPidgeBookingWhoseCancelIsNotConfirmedKeepsThePhaseOnTheLookupAndItsEndSaysToCheckPidge() {
        HandoffJob job = bookedAtPidgeOnTry(12);
        when(eligibility.eligible(job.chefSubOrderId(), job.orderId(), job.id(), job.providerDeliveryId())).thenReturn(false);
        ProviderDelivery live = delivery("pidge", DeliveryStatus.SEARCHING);
        when(pidge.track("pidge-42")).thenReturn(new TrackingSnapshot(live, null, Instant.now()));
        when(pidge.cancel("pidge-42")).thenReturn(live);

        worker.processDue();

        verify(handoffs).awaitPidgeOutcome(eq(job.id()), any(), contains("cancellation is not confirmed"));
        verify(handoffs, never()).manualReview(any(), any());

        // At the attempt limit a person takes over, and is told a booking may exist.
        Handoff limit = new Handoff(job.id(), "1250032", "PROCESSING_PIDGE", 22, Instant.now().minusSeconds(1), true, true);
        when(handoffs.pidgePhaseTry(job.id(), 22)).thenReturn(20);
        when(handoffs.claimDue(1)).thenReturn(List.of(limit), List.of());
        worker.processDue();
        verify(handoffs).manualReview(eq(job.id()), contains("check Pidge"));
        verify(cases).openSystemCase(eq(job.id()), eq(job.orderId()), eq("RIDER_NOT_ASSIGNED"), contains("A Pidge booking may exist"));
    }

    /** A handoff on the given try of its Pidge phase (past the tenth) whose booking Pidge has: pidge_booking holds it. */
    private HandoffJob bookedAtPidgeOnTry(int tries) {
        Handoff handoff = pidgePhase(tries + 2);
        HandoffJob job = job(handoff);
        when(handoffs.pidgePhaseTry(handoff.deliveryJobId(), tries + 2)).thenReturn(tries);
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(bookings.find(job.chefSubOrderId().toString())).thenReturn(Optional.of(new PidgeBookingRepository.Booking("pidge-42", "CREATED")));
        return job;
    }

    private static Handoff pidgePhase(int attempts) {
        return new Handoff(UUID.randomUUID(), "1250032", "PROCESSING_PIDGE", attempts, Instant.now().minusSeconds(1), true, true);
    }

    private HandoffJob job(Handoff handoff) {
        HandoffJob job = new HandoffJob(handoff.deliveryJobId(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "borzo", "1250032",
            "SEARCHING", Instant.now().minusSeconds(30));
        when(jobs.findHandoffJob(job.id())).thenReturn(Optional.of(job));
        when(eligibility.eligible(job.chefSubOrderId(), job.orderId(), job.id(), job.providerDeliveryId())).thenReturn(true);
        var command = mock(DeliveryCommandRepository.CommandRecord.class);
        var message = mock(DeliveryCommandMessage.class);
        when(command.message()).thenReturn(message);
        when(message.deliveryRequest()).thenReturn(request);
        when(commands.findByChefSubOrderId(job.chefSubOrderId())).thenReturn(Optional.of(command));
        return job;
    }

    private static ProviderDelivery delivery(String provider, DeliveryStatus status) {
        return new ProviderDelivery(provider, "1250032", "1250032", status, status.name(), null, null, null, null, Instant.now());
    }
}
