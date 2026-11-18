package in.craves.integration.delivery.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStrategy;
import in.craves.integration.delivery.borzo.BorzoStatusMapper;
import in.craves.integration.delivery.borzo.BorzoWebhookNormalizer;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.DeliveryCommandCompletionService;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryJobRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.pidge.PidgeWebhookNormalizer;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderDelivery;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import in.craves.integration.fleet.FleetDatabase;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.slf4j.LoggerFactory;

/**
 * CRAVES_DELIVERY_WEBHOOK_VERIFY_FETCH: the real inbox, webhook processor, status service and job tables on PostgreSQL;
 * Pidge's API is a function the test answers for.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class PidgeCallbackReadBackDatabaseTest {
    static final OffsetDateTime LATER = OffsetDateTime.now().plusMinutes(1);
    final FleetDatabase database = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final AtomicInteger reads = new AtomicInteger();
    final List<String> lines = new CopyOnWriteArrayList<>();
    final AppenderBase<ILoggingEvent> logged = new AppenderBase<>() {
        @Override
        protected void append(ILoggingEvent event) {
            String line = event.getFormattedMessage();
            if (line.startsWith("CRAVES_ALERT") || line.startsWith("DELIVERY_WEBHOOK_VERIFY_FETCH")) {
                lines.add(line);
            }
        }
    };
    /** What Pidge's API answers for a booking; replaced by each test. */
    volatile Function<String, ProviderDelivery> pidgeApi = id -> pidge(id, DeliveryStatus.IN_TRANSIT);
    DeliveryCommandCompletionService completion;
    DeliveryCommandRepository commands;
    DeliveryWebhookProcessor processor;
    PidgeCallbackReadBack readBack;

    @BeforeEach
    void setUp() {
        commands = new DeliveryCommandRepository(database.db, json);
        BorzoPidgeHandoffRepository handoffs = new BorzoPidgeHandoffRepository(database.db);
        DeliveryOutboxRepository outbox = new DeliveryOutboxRepository(database.db, json);
        completion = new DeliveryCommandCompletionService(mock(DeliveryAssignmentRepository.class),
            new DeliveryJobRepository(database.db, json), outbox, commands, json, handoffs, properties);
        DeliveryStatusRepository inbox = new DeliveryStatusRepository(database.db, json);
        processor = new DeliveryWebhookProcessor(inbox, new DeliveryLeaseRecoveryRepository(database.db),
            new DeliveryStatusUpdateService(List.of(new BorzoWebhookNormalizer(new BorzoStatusMapper()), new PidgeWebhookNormalizer()),
                inbox, outbox, properties, json, handoffs), properties);
        logged.start();
        ((Logger) LoggerFactory.getLogger(DeliveryWebhookProcessor.class)).addAppender(logged);
    }

    @AfterEach
    void tearDown() throws InterruptedException {
        ((Logger) LoggerFactory.getLogger(DeliveryWebhookProcessor.class)).detachAppender(logged);
        if (readBack != null) {
            readBack.destroy();
        }
    }

    @Test
    void enforceDoesNotApplyADeliveredCallbackPidgeDoesNotYetShowAndAppliesItOncePidgeDoes() throws InterruptedException {
        mode("enforce");
        properties.setWebhookFirstTrackingEnabled(true);
        UUID job = job("pidge", "PG-1", DeliveryStatus.IN_TRANSIT);
        Map<String, Object> schedule = schedule(job);
        UUID callback = pidgeCallback("PG-1", "DELIVERED");

        processor.process();
        finishReadBacks();

        assertThat(status(job)).isEqualTo("IN_TRANSIT");
        assertThat(inbox(callback)).as("to be read again").containsEntry("processing_status", "FAILED").containsEntry("attempt_count", 1);
        assertThat((String) inbox(callback).get("error_message")).startsWith("VERIFY_FETCH_FAILED");
        assertThat(inbox(callback).get("processing_result")).isNull();
        assertThat(schedule(job)).as("the job's next poll is not put off").isEqualTo(schedule);
        assertThat(reads).hasValue(1);
        assertThat(lines).isEmpty();

        pidgeApi = id -> pidge(id, DeliveryStatus.DELIVERED);
        due(callback);
        processor.process();
        finishReadBacks();

        assertThat(status(job)).isEqualTo("DELIVERED");
        assertThat(inbox(callback)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
        assertThat(lines).isEmpty();
    }

    @Test
    void enforceAppliesTheOtherFinalStatusPidgeHoldsAndTheCallbackWhenTheyAgree() throws InterruptedException {
        mode("enforce");
        properties.setWebhookFirstTrackingEnabled(true);
        UUID first = job("pidge", "PG-1", DeliveryStatus.IN_TRANSIT);
        UUID second = job("pidge", "PG-2", DeliveryStatus.IN_TRANSIT);
        pidgeApi = id -> pidge(id, "PG-1".equals(id) ? DeliveryStatus.DELIVERED : DeliveryStatus.CANCELLED);
        UUID agreed = pidgeCallback("PG-1", "DELIVERED");
        UUID differed = pidgeCallback("PG-2", "DELIVERED");

        processor.process();
        finishReadBacks();

        assertThat(status(first)).isEqualTo("DELIVERED");
        assertThat(inbox(agreed)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
        assertThat(schedule(first).get("last_webhook_at")).isNotNull();
        assertThat(status(second)).isEqualTo("CANCELLED");
        assertThat(inbox(differed)).containsEntry("processing_status", "PROCESSED")
            .containsEntry("processing_result", "VERIFY_FETCH_DISAGREED_APPLIED");
        assertThat(schedule(second).get("last_webhook_at")).as("not counted as a callback heard").isNull();
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0)).startsWith("CRAVES_ALERT alert=COURIER_WEBHOOK_VERIFY_DISAGREED provider=pidge");
    }

    @Test
    void aCallbackClaimedAgainWhileItWaitedIsNotWrittenByTheEarlierPass() throws InterruptedException {
        for (boolean readFails : new boolean[] {false, true}) {
            mode("enforce");
            String booking = "PG-" + readFails;
            UUID job = job("pidge", booking, DeliveryStatus.IN_TRANSIT);
            CountDownLatch reading = new CountDownLatch(1);
            CountDownLatch answer = new CountDownLatch(1);
            pidgeApi = id -> {
                reading.countDown();
                try {
                    answer.await();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
                if (readFails) {
                    throw new IllegalStateException("Pidge response was not received");
                }
                return pidge(id, DeliveryStatus.DELIVERED);
            };
            UUID callback = pidgeCallback(booking, "DELIVERED");
            try {
                processor.process();
                assertThat(reading.await(10, TimeUnit.SECONDS)).isTrue();
                // A later pass takes the row over, as it does when a lease runs out.
                database.db.update("UPDATE delivery_schema.delivery_webhook_inbox SET attempt_count = attempt_count + 1 WHERE id = ?", callback);
            } finally {
                answer.countDown();
            }
            finishReadBacks();

            assertThat(inbox(callback)).as("readFails=%s", readFails).containsEntry("processing_status", "PROCESSING")
                .containsEntry("attempt_count", 2);
            assertThat(inbox(callback).get("error_message")).isNull();
            assertThat(status(job)).isEqualTo("IN_TRANSIT");
            assertThat(lines).isEmpty();
        }
    }

    @Test
    void withTheThreadBusyABacklogOfPidgeFinalCallbacksDoesNotHoldBackABorzoCallback() throws InterruptedException {
        mode("enforce");
        properties.setWebhookBatchSize(5);
        CountDownLatch busy = new CountDownLatch(1);
        Runnable wait = () -> {
            try {
                busy.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        };
        for (int taken = 0; taken <= PidgeCallbackReadBack.QUEUE; taken++) {
            assertThat(readBack.submit(wait)).isTrue();
        }
        for (int older = 1; older <= 6; older++) {
            job("pidge", "PG-" + older, DeliveryStatus.IN_TRANSIT);
            UUID callback = pidgeCallback("PG-" + older, "DELIVERED");
            database.db.update("UPDATE delivery_schema.delivery_webhook_inbox SET received_at = now() - make_interval(mins => 1) WHERE id = ?",
                callback);
        }
        UUID borzoJob = job("borzo", "1250032", DeliveryStatus.SEARCHING);
        UUID borzoCallback = borzoCallback("1250032", "courier_assigned");

        try {
            processor.process();
            assertThat(inbox(borzoCallback)).as("behind a full batch of older rows").containsEntry("processing_status", "RECEIVED");

            processor.process();

            assertThat(inbox(borzoCallback)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
            assertThat(status(borzoJob)).isEqualTo("COURIER_ASSIGNED");
            assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_webhook_inbox WHERE provider_id = 'pidge' "
                + "AND processing_status = 'FAILED' AND attempt_count = 0 AND next_attempt_at > now()", Integer.class))
                .as("every Pidge row waits its turn, uncounted").isEqualTo(6);
        } finally {
            busy.countDown();
        }
    }

    @Test
    void shadowAppliesTheCallbackAsBeforeAndWritesOneLineWhenPidgeDiffers() throws InterruptedException {
        mode("shadow");
        UUID job = job("pidge", "PG-1", DeliveryStatus.IN_TRANSIT);
        UUID other = job("pidge", "PG-2", DeliveryStatus.IN_TRANSIT);
        pidgeApi = id -> pidge(id, "PG-1".equals(id) ? DeliveryStatus.IN_TRANSIT : DeliveryStatus.CANCELLED);
        UUID callback = pidgeCallback("PG-1", "DELIVERED");
        pidgeCallback("PG-2", "DELIVERED");

        processor.process();
        finishReadBacks();

        assertThat(status(job)).isEqualTo("DELIVERED");
        assertThat(status(other)).isEqualTo("DELIVERED");
        assertThat(inbox(callback)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
        assertThat(lines).containsExactlyInAnyOrder("DELIVERY_WEBHOOK_VERIFY_FETCH mode=shadow result=BEHIND provider=pidge",
            "DELIVERY_WEBHOOK_VERIFY_FETCH mode=shadow result=DIFFERENT provider=pidge");
    }

    @Test
    void shadowAppliesTheCallbackWhenPidgeCannotBeRead() throws InterruptedException {
        mode("shadow");
        UUID job = job("pidge", "PG-1", DeliveryStatus.IN_TRANSIT);
        pidgeApi = id -> {
            throw new IllegalStateException("Pidge response was not received");
        };
        pidgeCallback("PG-1", "DELIVERED");

        processor.process();
        finishReadBacks();

        assertThat(status(job)).isEqualTo("DELIVERED");
        assertThat(lines).containsExactly("DELIVERY_WEBHOOK_VERIFY_FETCH mode=shadow result=FETCH_FAILED provider=pidge");
    }

    @Test
    void aPidgeReadThatBlocksDoesNotDelayBorzoCallbacks() throws InterruptedException {
        mode("enforce");
        UUID pidgeJob = job("pidge", "PG-1", DeliveryStatus.IN_TRANSIT);
        UUID borzoJob = job("borzo", "1250032", DeliveryStatus.SEARCHING);
        CountDownLatch reading = new CountDownLatch(1);
        CountDownLatch answer = new CountDownLatch(1);
        pidgeApi = id -> {
            reading.countDown();
            try {
                answer.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            return pidge(id, DeliveryStatus.DELIVERED);
        };
        UUID pidgeCallback = pidgeCallback("PG-1", "DELIVERED");
        UUID borzoCallback = borzoCallback("1250032", "courier_assigned");

        try {
            processor.process();

            assertThat(reading.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(inbox(borzoCallback)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
            assertThat(status(borzoJob)).isEqualTo("COURIER_ASSIGNED");
            assertThat(inbox(pidgeCallback)).as("still held by Pidge's thread").containsEntry("processing_status", "PROCESSING");
            assertThat(status(pidgeJob)).isEqualTo("IN_TRANSIT");
        } finally {
            answer.countDown();
        }
        finishReadBacks();

        assertThat(inbox(pidgeCallback)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
        assertThat(status(pidgeJob)).isEqualTo("DELIVERED");
    }

    @Test
    void enforceRetriesWhenPidgeCannotBeReadAndDeadLettersWithOneAlertAfterTheLastAttempt() throws InterruptedException {
        mode("enforce");
        UUID job = job("pidge", "PG-1", DeliveryStatus.IN_TRANSIT);
        pidgeApi = id -> {
            throw new IllegalStateException("Pidge response was not received");
        };
        UUID callback = pidgeCallback("PG-1", "DELIVERED");

        processor.process();
        finishReadBacks();

        assertThat(status(job)).isEqualTo("IN_TRANSIT");
        assertThat(inbox(callback)).containsEntry("processing_status", "FAILED").containsEntry("attempt_count", 1);
        assertThat((String) inbox(callback).get("error_message")).startsWith("VERIFY_FETCH_FAILED");
        assertThat(lines).isEmpty();

        database.db.update("UPDATE delivery_schema.delivery_webhook_inbox SET attempt_count = ?, next_attempt_at = now() WHERE id = ?",
            properties.getMaxWebhookAttempts() - 1, callback);
        processor.process();
        finishReadBacks();

        assertThat(status(job)).isEqualTo("IN_TRANSIT");
        assertThat(inbox(callback)).containsEntry("processing_status", "DEAD_LETTER");
        assertThat((String) inbox(callback).get("error_message")).startsWith("VERIFY_FETCH_FAILED");
        assertThat(lines).hasSize(1);
        assertThat(lines.get(0)).startsWith("CRAVES_ALERT alert=COURIER_WEBHOOK_VERIFY_FAILED provider=pidge");
    }

    @Test
    void aCallbackThePidgeThreadCannotTakeIsDueAgainAndNotCounted() throws InterruptedException {
        mode("enforce");
        UUID job = job("pidge", "PG-1", DeliveryStatus.IN_TRANSIT);
        pidgeApi = id -> pidge(id, DeliveryStatus.DELIVERED);
        CountDownLatch busy = new CountDownLatch(1);
        Runnable wait = () -> {
            try {
                busy.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        };
        for (int taken = 0; taken <= PidgeCallbackReadBack.QUEUE; taken++) {
            assertThat(readBack.submit(wait)).isTrue();
        }
        UUID callback = pidgeCallback("PG-1", "DELIVERED");

        try {
            processor.process();

            assertThat(inbox(callback)).containsEntry("processing_status", "FAILED").containsEntry("attempt_count", 0);
            assertThat(inbox(callback).get("error_message")).isNull();
            assertThat(status(job)).isEqualTo("IN_TRANSIT");
            assertThat(lines).containsExactly("DELIVERY_WEBHOOK_VERIFY_FETCH result=QUEUE_FULL provider=pidge");
            assertThat(database.db.queryForObject("SELECT CAST(ceil(extract(epoch FROM next_attempt_at - now())) AS integer) FROM "
                + "delivery_schema.delivery_webhook_inbox WHERE id = ?", Integer.class, callback)).isBetween(5, 10);
        } finally {
            busy.countDown();
        }
        finishReadBacks();
        due(callback);
        processor.process();
        finishReadBacks();

        assertThat(inbox(callback)).containsEntry("processing_status", "PROCESSED").containsEntry("attempt_count", 1);
        assertThat(status(job)).isEqualTo("DELIVERED");
    }

    @Test
    void onlyPidgeFinalStatusesForADeliveryJobAreReadBack() throws InterruptedException {
        mode("enforce");
        UUID pidgeJob = job("pidge", "PG-1", DeliveryStatus.SEARCHING);
        UUID borzoJob = job("borzo", "1250032", DeliveryStatus.IN_TRANSIT);
        UUID inTransit = pidgeCallback("PG-1", "IN_TRANSIT");
        UUID borzoFinal = borzoCallback("1250032", "finished");
        UUID noJob = pidgeCallback("PG-9", "DELIVERED");

        processor.process();
        finishReadBacks();

        assertThat(reads).hasValue(0);
        assertThat(inbox(inTransit)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
        assertThat(status(pidgeJob)).isEqualTo("IN_TRANSIT");
        assertThat(inbox(borzoFinal)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
        assertThat(status(borzoJob)).isEqualTo("DELIVERED");
        assertThat(inbox(noJob)).containsEntry("processing_status", "FAILED").containsEntry("attempt_count", 1);
        assertThat(lines).isEmpty();
    }

    @Test
    void offAppliesAPidgeFinalCallbackInThePassItselfAndReadsNothing() {
        UUID job = job("pidge", "PG-1", DeliveryStatus.IN_TRANSIT);
        UUID callback = pidgeCallback("PG-1", "DELIVERED");

        processor.process();

        assertThat(status(job)).isEqualTo("DELIVERED");
        assertThat(inbox(callback)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED")
            .containsEntry("attempt_count", 1);
        assertThat(reads).hasValue(0);
        assertThat(lines).isEmpty();
    }

    private void mode(String mode) {
        properties.setWebhookVerifyFetch(mode);
        readBack = newReadBack();
        processor.setReadBack(readBack);
    }

    private PidgeCallbackReadBack newReadBack() {
        return new PidgeCallbackReadBack(id -> {
            reads.incrementAndGet();
            return pidgeApi.apply(id);
        });
    }

    /** Waits for Pidge's thread to finish what it took, then gives the processor a fresh one. */
    private void finishReadBacks() throws InterruptedException {
        readBack.destroy();
        readBack = newReadBack();
        processor.setReadBack(readBack);
    }

    private ProviderDelivery pidge(String bookingId, DeliveryStatus status) {
        return delivery("pidge", bookingId, status);
    }

    private ProviderDelivery delivery(String provider, String bookingId, DeliveryStatus status) {
        return new ProviderDelivery(provider, bookingId, null, status, status.name(), BigDecimal.TEN, BigDecimal.TEN, null,
            json.createObjectNode(), Instant.now());
    }

    /** A delivery job of its own order, booked with the courier and now at the given stage. */
    private UUID job(String provider, String bookingId, DeliveryStatus stage) {
        UUID orderId = UUID.randomUUID();
        UUID chefSubOrderId = UUID.randomUUID();
        Stop stop = new Stop("Madhapur, Hyderabad", "Chef", "919999999991", new BigDecimal("17.4483"), new BigDecimal("78.3915"), null, null, null);
        DeliveryCommandMessage message = new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, chefSubOrderId,
            Instant.now().plusSeconds(600), Instant.now(), chefSubOrderId.toString(), 4.6, "Madhapur", 8, 4,
            new QuoteRequest("Packaged food", 2000, false, stop, stop));
        commands.createOrFind(message);
        UUID assignmentId = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_assignment (id, chef_sub_order_id, order_id, strategy, status, scoring_version, "
            + "request_context) VALUES (?, ?, ?, 'STOCHASTIC', 'RANKED', 'TEST', '{}')", assignmentId, chefSubOrderId, orderId);
        AssignmentResponse assignment = new AssignmentResponse(assignmentId, chefSubOrderId, orderId, AssignmentStrategy.STOCHASTIC,
            AssignmentStatus.RANKED, "TEST", UUID.randomUUID(), provider, null, List.of(), Instant.now());
        UUID job = completion.complete(message, new RoutingResult(provider, delivery(provider, bookingId, DeliveryStatus.SEARCHING), assignment,
            assignment.selectedCandidateId(), List.of(), List.of(), chefSubOrderId.toString())).deliveryJobId();
        database.db.update("UPDATE delivery_schema.delivery_job SET status = ? WHERE id = ?", stage.name(), job);
        return job;
    }

    private UUID pidgeCallback(String id, String fulfillmentStatus) {
        ObjectNode payload = json.createObjectNode().put("id", id).put("status", "2").put("updated_at", LATER.toInstant().toString());
        payload.putObject("fulfillment").put("status", fulfillmentStatus);
        return callback("pidge", payload);
    }

    private UUID borzoCallback(String orderId, String status) {
        ObjectNode payload = json.createObjectNode().put("event_type", "delivery_changed").put("event_datetime", LATER.toString());
        payload.putObject("delivery").put("order_id", orderId).put("status", status).put("status_datetime", LATER.toString());
        return callback("borzo", payload);
    }

    private UUID callback(String provider, ObjectNode payload) {
        UUID id = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_webhook_inbox (id, provider_id, provider_event_id, raw_payload) "
            + "VALUES (?, ?, ?, ?::jsonb)", id, provider, "event-" + id, payload.toString());
        return id;
    }

    private void due(UUID callback) {
        database.db.update("UPDATE delivery_schema.delivery_webhook_inbox SET next_attempt_at = now() WHERE id = ?", callback);
    }

    private Map<String, Object> schedule(UUID job) {
        return database.db.queryForMap("SELECT next_tracking_at, last_webhook_at FROM delivery_schema.delivery_job WHERE id = ?", job);
    }

    private Map<String, Object> inbox(UUID callback) {
        return database.db.queryForMap("SELECT processing_status, attempt_count, processing_result, error_message "
            + "FROM delivery_schema.delivery_webhook_inbox WHERE id = ?", callback);
    }

    private String status(UUID job) {
        return database.db.queryForObject("SELECT status FROM delivery_schema.delivery_job WHERE id = ?", String.class, job);
    }
}
