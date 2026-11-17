package in.craves.integration.delivery.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStrategy;
import in.craves.integration.delivery.borzo.BorzoStatusMapper;
import in.craves.integration.delivery.borzo.BorzoWebhookNormalizer;
import in.craves.integration.delivery.command.BorzoPidgeHandoffCompletionService;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.CourierStrayBookings;
import in.craves.integration.delivery.command.DeliveryCommandCompletionService;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryJobRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository.Attempt;
import in.craves.integration.delivery.pidge.PidgeWebhookNormalizer;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import in.craves.integration.fleet.FleetDatabase;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Courier callbacks for a booking that is not (yet) a delivery job, with CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED on: the
 * real inbox, webhook processor, status service, journal, job and handoff tables on PostgreSQL; the two couriers are stubs
 * that answer for the bookings the test gives them.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class ParkedCourierCallbackDatabaseTest {
    /** The couriers' callbacks carry a later time than the status the booking was recorded with, as real ones do. */
    static final OffsetDateTime LATER = OffsetDateTime.now().plusMinutes(1);
    final FleetDatabase database = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final StubCourier borzo = new StubCourier("borzo");
    final StubCourier pidge = new StubCourier("pidge");
    final UUID orderId = UUID.randomUUID();
    final UUID chefSubOrderId = UUID.randomUUID();
    ProviderCreateAttemptRepository journal;
    DeliveryCommandRepository commands;
    DeliveryJobRepository jobs;
    BorzoPidgeHandoffRepository handoffs;
    DeliveryCommandCompletionService completion;
    CourierStrayBookings strayBookings;
    DeliveryWebhookProcessor processor;
    DeliveryCommandMessage message;
    AssignmentResponse assignment;

    @BeforeEach
    void setUp() {
        properties.setBookingJournalEnabled(true);
        journal = new ProviderCreateAttemptRepository(database.db, properties);
        commands = new DeliveryCommandRepository(database.db, json);
        jobs = new DeliveryJobRepository(database.db, json);
        handoffs = new BorzoPidgeHandoffRepository(database.db);
        DeliveryOutboxRepository outbox = new DeliveryOutboxRepository(database.db, json);
        completion = new DeliveryCommandCompletionService(mock(DeliveryAssignmentRepository.class), jobs, outbox, commands, json,
            handoffs, properties);
        completion.setJournal(journal);
        strayBookings = new CourierStrayBookings(database.db, journal, commands, mock(DeliveryProviderRouter.class), completion,
            List.of(borzo, pidge));
        DeliveryStatusRepository inbox = new DeliveryStatusRepository(database.db, json);
        processor = new DeliveryWebhookProcessor(inbox, new DeliveryLeaseRecoveryRepository(database.db),
            new DeliveryStatusUpdateService(List.of(new BorzoWebhookNormalizer(new BorzoStatusMapper()), new PidgeWebhookNormalizer()),
                inbox, outbox, properties, json, handoffs), properties);
        processor.setStrayBookings(strayBookings);

        Stop stop = new Stop("Madhapur, Hyderabad", "Chef", "919999999991", new BigDecimal("17.4483"), new BigDecimal("78.3915"), null, null, null);
        message = new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, chefSubOrderId,
            Instant.now().plusSeconds(600), Instant.now(), chefSubOrderId.toString(), 4.6, "Madhapur", 8, 4,
            new QuoteRequest("Packaged food", 2000, false, stop, stop));
        commands.createOrFind(message);
        UUID assignmentId = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_assignment (id, chef_sub_order_id, order_id, strategy, status, scoring_version, "
            + "request_context) VALUES (?, ?, ?, 'STOCHASTIC', 'RANKED', 'TEST', '{}')", assignmentId, chefSubOrderId, orderId);
        assignment = new AssignmentResponse(assignmentId, chefSubOrderId, orderId, AssignmentStrategy.STOCHASTIC, AssignmentStatus.RANKED,
            "TEST", UUID.randomUUID(), "borzo", null, List.of(), Instant.now());
    }

    /** R23: a Borzo callback that arrives before the booking's own commit is parked, and the booking is the job once only. */
    @Test
    void aCallbackAheadOfItsBookingsCommitWaitsAndIsAppliedOnceTheJobIsWritten() {
        Attempt attempt = journal.begin(chefSubOrderId, "borzo").orElseThrow();
        borzo.book("1250032", attempt.clientRef());
        UUID callback = borzoCallback("1250032", "courier_assigned");

        processor.process();

        assertThat(inbox(callback)).as("waiting, and the attempt is not counted").containsEntry("processing_status", "FAILED")
            .containsEntry("attempt_count", 0).containsEntry("processing_result", "BOOKING_NOT_ON_RECORD");
        assertThat(secondsUntilRetry(callback)).isBetween(25, 30);
        assertThat(journal.forOrder(chefSubOrderId)).extracting(Attempt::state).as("the callback adopts nothing").containsExactly("INTENT");
        assertThat(jobCount()).isZero();

        // The pass that made the booking records it.
        completion.complete(message, booked("borzo", "1250032", attempt.clientRef()));
        due(callback);
        processor.process();

        assertThat(inbox(callback)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
        assertThat(jobCount()).isEqualTo(1);
        assertThat(job()).containsEntry("provider_id", "borzo").containsEntry("provider_delivery_id", "1250032")
            .containsEntry("status", "COURIER_ASSIGNED");
        assertThat(journal.forOrder(chefSubOrderId)).extracting(Attempt::state).containsExactly("CONFIRMED");
        assertThat(borzo.cancels).isEmpty();
    }

    /** R23: a Pidge callback during a Borzo-to-Pidge handoff is not cancelled. */
    @Test
    void aPidgeCallbackDuringAHandoffWaitsForTheHandoffAndItsBookingIsNotCancelled() {
        Attempt borzoAttempt = journal.begin(chefSubOrderId, "borzo").orElseThrow();
        UUID jobId = completion.complete(message, booked("borzo", "1250032", borzoAttempt.clientRef())).deliveryJobId();
        handoffs.enroll(jobId, "1250032", Instant.now().minusSeconds(200));
        database.db.update("UPDATE delivery_schema.delivery_borzo_pidge_handoff SET state = 'PROCESSING_PIDGE', borzo_cancel_intent_at = now(), "
            + "borzo_cancelled_at = now()");
        // The handoff has booked Pidge and has yet to move the job.
        Attempt pidgeAttempt = journal.begin(chefSubOrderId, "pidge").orElseThrow();
        pidge.book("PG-1", pidgeAttempt.clientRef());
        UUID callback = pidgeCallback("PG-1");

        processor.process();

        assertThat(inbox(callback)).containsEntry("processing_status", "FAILED").containsEntry("attempt_count", 0)
            .containsEntry("processing_result", "BOOKING_NOT_ON_RECORD");
        // Nor does the journal's own check take the attempt for a stray, however long the handoff takes.
        database.db.update("UPDATE delivery_schema.provider_create_attempt SET updated_at = now() - INTERVAL '20 minutes' WHERE provider_id = 'pidge'");
        assertThat(journal.sweepAbandoned()).isZero();
        assertThat(journal.claimDueChecks(5)).isEmpty();
        assertThat(pidge.cancels).isEmpty();

        BorzoPidgeHandoffCompletionService handoffCompletion = new BorzoPidgeHandoffCompletionService(jobs,
            mock(DeliveryAssignmentRepository.class), handoffs, new DeliveryOutboxRepository(database.db, json), json);
        handoffCompletion.setJournal(journal);
        handoffCompletion.complete(handoffs.findByDeliveryJobId(jobId).orElseThrow(), pidge.delivery("PG-1", pidgeAttempt.clientRef(), DeliveryProviderAdapter.DeliveryStatus.SEARCHING),
            pidgeAttempt.clientRef());
        due(callback);
        processor.process();

        assertThat(inbox(callback)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "APPLIED");
        assertThat(job()).containsEntry("provider_id", "pidge").containsEntry("provider_delivery_id", "PG-1")
            .containsEntry("status", "COURIER_ASSIGNED");
        assertThat(journal.find("pidge", pidgeAttempt.clientRef())).map(Attempt::state).contains("CONFIRMED");
        assertThat(pidge.cancels).isEmpty();
        assertThat(borzo.cancels).isEmpty();
    }

    @Test
    void aCallbackNamesABookingTheJournalGaveUpWhichIsThenCancelledForACancelledOrder() {
        Attempt attempt = journal.begin(chefSubOrderId, "borzo").orElseThrow();
        journal.move(attempt, Set.of("INTENT"), "ORPHAN_SUSPECT", "no answer", null);
        borzo.book("1250032", attempt.clientRef());
        UUID callback = borzoCallback("1250032", "courier_assigned");

        processor.process();

        Attempt found = journal.find("borzo", attempt.clientRef()).orElseThrow();
        assertThat(found.providerRef()).as("the courier's own record named the attempt").isEqualTo("1250032");
        assertThat(journal.claimDueChecks(5)).as("due for the stray-booking check").hasSize(1);
        assertThat(inbox(callback)).containsEntry("processing_status", "FAILED").containsEntry("attempt_count", 0);

        commands.recordOrderCancelled(chefSubOrderId, "Customer cancelled", Instant.now());
        assertThat(strayBookings.resolve(found)).isTrue();
        assertThat(borzo.cancels).containsExactly("1250032");
        assertThat(journal.find("borzo", attempt.clientRef())).map(Attempt::state).contains("CANCELLED");

        int reads = borzo.reads;
        due(callback);
        processor.process();
        assertThat(inbox(callback)).containsEntry("processing_status", "PROCESSED").containsEntry("processing_result", "STRAY_BOOKING_CANCELLED");
        assertThat(borzo.reads).as("the journal row names the booking: the courier is not asked again").isEqualTo(reads);
        assertThat(jobCount()).isZero();
    }

    @Test
    void aBookingTheCourierOrTheJournalDoesNotKnowAndAnOldCallbackEndAsBefore() {
        // The courier has no such booking.
        UUID unknown = borzoCallback("999", "courier_assigned");
        // The booking is real but was not made under the journal.
        pidge.book("PG-7", chefSubOrderId.toString());
        UUID unjournalled = pidgeCallback("PG-7");
        // In flight, but the callback has waited its 30 minutes.
        Attempt attempt = journal.begin(chefSubOrderId, "borzo").orElseThrow();
        borzo.book("1250032", attempt.clientRef());
        UUID old = borzoCallback("1250032", "courier_assigned");
        database.db.update("UPDATE delivery_schema.delivery_webhook_inbox SET received_at = now() - INTERVAL '31 minutes' WHERE id = ?", old);

        processor.process();

        for (UUID callback : List.of(unknown, unjournalled, old)) {
            assertThat(inbox(callback)).containsEntry("processing_status", "FAILED").containsEntry("attempt_count", 1);
            assertThat((String) inbox(callback).get("error_message")).startsWith("No delivery job matches provider order");
        }
        assertThat(borzo.cancels).isEmpty();
        assertThat(pidge.cancels).isEmpty();
    }

    @Test
    void withTheJournalOffAnUnmatchedCallbackIsCountedAndNoCourierIsAsked() {
        Attempt attempt = journal.begin(chefSubOrderId, "borzo").orElseThrow();
        borzo.book("1250032", attempt.clientRef());
        properties.setBookingJournalEnabled(false);
        UUID callback = borzoCallback("1250032", "courier_assigned");

        processor.process();

        assertThat(inbox(callback)).containsEntry("processing_status", "FAILED").containsEntry("attempt_count", 1);
        assertThat(inbox(callback).get("processing_result")).isNull();
        assertThat(secondsUntilRetry(callback)).isBetween(1, 5);
        assertThat(borzo.reads).isZero();
    }

    private RoutingResult booked(String provider, String bookingId, String reference) {
        return new RoutingResult(provider, ("borzo".equals(provider) ? borzo : pidge).delivery(bookingId, reference,
            DeliveryProviderAdapter.DeliveryStatus.SEARCHING), assignment, assignment.selectedCandidateId(), List.of(), List.of(), reference);
    }

    private UUID borzoCallback(String orderId, String status) {
        ObjectNode payload = json.createObjectNode().put("event_type", "delivery_changed").put("event_datetime", LATER.toString());
        payload.putObject("delivery").put("order_id", orderId).put("status", status).put("status_datetime", LATER.toString());
        return callback("borzo", payload);
    }

    private UUID pidgeCallback(String id) {
        ObjectNode payload = json.createObjectNode().put("id", id).put("status", "2").put("updated_at", LATER.toInstant().toString());
        payload.putObject("fulfillment").put("status", "CREATED").putObject("rider").put("id", "7").put("name", "Ravi").put("mobile", "9999999999");
        return callback("pidge", payload);
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

    private Map<String, Object> inbox(UUID callback) {
        return database.db.queryForMap("SELECT processing_status, attempt_count, processing_result, error_message "
            + "FROM delivery_schema.delivery_webhook_inbox WHERE id = ?", callback);
    }

    private Integer secondsUntilRetry(UUID callback) {
        return database.db.queryForObject("SELECT CAST(ceil(extract(epoch FROM next_attempt_at - now())) AS integer) FROM "
            + "delivery_schema.delivery_webhook_inbox WHERE id = ?", Integer.class, callback);
    }

    private Integer jobCount() {
        return database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class);
    }

    private Map<String, Object> job() {
        return database.db.queryForMap("SELECT provider_id, provider_delivery_id, status FROM delivery_schema.delivery_job");
    }

    /** A courier that knows the bookings the test gave it, each with the reference it was made under. */
    final class StubCourier implements DeliveryProviderAdapter {
        final String id;
        final Map<String, ProviderDelivery> bookings = new HashMap<>();
        final List<String> cancels = new ArrayList<>();
        int reads;

        StubCourier(String id) {
            this.id = id;
        }

        void book(String bookingId, String reference) {
            bookings.put(bookingId, delivery(bookingId, reference, DeliveryStatus.COURIER_ASSIGNED));
        }

        ProviderDelivery delivery(String bookingId, String reference, DeliveryStatus status) {
            ObjectNode order = json.createObjectNode();
            order.putArray("points").addObject().put("client_order_id", reference);
            return new ProviderDelivery(id, bookingId, "borzo".equals(id) ? null : reference, status, status.name(), BigDecimal.TEN, BigDecimal.TEN, null, order,
                Instant.now());
        }

        @Override
        public String providerId() {
            return id;
        }

        @Override
        public TrackingSnapshot track(String providerDeliveryId) {
            reads++;
            ProviderDelivery booking = bookings.get(providerDeliveryId);
            if (booking == null) {
                throw new IllegalStateException("No such booking");
            }
            return new TrackingSnapshot(booking, null, Instant.now());
        }

        @Override
        public ProviderDelivery cancel(String providerDeliveryId) {
            cancels.add(providerDeliveryId);
            ProviderDelivery now = delivery(providerDeliveryId, "cancelled", DeliveryStatus.CANCELLED);
            bookings.put(providerDeliveryId, now);
            return now;
        }

        @Override
        public ProviderQuote quote(QuoteRequest request) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ProviderDelivery create(CreateDeliveryRequest request) {
            throw new UnsupportedOperationException();
        }
    }
}
