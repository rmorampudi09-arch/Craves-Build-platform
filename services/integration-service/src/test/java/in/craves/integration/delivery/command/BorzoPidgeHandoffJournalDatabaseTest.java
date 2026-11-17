package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
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
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository.Attempt;
import in.craves.integration.delivery.pidge.PidgeApiClient;
import in.craves.integration.delivery.pidge.PidgeBookingRepository;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetDatabase;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * The Borzo-to-Pidge handoff with CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED on: its Pidge booking is an attempt on the real
 * journal (PostgreSQL); Borzo, Pidge and the job tables are mocks, as in BorzoPidgeHandoffWorkerTest.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class BorzoPidgeHandoffJournalDatabaseTest {
    final FleetDatabase database = new FleetDatabase();
    final BorzoPidgeHandoffRepository handoffs = mock(BorzoPidgeHandoffRepository.class);
    final DeliveryJobRepository jobs = mock(DeliveryJobRepository.class);
    final DeliveryCommandRepository commands = mock(DeliveryCommandRepository.class);
    final DeliveryOutboxRepository outbox = mock(DeliveryOutboxRepository.class);
    final OrderHandoffEligibilityClient eligibility = mock(OrderHandoffEligibilityClient.class);
    final DeliveryProviderCatalogRepository catalog = mock(DeliveryProviderCatalogRepository.class);
    final BorzoApiClient borzo = mock(BorzoApiClient.class);
    final BorzoProperties borzoProperties = mock(BorzoProperties.class);
    final PidgeApiClient pidge = mock(PidgeApiClient.class);
    final PidgeProperties pidgeProperties = mock(PidgeProperties.class);
    final PidgeBookingRepository bookings = mock(PidgeBookingRepository.class);
    final BorzoPidgeHandoffCompletionService completion = mock(BorzoPidgeHandoffCompletionService.class);
    ProviderCreateAttemptRepository journal;
    BorzoPidgeHandoffWorker worker;
    Handoff handoff;
    HandoffJob job;

    @BeforeEach
    void setUp() {
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setBookingJournalEnabled(true);
        journal = new ProviderCreateAttemptRepository(database.db, properties);
        worker = new BorzoPidgeHandoffWorker(handoffs, jobs, commands, outbox, eligibility, catalog, borzo, borzoProperties, pidge,
            pidgeProperties, bookings, mock(DeliveryStatusUpdateService.class), completion);
        worker.setJournal(journal);

        handoff = new Handoff(UUID.randomUUID(), "1250032", "PROCESSING_PIDGE", 2, Instant.now().minusSeconds(1), true, true);
        job = new HandoffJob(handoff.deliveryJobId(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "borzo", "1250032",
            "SEARCHING", Instant.now().minusSeconds(30));
        when(jobs.findHandoffJob(job.id())).thenReturn(Optional.of(job));
        when(pidgeProperties.productionCreateReady()).thenReturn(true);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));
        when(eligibility.eligible(job.chefSubOrderId(), job.orderId(), job.id(), job.providerDeliveryId())).thenReturn(true);
        QuoteRequest request = mock(QuoteRequest.class);
        var command = mock(DeliveryCommandRepository.CommandRecord.class);
        var message = mock(DeliveryCommandModels.DeliveryCommandMessage.class);
        when(command.message()).thenReturn(message);
        when(message.deliveryRequest()).thenReturn(request);
        when(commands.findByChefSubOrderId(job.chefSubOrderId())).thenReturn(Optional.of(command));
        when(pidge.quote(request)).thenReturn(new ProviderQuote("pidge", true, null, null, "INR", List.of(), null, Instant.now()));
    }

    @Test
    void thePidgeBookingGoesUnderItsOwnAttemptWhichCompletionConfirms() {
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        ProviderDelivery booked = delivery(DeliveryStatus.SEARCHING);
        when(pidge.create(any())).thenReturn(booked);

        worker.processDue();

        Attempt attempt = journal.forOrder(job.chefSubOrderId()).get(0);
        assertThat(attempt.providerId()).isEqualTo("pidge");
        assertThat(attempt.clientRef()).hasSize(27).endsWith("1");
        verify(pidge).create(argThat(request -> attempt.clientRef().equals(request.clientReference())));
        verify(completion).complete(handoff, booked, attempt.clientRef());
    }

    @Test
    void aBookingMadeBeforeTheJournalWasOnGoesOnUnderTheOrdersId() {
        String orderReference = job.chefSubOrderId().toString();
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(bookings.find(orderReference)).thenReturn(Optional.of(new PidgeBookingRepository.Booking("pidge-42", "CREATED")));
        ProviderDelivery found = delivery(DeliveryStatus.SEARCHING);
        when(pidge.reconcileCreate(eq(orderReference), any())).thenReturn(CreateReconciliationResult.found(found));

        worker.processDue();

        verify(pidge, never()).create(any());
        verify(completion).complete(handoff, found);
        assertThat(journal.forOrder(job.chefSubOrderId())).isEmpty();
    }

    @Test
    void aLostAnswerIsLookedUpUnderTheSameAttemptAndPidgeIsNotCalledAgain() {
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of(), List.of(handoff), List.of());
        when(pidge.create(any())).thenThrow(new IllegalStateException("Pidge answer was lost"));

        worker.processDue();
        Attempt attempt = journal.forOrder(job.chefSubOrderId()).get(0);
        assertThat(attempt.state()).isEqualTo("INTENT");
        verify(handoffs).retry(eq(job.id()), eq("PROCESSING_PIDGE"), any(), any());

        ProviderDelivery found = delivery(DeliveryStatus.COURIER_ASSIGNED);
        when(bookings.find(attempt.clientRef())).thenReturn(Optional.of(new PidgeBookingRepository.Booking("pidge-42", "CREATED")));
        when(pidge.reconcileCreate(eq(attempt.clientRef()), any())).thenReturn(CreateReconciliationResult.found(found));
        worker.processDue();

        verify(pidge, times(1)).create(any());
        verify(completion).complete(handoff, found, attempt.clientRef());
        assertThat(journal.forOrder(job.chefSubOrderId())).as("no second attempt").hasSize(1);
    }

    @Test
    void aBookingPidgeRejectedClosesTheAttemptAndEndsTheHandoffAsBefore() {
        Attempt attempt = journal.begin(job.chefSubOrderId(), "pidge").orElseThrow();
        when(handoffs.claimDue(1)).thenReturn(List.of(handoff), List.of());
        when(bookings.find(attempt.clientRef())).thenReturn(Optional.of(new PidgeBookingRepository.Booking("pidge-42", "REJECTED")));

        worker.processDue();

        verify(handoffs).manualReview(eq(job.id()), any());
        verify(pidge, never()).create(any());
        assertThat(journal.find("pidge", attempt.clientRef())).map(Attempt::state).contains("REJECTED");
    }

    @Test
    void borzoIsKeptWhenPidgeMayNotBeBookedForTheOrder() {
        // An earlier Pidge booking for this order is still on record as possibly live.
        journal.move(journal.begin(job.chefSubOrderId(), "pidge").orElseThrow(), Set.of("INTENT"), "ORPHAN_SUSPECT", null, null);
        Handoff borzoPhase = new Handoff(handoff.deliveryJobId(), "1250032", "PROCESSING_BORZO", 1, handoff.dueAt(), false, false);
        when(handoffs.claimDue(1)).thenReturn(List.of(borzoPhase), List.of());
        when(borzoProperties.isEnabled()).thenReturn(true);
        when(borzoProperties.productionReady()).thenReturn(true);
        when(borzo.readOrder("1250032")).thenReturn(new ProviderDelivery("borzo", "1250032", null, DeliveryStatus.SEARCHING, "available",
            null, null, null, null, Instant.now()));

        worker.processDue();

        verify(borzo, never()).cancel(any());
        verify(handoffs, never()).markCancelIntent(any());
        verify(handoffs).retry(eq(job.id()), eq("PROCESSING_BORZO"), any(), any());
    }

    private static ProviderDelivery delivery(DeliveryStatus status) {
        return new ProviderDelivery("pidge", "pidge-42", null, status, status.name(), null, null, null, null, Instant.now());
    }
}
