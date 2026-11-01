package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.integration.delivery.command.DeliveryCommandModels.ChefAcceptedOrderData;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.EventEnvelope;
import in.craves.integration.delivery.command.DeliveryCommandModels.OrderReadyForPickupData;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.OptionalDouble;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class DeliveryCommandSchedulerTest {
    private static final Instant NOW = Instant.parse("2026-07-14T12:00:00Z");

    @Test
    void schedulesTenMinutesBeforeReadyAtAndPersistsIntelligenceContext() {
        DeliveryCommandRepository repository = mock(DeliveryCommandRepository.class);
        DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setLeadTimeMinutes(10);
        Instant now = Instant.parse("2026-07-14T12:00:00Z");
        Clock clock = Clock.fixed(now, ZoneOffset.UTC);
        DeliveryCommandScheduler scheduler = new DeliveryCommandScheduler(
            repository, publisher, properties, clock
        );

        EventEnvelope<ChefAcceptedOrderData> event = event(now.plusSeconds(30 * 60));
        when(repository.createOrFind(any())).thenAnswer(invocation -> {
            DeliveryCommandMessage message = invocation.getArgument(0);
            return commandRecord(message, null);
        });
        when(publisher.schedule(any())).thenReturn(
            new DeliveryServiceBusPublisher.ScheduledMessage(7001L, "delivery-command:test")
        );
        when(repository.recordScheduled(any(), anyLong(), any())).thenReturn(true);

        var receipt = scheduler.schedule(event);

        assertThat(receipt.dispatchAt()).isEqualTo(now.plusSeconds(20 * 60));
        assertThat(receipt.scheduledSequenceNumber()).isEqualTo(7001L);
        assertThat(receipt.duplicate()).isFalse();

        ArgumentCaptor<DeliveryCommandMessage> command = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        verify(repository).createOrFind(command.capture());
        assertThat(command.getValue().chefSubOrderId()).isEqualTo(event.data().chefSubOrderId());
        assertThat(command.getValue().idempotencyKey()).isEqualTo(event.data().chefSubOrderId().toString());
        assertThat(command.getValue().area()).isEqualTo("Madhapur");
        assertThat(command.getValue().distanceKm()).isBetween(4.0, 5.0);
        assertThat(command.getValue().orderHour()).isEqualTo(17);
        assertThat(command.getValue().dayOfWeek()).isEqualTo(1);
    }

    @Test
    void readyForPickupAcceleratesUnattemptedScheduledCommandImmediately() {
        DeliveryCommandRepository repository = mock(DeliveryCommandRepository.class);
        DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        Instant now = Instant.parse("2026-09-09T01:00:00Z");
        Clock clock = Clock.fixed(now, ZoneOffset.UTC);
        DeliveryCommandScheduler scheduler = new DeliveryCommandScheduler(
            repository, publisher, properties, clock
        );

        EventEnvelope<ChefAcceptedOrderData> accepted = event(now.plusSeconds(20 * 60));
        DeliveryCommandMessage original = commandMessage(
            accepted,
            now.plusSeconds(10 * 60)
        );
        CommandRecord existing = commandRecord(original, 7001L);
        when(repository.findByChefSubOrderId(original.chefSubOrderId())).thenReturn(java.util.Optional.of(existing));
        when(repository.accelerateScheduled(any(), any(), anyString())).thenReturn(true);

        UUID readyEventId = UUID.randomUUID();
        EventEnvelope<OrderReadyForPickupData> ready = new EventEnvelope<>(
            readyEventId,
            DeliveryCommandModels.ORDER_READY_FOR_PICKUP,
            "1.0",
            now,
            UUID.randomUUID(),
            null,
            "order-service",
            original.chefSubOrderId().toString(),
            new OrderReadyForPickupData(original.orderId(), original.chefSubOrderId(), now)
        );

        var receipt = scheduler.accelerateReadyForPickup(ready);

        assertThat(receipt.accelerated()).isTrue();
        assertThat(receipt.dispatchAt()).isEqualTo(now);
        assertThat(receipt.duplicateOrAlreadyProcessing()).isFalse();

        ArgumentCaptor<DeliveryCommandMessage> accelerated = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        ArgumentCaptor<String> messageId = ArgumentCaptor.forClass(String.class);
        verify(repository).accelerateScheduled(any(), accelerated.capture(), messageId.capture());
        assertThat(accelerated.getValue().dispatchAt()).isEqualTo(now);
        assertThat(accelerated.getValue().readyAt()).isEqualTo(now);
        assertThat(accelerated.getValue().sourceEventId()).isEqualTo(readyEventId);
        assertThat(messageId.getValue()).startsWith("delivery-ready:" + original.chefSubOrderId());
        verify(publisher).publishNow(accelerated.getValue(), messageId.getValue());
        verify(publisher).cancelScheduled(7001L);
    }

    @Test
    void aKitchenThatUsuallyTapsReadyLateGetsItsRidersLaterByItsMedianWhenSwitchedOn() {
        DeliveryCommandRepository repository = mock(DeliveryCommandRepository.class);
        DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setLeadTimeMinutes(10);
        properties.setReadyCorrectionEnabled(true);
        Instant now = Instant.parse("2026-07-14T12:00:00Z");
        DeliveryCommandScheduler scheduler = new DeliveryCommandScheduler(
            repository, publisher, properties, Clock.fixed(now, ZoneOffset.UTC)
        );
        EventEnvelope<ChefAcceptedOrderData> event = event(now.plusSeconds(30 * 60));
        UUID order = event.data().chefSubOrderId();
        when(repository.createOrFind(any())).thenAnswer(invocation -> commandRecord(invocation.getArgument(0), null));
        when(publisher.schedule(any())).thenReturn(
            new DeliveryServiceBusPublisher.ScheduledMessage(7002L, "delivery-command:test")
        );
        when(repository.recordScheduled(any(), anyLong(), any())).thenReturn(true);

        when(repository.kitchenReadyLateness(order)).thenReturn(Optional.of(Duration.ofMinutes(6)));
        assertThat(scheduler.schedule(event).dispatchAt()).as("ready, plus 6 late, less 10").isEqualTo(now.plusSeconds(26 * 60));
        when(repository.kitchenReadyLateness(order)).thenReturn(Optional.of(Duration.ofMinutes(40)));
        assertThat(scheduler.schedule(event).dispatchAt()).as("at most 15 minutes").isEqualTo(now.plusSeconds(35 * 60));
        when(repository.kitchenReadyLateness(order)).thenReturn(Optional.of(Duration.ofMinutes(-8)));
        assertThat(scheduler.schedule(event).dispatchAt()).as("never before the promise").isEqualTo(now.plusSeconds(20 * 60));
        when(repository.kitchenReadyLateness(order)).thenThrow(new IllegalStateException("database down"));
        assertThat(scheduler.schedule(event).dispatchAt()).as("no correction on a failure").isEqualTo(now.plusSeconds(20 * 60));

        properties.setReadyCorrectionEnabled(false);
        scheduler.schedule(event);
        verify(repository, times(4)).kitchenReadyLateness(order);
    }

    @Test
    void inRainModeTheSearchStartsFiveMinutesEarlier() {
        DeliveryCommandRepository repository = mock(DeliveryCommandRepository.class);
        DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
        DeliveryCommandProperties properties = new DeliveryCommandProperties();
        properties.setLeadTimeMinutes(10);
        Instant now = Instant.parse("2026-07-14T12:00:00Z");
        DeliveryCommandScheduler scheduler = new DeliveryCommandScheduler(
            repository, publisher, properties, Clock.fixed(now, ZoneOffset.UTC)
        );
        when(repository.createOrFind(any())).thenAnswer(invocation -> commandRecord(invocation.getArgument(0), null));
        when(publisher.schedule(any())).thenReturn(
            new DeliveryServiceBusPublisher.ScheduledMessage(7003L, "delivery-command:test")
        );
        when(repository.recordScheduled(any(), anyLong(), any())).thenReturn(true);
        FleetStage fleet = mock(FleetStage.class);
        scheduler.setFleetStage(fleet);

        when(fleet.dispatchEarlier()).thenReturn(Duration.ofMinutes(5));
        assertThat(scheduler.schedule(event(now.plusSeconds(30 * 60))).dispatchAt()).as("ready, less 10, less 5 in rain")
            .isEqualTo(now.plusSeconds(15 * 60));
        assertThat(scheduler.schedule(event(now.plusSeconds(12 * 60))).dispatchAt()).as("never before the next few seconds")
            .isEqualTo(now.plusSeconds(5));
        when(fleet.dispatchEarlier()).thenReturn(Duration.ZERO);
        assertThat(scheduler.schedule(event(now.plusSeconds(30 * 60))).dispatchAt()).as("no rain").isEqualTo(now.plusSeconds(20 * 60));
    }

    /** R16 18 off (the default): today's 10 minutes before ready, no command waits, and the fleet is never asked. */
    @Test
    void offDispatchKeepsTodaysLeadAndTheFleetIsNeverAsked() {
        Timed timed = new Timed(false);
        timed.ride(1);
        Instant ready = NOW.plus(Duration.ofMinutes(30));

        assertThat(timed.dispatchAt(ready)).isEqualTo(ready.minus(Duration.ofMinutes(10)));
        assertThat(timed.scheduler.holdUntil(timed.due(ready))).isEmpty();
        verifyNoInteractions(timed.fleet);
        verify(timed.repository, never()).untappedPromise(any());
    }

    /**
     * R16 18 on, with a live model whose ranking passed: riders start for the kitchen at predicted ready (the promise plus
     * the kitchen's correction) − their ride − 2 minutes, never earlier than today's 10 minutes before, never later than 2.
     */
    @Test
    void onWithALiveRankingModelRidersAreTimedToMeetTheFoodWithinTodaysLeadAndTwoMinutes() {
        Timed timed = new Timed(true);
        Instant ready = NOW.plus(Duration.ofMinutes(30));

        timed.ride(3);
        assertThat(timed.dispatchAt(ready)).as("ready − 3 − 2").isEqualTo(ready.minus(Duration.ofMinutes(5)));
        timed.ride(4.5);
        assertThat(timed.dispatchAt(ready)).isEqualTo(ready.minus(Duration.ofSeconds(390)));
        timed.ride(0);
        assertThat(timed.dispatchAt(ready)).as("a rider at the door: 2 minutes before").isEqualTo(ready.minus(Duration.ofMinutes(2)));
        timed.ride(20);
        assertThat(timed.dispatchAt(ready)).as("a long ride: never earlier than today's 10 minutes")
            .isEqualTo(ready.minus(Duration.ofMinutes(10)));

        timed.properties.setReadyCorrectionEnabled(true);
        when(timed.repository.kitchenReadyLateness(any())).thenReturn(Optional.of(Duration.ofMinutes(6)));
        timed.ride(3);
        assertThat(timed.dispatchAt(ready)).as("a kitchen 6 minutes late as a rule: ready + 6 − 3 − 2")
            .isEqualTo(ready.plus(Duration.ofMinutes(1)));

        ArgumentCaptor<Instant> at = ArgumentCaptor.forClass(Instant.class);
        verify(timed.fleet, times(5)).rideMinutes(any(), eq(17.4483), eq(78.3915), at.capture());
        Instant todays = ready.minus(Duration.ofMinutes(10));
        assertThat(at.getAllValues()).as("each ride is predicted for when today's rule would send riders")
            .containsExactly(todays, todays, todays, todays, ready.minus(Duration.ofMinutes(4)));
    }

    /** On, but no live ranking model, dispatch not live or nobody free nearby (the fleet answers nothing): today's lead. */
    @Test
    void onWithoutALiveRankingModelOrAPlausibleRideDispatchKeepsTodaysLead() {
        Timed timed = new Timed(true);
        Instant ready = NOW.plus(Duration.ofMinutes(30));
        Instant todays = ready.minus(Duration.ofMinutes(10));

        when(timed.fleet.rideMinutes(any(), anyDouble(), anyDouble(), any())).thenReturn(OptionalDouble.empty());
        assertThat(timed.dispatchAt(ready)).isEqualTo(todays);
        timed.ride(Double.NaN);
        assertThat(timed.dispatchAt(ready)).isEqualTo(todays);
        timed.ride(-1);
        assertThat(timed.dispatchAt(ready)).isEqualTo(todays);
        timed.ride(1e18);
        assertThat(timed.dispatchAt(ready)).isEqualTo(todays);
        when(timed.fleet.rideMinutes(any(), anyDouble(), anyDouble(), any())).thenThrow(new IllegalStateException("database down"));
        assertThat(timed.dispatchAt(ready)).as("any failure").isEqualTo(todays);

        DeliveryCommandScheduler fleetOff = new DeliveryCommandScheduler(timed.repository, timed.publisher, timed.properties,
            Clock.fixed(NOW, ZoneOffset.UTC));
        assertThat(fleetOff.schedule(event(ready)).dispatchAt()).as("the fleet off").isEqualTo(todays);
        assertThat(fleetOff.holdUntil(timed.due(ready))).isEmpty();
    }

    /**
     * The narrowing window: a command coming due whose riders would now reach the kitchen more than 3 minutes before the
     * food waits until they would meet it, never past 2 minutes before ready; otherwise it starts now.
     */
    @Test
    void aDueCommandWhoseRidersWouldArriveWellBeforeTheFoodWaitsUntilTheyWouldMeetIt() {
        Timed timed = new Timed(true);
        DeliveryCommandMessage due = timed.due(NOW.plus(Duration.ofMinutes(12)));

        timed.ride(1);
        assertThat(timed.scheduler.holdUntil(due)).as("12 − 1 − 2").contains(NOW.plus(Duration.ofMinutes(9)));
        timed.ride(0);
        assertThat(timed.scheduler.holdUntil(due)).as("never past 2 minutes before ready").contains(NOW.plus(Duration.ofMinutes(10)));
        timed.ride(6.5);
        assertThat(timed.scheduler.holdUntil(due)).as("3.5 minutes early").contains(NOW.plus(Duration.ofSeconds(210)));
        timed.ride(7);
        assertThat(timed.scheduler.holdUntil(due)).as("only 3 minutes early: start now").isEmpty();
        timed.ride(12);
        assertThat(timed.scheduler.holdUntil(due)).as("late already: start now").isEmpty();
        when(timed.fleet.rideMinutes(any(), anyDouble(), anyDouble(), any())).thenReturn(OptionalDouble.empty());
        assertThat(timed.scheduler.holdUntil(due)).as("no live ranking model, or nobody free nearby").isEmpty();

        timed.properties.setReadyCorrectionEnabled(true);
        when(timed.repository.kitchenReadyLateness(due.chefSubOrderId())).thenReturn(Optional.of(Duration.ofMinutes(6)));
        timed.ride(1);
        assertThat(timed.scheduler.holdUntil(due)).as("the kitchen's correction: 12 + 6 − 1 − 2").contains(NOW.plus(Duration.ofMinutes(15)));
        verify(timed.fleet, times(7)).rideMinutes(eq(due.chefSubOrderId()), eq(17.4483), eq(78.3915), eq(NOW));
    }

    /** A command the chef's ready tap moved or a worker started never waits, nor one whose state can't be read. */
    @Test
    void aCommandTheReadyTapMovedOrAWorkerStartedNeverWaits() {
        Timed timed = new Timed(true);
        timed.ride(1);
        DeliveryCommandMessage due = timed.due(NOW.plus(Duration.ofMinutes(12)));

        when(timed.repository.untappedPromise(due.commandId())).thenReturn(Optional.empty());
        assertThat(timed.scheduler.holdUntil(due)).isEmpty();
        when(timed.repository.untappedPromise(due.commandId())).thenThrow(new IllegalStateException("database down"));
        assertThat(timed.scheduler.holdUntil(due)).isEmpty();
        verifyNoInteractions(timed.fleet);
    }

    /** A scheduler at NOW with today's 10-minute lead, food-timed dispatch on or off, and the fleet's riders as stubbed. */
    private static final class Timed {
        final DeliveryCommandRepository repository = mock(DeliveryCommandRepository.class);
        final DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
        final DeliveryCommandProperties properties = new DeliveryCommandProperties();
        final FleetStage fleet = mock(FleetStage.class);
        final DeliveryCommandScheduler scheduler = new DeliveryCommandScheduler(repository, publisher, properties,
            Clock.fixed(NOW, ZoneOffset.UTC));

        Timed(boolean on) {
            properties.setLeadTimeMinutes(10);
            properties.setFoodTimedDispatchEnabled(on);
            scheduler.setFleetStage(fleet);
            when(repository.createOrFind(any())).thenAnswer(invocation -> commandRecord(invocation.getArgument(0), null));
            when(publisher.schedule(any())).thenReturn(new DeliveryServiceBusPublisher.ScheduledMessage(7003L, "delivery-command:test"));
            when(repository.recordScheduled(any(), anyLong(), any())).thenReturn(true);
        }

        /** The free riders nearest the kitchen are this many minutes away by the model (their middle figure). */
        void ride(double minutes) {
            when(fleet.rideMinutes(any(), anyDouble(), anyDouble(), any())).thenReturn(OptionalDouble.of(minutes));
        }

        Instant dispatchAt(Instant readyAt) {
            return scheduler.schedule(event(readyAt)).dispatchAt();
        }

        /** A command coming due now, promised ready at readyAt, that no worker started and no ready tap moved. */
        DeliveryCommandMessage due(Instant readyAt) {
            DeliveryCommandMessage message = commandMessage(event(readyAt), NOW);
            when(repository.untappedPromise(message.commandId())).thenReturn(Optional.of(readyAt));
            return message;
        }
    }

    private static EventEnvelope<ChefAcceptedOrderData> event(Instant readyAt) {
        UUID eventId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID subOrderId = UUID.randomUUID();
        QuoteRequest request = new QuoteRequest(
            "Packaged food",
            2000,
            true,
            new Stop(
                "Madhapur, Hyderabad", "Chef", "919999999991",
                new BigDecimal("17.4483"), new BigDecimal("78.3915"),
                null, null, "Pickup"
            ),
            new Stop(
                "Gachibowli, Hyderabad", "Customer", "919999999992",
                new BigDecimal("17.4401"), new BigDecimal("78.3489"),
                null, null, "Dropoff"
            )
        );
        return new EventEnvelope<>(
            eventId,
            DeliveryCommandModels.CHEF_ACCEPTED_ORDER,
            "1.0",
            Instant.parse("2026-07-14T12:00:00Z"),
            orderId,
            null,
            "order-service",
            "chef-sub-order/" + subOrderId,
            new ChefAcceptedOrderData(orderId, subOrderId, readyAt, null, null, request)
        );
    }

    private static DeliveryCommandMessage commandMessage(
        EventEnvelope<ChefAcceptedOrderData> event,
        Instant dispatchAt
    ) {
        ChefAcceptedOrderData data = event.data();
        return new DeliveryCommandMessage(
            UUID.nameUUIDFromBytes(("delivery-command:" + data.chefSubOrderId()).getBytes()),
            event.eventId(),
            event.correlationId(),
            data.orderId(),
            data.chefSubOrderId(),
            data.readyAt(),
            dispatchAt,
            data.chefSubOrderId().toString(),
            4.5,
            "Madhapur",
            17,
            1,
            data.deliveryRequest()
        );
    }

    private static CommandRecord commandRecord(DeliveryCommandMessage message, Long sequenceNumber) {
        return new CommandRecord(
            message.commandId(), message.chefSubOrderId(), message.orderId(),
            "SCHEDULED", 0, message, sequenceNumber,
            sequenceNumber == null ? null : "delivery-command:test",
            null, null, null, 0,
            0, null, null
        );
    }
}
