package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import in.craves.integration.fleet.FleetDatabase;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;

/** The sweeper's two statements on PostgreSQL with every migration. Times are moved in the rows; nothing here waits. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class DeliveryCommandSweeperDatabaseTest {
    static FleetDatabase database;
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
    DeliveryCommandRepository commands;

    @BeforeAll
    static void migrate() {
        database = new FleetDatabase();
    }

    @BeforeEach
    void switchOn() {
        database.db.update("DELETE FROM delivery_schema.delivery_command");
        commands = new DeliveryCommandRepository(database.db, json);
        properties.setEnabled(true);
        properties.setSweeperEnabled(true);
    }

    @Test
    void withTheFlagOffNothingIsReadWrittenOrSent() {
        properties.setSweeperEnabled(false);
        UUID due = command("WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '1 hour', promised_ready_at = now() - INTERVAL '1 hour'");
        String before = row(due);

        sweeper().sweep();

        assertThat(row(due)).isEqualTo(before);
        verifyNoInteractions(publisher);
    }

    @Test
    void aDueCommandNobodyIsWorkingOnGetsOneMessageUnderANewId() {
        UUID scheduled = command("SCHEDULED", "dispatch_at = now() - INTERVAL '20 seconds'");
        UUID waiting = command("WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '20 seconds'");
        UUID failed = command("FAILED", "attempt_count = 1, updated_at = now() - INTERVAL '50 seconds'");
        UUID leaseOver = command("PROCESSING", "attempt_count = 1, processing_started_at = now() - INTERVAL '11 minutes'");
        // Not due, held, already written to, not message-driven, ended, or too old to touch.
        command("SCHEDULED", "dispatch_at = now() + INTERVAL '1 minute'");
        command("SCHEDULED", "dispatch_at = now() - INTERVAL '10 seconds'");
        command("WAITING_FOR_PROVIDER", "next_provider_retry_at = now() + INTERVAL '5 seconds'");
        command("WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '20 seconds', updated_at = now()");
        command("FAILED", "attempt_count = 3, updated_at = now() - INTERVAL '50 seconds'");
        command("PROCESSING", "attempt_count = 1, processing_started_at = now() - INTERVAL '9 minutes'");
        command("COMPLETED", "dispatch_at = now() - INTERVAL '5 minutes'");
        command("DEAD_LETTER", "dispatch_at = now() - INTERVAL '5 minutes'");
        command("SCHEDULED", "dispatch_at = now() - INTERVAL '25 hours', promised_ready_at = now() + INTERVAL '10 minutes'");

        sweeper().sweep();

        ArgumentCaptor<DeliveryCommandMessage> sent = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        ArgumentCaptor<String> ids = ArgumentCaptor.forClass(String.class);
        verify(publisher, times(4)).publishNow(sent.capture(), ids.capture());
        assertThat(sent.getAllValues()).extracting(DeliveryCommandMessage::commandId)
            .containsExactlyInAnyOrder(scheduled, waiting, failed, leaseOver);
        assertThat(ids.getAllValues()).allMatch(id -> id.startsWith("delivery-sweep:")).doesNotHaveDuplicates();
        assertThat(database.db.queryForList("SELECT DISTINCT status FROM delivery_schema.delivery_command WHERE id IN (?, ?, ?, ?)",
            String.class, scheduled, waiting, failed, leaseOver)).as("the sweeper leaves the status to the worker")
            .containsExactlyInAnyOrder("SCHEDULED", "WAITING_FOR_PROVIDER", "FAILED", "PROCESSING");

        sweeper().sweep();
        verify(publisher, times(4)).publishNow(any(), anyString());
        assertThat(commands.claim(waiting, 5)).as("the message that was sent finds the command claimable").isPresent();

        // Still nobody a margin later: sent again, under another id.
        database.db.update("UPDATE delivery_schema.delivery_command SET updated_at = now() - INTERVAL '16 seconds' WHERE id = ?", scheduled);
        sweeper().sweep();
        ArgumentCaptor<String> all = ArgumentCaptor.forClass(String.class);
        verify(publisher, times(5)).publishNow(any(), all.capture());
        assertThat(all.getAllValues()).doesNotHaveDuplicates();
    }

    @Test
    void twoReplicasSweepingAtOnceSendOneMessagePerCommand() throws Exception {
        for (int i = 0; i < 12; i++) {
            command("WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '1 minute'");
        }
        Callable<Void> sweep = () -> {
            sweeper().sweep();
            return null;
        };
        var pool = Executors.newFixedThreadPool(4);
        try {
            for (var done : pool.invokeAll(List.of(sweep, sweep, sweep, sweep))) {
                done.get();
            }
        } finally {
            pool.shutdown();
        }
        ArgumentCaptor<DeliveryCommandMessage> sent = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        verify(publisher, times(12)).publishNow(sent.capture(), anyString());
        assertThat(sent.getAllValues()).extracting(DeliveryCommandMessage::commandId).doesNotHaveDuplicates();
    }

    @Test
    void aCommandStillWithoutACourierPastTheCapIsEndedAndNotSentAgain() {
        String late = "promised_ready_at = now() - INTERVAL '21 minutes', ";
        UUID cycling = command("WAITING_FOR_PROVIDER", late + "next_provider_retry_at = now() + INTERVAL '5 minutes'");
        UUID strandedLate = command("SCHEDULED", late + "dispatch_at = now() - INTERVAL '31 minutes', updated_at = now() - INTERVAL '31 minutes'");
        UUID beingWorked = command("PROCESSING", late + "attempt_count = 1, processing_started_at = now() - INTERVAL '1 minute'");
        UUID withinCap = command("WAITING_FOR_PROVIDER", "promised_ready_at = now() - INTERVAL '19 minutes', "
            + "next_provider_retry_at = now() + INTERVAL '5 minutes'");
        UUID ridersDeciding = command("WAITING_FOR_PROVIDER", late + "next_provider_retry_at = now() + INTERVAL '5 seconds'");
        database.db.update("INSERT INTO fleet_schema.trip_stage (id, trip_id, seq, provider, deadline_at) VALUES (?, ?, 1, 'CRAVES_FLEET', "
            + "now() + INTERVAL '5 minutes')", UUID.randomUUID(), database.trip(order(ridersDeciding)));

        sweeper().sweep();

        assertThat(status(cycling)).isEqualTo("DEAD_LETTER");
        assertThat(status(strandedLate)).isEqualTo("DEAD_LETTER");
        assertThat(commands.endedAtWaitCap(cycling)).isTrue();
        assertThat(database.db.queryForObject("SELECT next_provider_retry_at IS NULL FROM delivery_schema.delivery_command WHERE id = ?",
            Boolean.class, cycling)).isTrue();
        assertThat(status(beingWorked)).isEqualTo("PROCESSING");
        assertThat(status(withinCap)).isEqualTo("WAITING_FOR_PROVIDER");
        assertThat(status(ridersDeciding)).isEqualTo("WAITING_FOR_PROVIDER");
        assertThat(commands.endedAtWaitCap(withinCap)).isFalse();
        verify(publisher, never()).publishNow(any(), anyString());

        properties.setCourierWaitCapMinutes(15);
        sweeper().sweep();
        assertThat(status(withinCap)).as("the cap is a setting").isEqualTo("DEAD_LETTER");
    }

    @Test
    void anOrderWithADeliveryJobOrAnUnansweredBookingIsNeverCappedAndItsTakeoverCompletesIt() {
        String late = "promised_ready_at = now() - INTERVAL '21 minutes', ";
        String leaseOver = late + "attempt_count = 1, processing_started_at = now() - INTERVAL '11 minutes', updated_at = now() - INTERVAL '11 minutes'";
        UUID booked = command("PROCESSING", leaseOver);
        database.db.update("INSERT INTO delivery_schema.delivery_job(id,chef_sub_order_id,order_id,provider_id,status) VALUES (?,?,?,'borzo',"
            + "'SEARCHING_AGENT')", UUID.randomUUID(), order(booked), UUID.randomUUID());
        UUID nobody = command("PROCESSING", leaseOver);
        ProviderCreateAttemptRepository journal = new ProviderCreateAttemptRepository(database.db, properties);
        UUID unanswered = command("WAITING_FOR_PROVIDER", late + "next_provider_retry_at = now() + INTERVAL '5 minutes'");
        journal.begin(order(unanswered), "borzo").orElseThrow();
        UUID lost = command("WAITING_FOR_PROVIDER", late + "next_provider_retry_at = now() - INTERVAL '1 minute'");
        var call = journal.begin(order(lost), "borzo").orElseThrow();
        journal.move(call, java.util.Set.of(ProviderCreateAttemptRepository.INTENT), ProviderCreateAttemptRepository.UNKNOWN, "timeout", null);
        UUID refused = command("WAITING_FOR_PROVIDER", late + "next_provider_retry_at = now() + INTERVAL '5 minutes'");
        var no = journal.begin(order(refused), "borzo").orElseThrow();
        journal.move(no, java.util.Set.of(ProviderCreateAttemptRepository.INTENT), ProviderCreateAttemptRepository.REJECTED, "refused", null);
        UUID plain = command("WAITING_FOR_PROVIDER", late + "next_provider_retry_at = now() + INTERVAL '5 minutes'");

        sweeper().sweep();

        assertThat(status(booked)).isEqualTo("PROCESSING");
        assertThat(status(unanswered)).isEqualTo("WAITING_FOR_PROVIDER");
        assertThat(status(lost)).isEqualTo("WAITING_FOR_PROVIDER");
        assertThat(status(nobody)).as("lease over, no job, no booking call open").isEqualTo("DEAD_LETTER");
        assertThat(status(refused)).as("a refused call is resolved").isEqualTo("DEAD_LETTER");
        assertThat(status(plain)).isEqualTo("DEAD_LETTER");
        // The two that are due and idle are sent to their takeover and their lookup; the one still cycling needs no message.
        ArgumentCaptor<DeliveryCommandMessage> sent = ArgumentCaptor.forClass(DeliveryCommandMessage.class);
        verify(publisher, times(2)).publishNow(sent.capture(), anyString());
        assertThat(sent.getAllValues()).extracting(DeliveryCommandMessage::commandId).containsExactlyInAnyOrder(booked, lost);

        DeliveryCommandMessage message = sent.getAllValues().stream().filter(m -> m.commandId().equals(booked)).findFirst().orElseThrow();
        DeliveryCommandWorker worker = new DeliveryCommandWorker(commands, new DeliveryJobRepository(database.db, json),
            mock(DeliveryProviderRouter.class), mock(DeliveryCommandCompletionService.class), properties, new DeliveryCommandRetryProperties());
        assertThat(worker.process(message).providerId()).isEqualTo("ALREADY_COMPLETED");
        assertThat(status(booked)).isEqualTo("COMPLETED");
    }

    @Test
    void aCommandHeldForTheFoodIsNotSentWhileItsHoldMayStillRun() {
        properties.setFoodTimedDispatchEnabled(true);
        String idle = "dispatch_at = now() - INTERVAL '5 minutes', updated_at = now() - INTERVAL '5 minutes', ";
        UUID held = command("SCHEDULED", idle + "ready_at = now() + INTERVAL '5 minutes', promised_ready_at = now() + INTERVAL '5 minutes'");
        UUID tapped = command("SCHEDULED", idle + "ready_at = now() - INTERVAL '5 minutes', promised_ready_at = now() + INTERVAL '5 minutes'");

        sweeper().sweep();

        verify(publisher).publishNow(argThat(message -> message.commandId().equals(tapped)), anyString());
        verify(publisher, never()).publishNow(argThat(message -> message.commandId().equals(held)), anyString());
    }

    @Test
    void aSendThatFailsIsTriedAgainAMarginLaterAndNeverThrows() {
        UUID waiting = command("WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '1 minute', updated_at = now() - INTERVAL '1 minute'");
        doThrow(new IllegalStateException("Service Bus is down")).when(publisher).publishNow(any(), anyString());

        sweeper().sweep();
        sweeper().sweep();
        verify(publisher, times(1)).publishNow(any(), anyString());
        assertThat(status(waiting)).isEqualTo("WAITING_FOR_PROVIDER");

        database.db.update("UPDATE delivery_schema.delivery_command SET updated_at = now() - INTERVAL '16 seconds' WHERE id = ?", waiting);
        sweeper().sweep();
        verify(publisher, times(2)).publishNow(any(), anyString());
    }

    @Test
    void withDeliveryCommandsOffOrNoPublisherItDoesNothing() {
        command("WAITING_FOR_PROVIDER", "next_provider_retry_at = now() - INTERVAL '1 minute', updated_at = now() - INTERVAL '1 minute'");
        new DeliveryCommandSweeper(database.db, json, provider(null), properties, new DeliveryCommandRetryProperties()).sweep();
        properties.setEnabled(false);
        sweeper().sweep();
        verifyNoInteractions(publisher);
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_command WHERE updated_at < now() - "
            + "INTERVAL '30 seconds'", Integer.class)).isEqualTo(1);
    }

    private DeliveryCommandSweeper sweeper() {
        return new DeliveryCommandSweeper(database.db, json, provider(publisher), properties, new DeliveryCommandRetryProperties());
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<DeliveryServiceBusPublisher> provider(DeliveryServiceBusPublisher publisher) {
        ObjectProvider<DeliveryServiceBusPublisher> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(publisher);
        return provider;
    }

    /** A command in the given status, last written a minute ago, then the given columns. */
    private UUID command(String status, String columns) {
        UUID chefSubOrderId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        Stop stop = new Stop("Madhapur, Hyderabad", "Chef", "919999999991", new BigDecimal("17.4483"), new BigDecimal("78.3915"), null, null, null);
        UUID id = commands.createOrFind(new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, chefSubOrderId,
            Instant.now().plusSeconds(600), Instant.now(), chefSubOrderId.toString(), 4.6, "Madhapur", 8, 4,
            new QuoteRequest("Packaged food", 2000, false, stop, stop))).id();
        database.db.update("UPDATE delivery_schema.delivery_command SET status = ?, provider_wait_started_at = now(), "
            + "next_provider_retry_at = now() + INTERVAL '1 hour', updated_at = now() - INTERVAL '1 minute' WHERE id = ?", status, id);
        database.db.update("UPDATE delivery_schema.delivery_command SET " + columns + " WHERE id = ?", id);
        return id;
    }

    private String status(UUID id) {
        return database.db.queryForObject("SELECT status FROM delivery_schema.delivery_command WHERE id = ?", String.class, id);
    }

    private UUID order(UUID id) {
        return database.db.queryForObject("SELECT chef_sub_order_id FROM delivery_schema.delivery_command WHERE id = ?", UUID.class, id);
    }

    private String row(UUID id) {
        return database.db.queryForObject("SELECT CAST(to_jsonb(c) AS text) FROM delivery_schema.delivery_command c WHERE id = ?", String.class, id);
    }
}
