package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStrategy;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateScore;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.Momentum;
import in.craves.integration.delivery.DeliveryIntelligenceService;
import in.craves.integration.delivery.command.DeliveryCommandCompletionService.CompletionReceipt;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.DeliveryCommandWorker.DeliveryCommandDeferredException;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

/** The Craves rider stage runs before Borzo and Pidge (PLAN F8b); with no fleet bean, routing is exactly as before. */
class DeliveryFleetStageTest {
    private final ExecutorService quoteExecutor = Executors.newFixedThreadPool(2);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-10T13:00:00Z"), ZoneOffset.UTC);

    @AfterEach
    void shutDown() {
        quoteExecutor.shutdownNow();
    }

    @Test
    void withoutTheFleetThereIsNoFleetStageAndNoExtraQuote() {
        var catalog = mock(DeliveryProviderCatalogRepository.class);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));
        var borzo = new Courier("borzo", "85.50");
        var router = new DeliveryProviderRouter(List.of(borzo), catalog, mock(DeliveryIntelligenceService.class),
            mock(DeliveryAssignmentRepository.class), timedPolicy(), quoteExecutor, clock, null);

        assertThat(router.fleetStage(command())).isEmpty();
        assertThat(borzo.quotes.get()).isZero();
    }

    @Test
    void theCostGuardSeesOnlyTheCourierRoutingWouldBookNext() {
        var catalog = mock(DeliveryProviderCatalogRepository.class);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));
        var borzo = new Courier("borzo", "85.50");
        var pidge = new Courier("pidge", "70.00");
        var stage = new RecordingStage();
        var router = new DeliveryProviderRouter(List.of(borzo, pidge), catalog, mock(DeliveryIntelligenceService.class),
            mock(DeliveryAssignmentRepository.class), timedPolicy(), quoteExecutor, clock, null, Optional.of(stage));

        assertThat(router.fleetStage(command())).isEmpty();
        assertThat(stage.quote).hasValue(8550);
        assertThat(stage.borzoNext).isTrue();
        assertThat(pidge.quotes.get()).as("Pidge is not next while Borzo's window comes first").isZero();
    }

    @Test
    void afterTheFleetStageClosesBorzoGetsItsWholeWindowThenPidge() {
        var catalog = mock(DeliveryProviderCatalogRepository.class);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));
        var intelligence = mock(DeliveryIntelligenceService.class);
        when(intelligence.assign(any())).thenReturn(timedAssignment());
        var borzo = new Courier("borzo", "85.50");
        var pidge = new Courier("pidge", "70.00");
        var router = new DeliveryProviderRouter(List.of(borzo, pidge), catalog, intelligence, mock(DeliveryAssignmentRepository.class),
            timedPolicy(), quoteExecutor, clock, null, Optional.of(new RecordingStage()));

        assertThat(router.fleetStage(command())).as("fleet stage closed: carry on").isEmpty();
        assertThat(router.route(command(), clock.instant()).providerId()).isEqualTo("borzo");
        assertThat(router.route(command(), clock.instant().minusSeconds(120)).providerId()).isEqualTo("pidge");
    }

    @Test
    void whileRidersDecideTheCommandWaitsAndBorzosWindowDoesNotStart() {
        Fixture fixture = new Fixture();
        Instant nextCheck = Instant.now().plusSeconds(10);
        when(fixture.router.fleetStage(fixture.message))
            .thenThrow(new DeliveryProviderTemporarilyUnavailableException("Craves riders are deciding on the order", nextCheck));

        assertThatThrownBy(() -> fixture.worker.process(fixture.message)).isInstanceOfSatisfying(DeliveryCommandDeferredException.class,
            deferred -> assertThat(deferred.retryAt()).isBeforeOrEqualTo(nextCheck));
        verify(fixture.commands).markProviderWait(eq(fixture.message.commandId()), any(), any());
        verify(fixture.commands, never()).startBorzoWindow(any());
        verify(fixture.router, never()).route(any());
        verify(fixture.router, never()).route(any(), any());
    }

    @Test
    void aRiderWhoAcceptedCompletesTheCommandWithTheRidersDeliveryJob() {
        Fixture fixture = new Fixture();
        UUID job = UUID.randomUUID();
        when(fixture.router.fleetStage(fixture.message)).thenReturn(Optional.of(job));

        var receipt = fixture.worker.process(fixture.message);

        assertThat(receipt.deliveryJobId()).isEqualTo(job);
        assertThat(receipt.providerId()).isEqualTo("craves_fleet");
        verify(fixture.commands).markCompleted(fixture.message.commandId());
        verify(fixture.router, never()).route(any());
        verify(fixture.router, never()).route(any(), any());
    }

    @Test
    void fleetThenBorzoStartsBorzosWindowOnlyAfterTheFleetStage() {
        Fixture fixture = new Fixture();
        Instant window = Instant.now();
        RoutingResult borzo = routed("borzo");
        when(fixture.router.fleetStage(fixture.message)).thenReturn(Optional.empty());
        when(fixture.router.borzoTimedPolicyReady()).thenReturn(true);
        when(fixture.commands.startBorzoWindow(fixture.message.commandId())).thenReturn(window);
        when(fixture.router.route(fixture.message, window)).thenReturn(borzo);
        when(fixture.completion.complete(fixture.message, borzo)).thenReturn(new CompletionReceipt(UUID.randomUUID(), false));

        assertThat(fixture.worker.process(fixture.message).providerId()).isEqualTo("borzo");
        InOrder order = inOrder(fixture.router, fixture.commands);
        order.verify(fixture.router).fleetStage(fixture.message);
        order.verify(fixture.commands).startBorzoWindow(fixture.message.commandId());
        order.verify(fixture.router).route(fixture.message, window);
    }

    @Test
    void fleetThenPidgeWhenBorzoIsNotReady() {
        Fixture fixture = new Fixture();
        RoutingResult pidge = routed("pidge");
        when(fixture.router.fleetStage(fixture.message)).thenReturn(Optional.empty());
        when(fixture.router.route(fixture.message)).thenReturn(pidge);
        when(fixture.completion.complete(fixture.message, pidge)).thenReturn(new CompletionReceipt(UUID.randomUUID(), false));

        assertThat(fixture.worker.process(fixture.message).providerId()).isEqualTo("pidge");
        verify(fixture.commands, never()).startBorzoWindow(any());
    }

    private static final class Fixture {
        final DeliveryCommandRepository commands = mock(DeliveryCommandRepository.class);
        final DeliveryJobRepository jobs = mock(DeliveryJobRepository.class);
        final DeliveryProviderRouter router = mock(DeliveryProviderRouter.class);
        final DeliveryCommandCompletionService completion = mock(DeliveryCommandCompletionService.class);
        final DeliveryCommandMessage message = command();
        final DeliveryCommandWorker worker;

        Fixture() {
            DeliveryCommandProperties properties = new DeliveryCommandProperties();
            properties.setMaxDeliveryAttempts(5);
            DeliveryCommandRetryProperties retry = new DeliveryCommandRetryProperties();
            retry.setBaseSeconds(30);
            retry.setMaxSeconds(600);
            retry.setClaimContentionSeconds(10);
            worker = new DeliveryCommandWorker(commands, jobs, router, completion, properties, retry);
            when(commands.claim(message.commandId(), 5)).thenReturn(Optional.of(new CommandRecord(message.commandId(),
                message.chefSubOrderId(), message.orderId(), "PROCESSING", 1, message, 7001L, "delivery-command:test", null, null, null,
                0, 0, null, null)));
            when(jobs.findIdByChefSubOrderId(message.chefSubOrderId())).thenReturn(Optional.empty());
            when(commands.markProviderWait(any(), any(), any())).thenReturn(true);
        }
    }

    private static DeliveryCommandProperties timedPolicy() {
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setBorzoPidgeHandoffEnabled(true);
        return properties;
    }

    private static RoutingResult routed(String provider) {
        return new RoutingResult(provider, new DeliveryProviderAdapter.ProviderDelivery(provider, provider + "-1", provider + "-order",
            DeliveryProviderAdapter.DeliveryStatus.SEARCHING, "planned", null, null, null, null, Instant.now()),
            timedAssignment(), UUID.randomUUID(), List.of(), List.of());
    }

    private static AssignmentResponse timedAssignment() {
        ObjectMapper mapper = new ObjectMapper();
        UUID borzoId = UUID.randomUUID();
        CandidateScore borzo = new CandidateScore(borzoId, 1, "borzo", "borzo-quote", null, null, 7.0, new BigDecimal("85.50"), "INR",
            0.9, 90.0, 90.0, 90.0, Momentum.STABLE, 0.5, 90.0, 80.0, 85.0, CandidateStatus.SELECTED, mapper.createObjectNode());
        CandidateScore pidge = new CandidateScore(UUID.randomUUID(), 2, "pidge", null, null, null, null, null, "INR", 0.0, 0.0, null,
            50.0, Momentum.INSUFFICIENT_DATA, 0.0, 0.0, 0.0, 0.0, CandidateStatus.SKIPPED, mapper.createObjectNode());
        return new AssignmentResponse(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), AssignmentStrategy.STOCHASTIC,
            AssignmentStatus.RANKED, "TEST", borzoId, "borzo", null, List.of(borzo, pidge), Instant.now());
    }

    private static DeliveryCommandMessage command() {
        UUID orderId = UUID.randomUUID();
        UUID subOrderId = UUID.randomUUID();
        var pickup = new DeliveryProviderAdapter.Stop("Madhapur, Hyderabad", "Lakshmi's Kitchen", "+914012345678",
            new BigDecimal("17.4483"), new BigDecimal("78.3915"), null, null, "Pickup");
        var dropoff = new DeliveryProviderAdapter.Stop("Kondapur, Hyderabad", "Anil Rao", "+919876500000",
            new BigDecimal("17.4600"), new BigDecimal("78.3600"), null, null, "Dropoff");
        return new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, subOrderId,
            Instant.now().plusSeconds(720), Instant.now(), subOrderId.toString(), 3.5, "Madhapur", 19, 1,
            new DeliveryProviderAdapter.QuoteRequest("Food order", 1500, true, pickup, dropoff));
    }

    /** A fleet stage that has just closed: it reads the next courier's quote and lets routing carry on. */
    private static final class RecordingStage implements FleetStage {
        OptionalLong quote = OptionalLong.empty();
        boolean borzoNext;

        @Override
        public Optional<UUID> run(DeliveryCommandMessage command, Supplier<OptionalLong> courierQuotePaise, boolean borzoNext) {
            this.quote = courierQuotePaise.get();
            this.borzoNext = borzoNext;
            return Optional.empty();
        }

        @Override
        public void chefReady(UUID chefSubOrderId, Instant readyAt) {
        }
    }

    private static final class Courier implements DeliveryProviderAdapter {
        final String id;
        final BigDecimal fee;
        final AtomicInteger quotes = new AtomicInteger();

        Courier(String id, String fee) {
            this.id = id;
            this.fee = new BigDecimal(fee);
        }

        @Override
        public String providerId() {
            return id;
        }

        @Override
        public ProviderQuote quote(QuoteRequest request) {
            quotes.incrementAndGet();
            return new ProviderQuote(id, true, fee, fee, "INR", List.of(), new ObjectMapper().createObjectNode(), Instant.now());
        }

        @Override
        public ProviderDelivery create(CreateDeliveryRequest request) {
            return new ProviderDelivery(id, id + "-delivery", id + "-order", DeliveryStatus.SEARCHING, "planned", fee, fee, null,
                new ObjectMapper().createObjectNode(), Instant.now());
        }

        @Override
        public ProviderDelivery cancel(String providerDeliveryId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public TrackingSnapshot track(String providerDeliveryId) {
            throw new UnsupportedOperationException();
        }
    }
}
