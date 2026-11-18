package in.craves.integration.delivery.borzo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.config.BorzoProperties;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStrategy;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateScore;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.Momentum;
import in.craves.integration.delivery.DeliveryIntelligenceService;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.CourierBreaker;
import in.craves.integration.delivery.command.CourierStrayBookings;
import in.craves.integration.delivery.command.DeliveryCommandCompletionService;
import in.craves.integration.delivery.command.DeliveryCommandCompletionService.StaleCommandLeaseException;
import in.craves.integration.delivery.command.DeliveryCommandModels.RoutingResult;
import in.craves.integration.delivery.command.DeliveryCommandRepository.CommandRecord;
import in.craves.integration.delivery.command.DeliveryCommandWorker.DeliveryCommandNonRetryableException;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryCommandRetryProperties;
import in.craves.integration.delivery.command.DeliveryCommandWorker;
import in.craves.integration.delivery.command.DeliveryCommandWorker.DeliveryCommandTransientException;
import in.craves.integration.delivery.command.DeliveryCreateReconciliationWorker;
import in.craves.integration.delivery.command.DeliveryJobRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderCatalogRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryCreateReconciliationPendingException;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryRoutingException;
import in.craves.integration.delivery.command.DeliveryServiceBusPublisher;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository.Attempt;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationResult;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import in.craves.integration.delivery.status.DeliveryLeaseRecoveryRepository;
import in.craves.integration.fleet.FleetDatabase;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * The courier booking journal end to end, with CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED on and the timed Borzo-then-Pidge
 * policy: the real router, command worker, reconciliation worker and Borzo client against PostgreSQL, a scripted Borzo API
 * and a stub Pidge. Passes are run by hand; between them the test makes the command due instead of sleeping.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class CourierBookingJournalDatabaseTest {
    static final String BORZO = "https://robotapitest-in.borzodelivery.com/api/business/1.8";
    static final String QUOTE = "{\"is_successful\":true,\"order\":{\"payment_amount\":\"100.00\",\"delivery_fee_amount\":\"100.00\"}}";

    final FleetDatabase database = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final ExecutorService quotes = Executors.newFixedThreadPool(2);
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();
    final DeliveryProviderCatalogRepository catalog = mock(DeliveryProviderCatalogRepository.class);
    final DeliveryIntelligenceService intelligence = mock(DeliveryIntelligenceService.class);
    final DeliveryAssignmentRepository assignments = mock(DeliveryAssignmentRepository.class);
    final DeliveryServiceBusPublisher publisher = mock(DeliveryServiceBusPublisher.class);
    final StubPidge pidge = new StubPidge();
    final UUID orderId = UUID.randomUUID();
    final UUID chefSubOrderId = UUID.randomUUID();
    MockRestServiceServer borzo;
    BorzoApiClient borzoClient;
    ProviderCreateAttemptRepository journal;
    DeliveryCommandRepository commands;
    DeliveryProviderRouter router;
    DeliveryCommandWorker worker;
    DeliveryCreateReconciliationWorker reconciliation;
    DeliveryCommandCompletionService completion;
    DeliveryCommandMessage message;

    @BeforeEach
    void setUp() {
        properties.setBookingJournalEnabled(true);
        properties.setBorzoPidgeHandoffEnabled(true);
        BorzoProperties borzoProperties = new BorzoProperties();
        borzoProperties.setEnabled(true);
        borzoProperties.setCreateEnabled(true);
        borzoProperties.setBaseUrl(BORZO);
        borzoProperties.setAuthToken("sandbox-token");
        RestClient.Builder http = RestClient.builder();
        borzo = MockRestServiceServer.bindTo(http).ignoreExpectOrder(true).build();
        borzoClient = new BorzoApiClient(borzoProperties, json, new BorzoStatusMapper(), http.build());
        borzoClient.setCommandProperties(properties);

        journal = new ProviderCreateAttemptRepository(database.db, properties);
        commands = new DeliveryCommandRepository(database.db, json);
        DeliveryJobRepository jobs = new DeliveryJobRepository(database.db, json);
        when(catalog.activeProviderIds()).thenReturn(List.of("borzo", "pidge"));
        AssignmentResponse assignment = assignment();
        when(intelligence.assign(any())).thenReturn(assignment);
        when(assignments.findResponseByChefSubOrderId(chefSubOrderId)).thenReturn(Optional.of(assignment));
        router = new DeliveryProviderRouter(List.of(borzoClient, pidge), catalog, intelligence, assignments, properties, quotes,
            Clock.systemUTC(), null);
        router.setJournal(journal);
        completion = new DeliveryCommandCompletionService(assignments, jobs,
            new DeliveryOutboxRepository(database.db, json), commands, json, mock(BorzoPidgeHandoffRepository.class), properties);
        completion.setJournal(journal);
        worker = new DeliveryCommandWorker(commands, jobs, router, completion, properties, new DeliveryCommandRetryProperties());
        worker.setJournal(journal);
        reconciliation = new DeliveryCreateReconciliationWorker(commands, jobs, router, completion,
            new DeliveryLeaseRecoveryRepository(database.db), properties);
        reconciliation.setJournal(journal);
        reconciliation.setPublisher(publisher);
        reconciliation.setStrayBookings(new CourierStrayBookings(database.db, journal, commands, router, completion,
            List.of(borzoClient, pidge)));

        Stop pickup = new Stop("Madhapur, Hyderabad", "Chef", "919999999991", new BigDecimal("17.4483"), new BigDecimal("78.3915"), null, null, null);
        Stop drop = new Stop("Gachibowli, Hyderabad", "Customer", "919999999992", new BigDecimal("17.4401"), new BigDecimal("78.3489"), null, null, null);
        message = new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, chefSubOrderId,
            Instant.now().plusSeconds(600), Instant.now(), chefSubOrderId.toString(), 4.6, "Madhapur", 8, 4,
            new QuoteRequest("Packaged food", 2000, false, pickup, drop));
        commands.createOrFind(message);
    }

    @AfterEach
    void shutDown() {
        quotes.shutdownNow();
    }

    @Test
    void aRefusedBorzoGoesStraightToPidgeAndIsNotBookedAgain() {
        borzoQuotes();
        borzo.expect(ExpectedCount.once(), requestTo(BORZO + "/create-order"))
            .andExpect(jsonPath("$.points[1].client_order_id").value(startsWith(reference().substring(0, 26))))
            .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON)
                .body("{\"is_successful\":false,\"errors\":[\"invalid_parameters\"]}"));

        assertThatThrownBy(() -> worker.process(message)).isInstanceOf(DeliveryCommandTransientException.class)
            .hasMessageContaining("Borzo refused the booking; Pidge is next");
        assertThat(row("borzo")).containsEntry("state", "REJECTED");
        assertThat((String) row("borzo").get("error")).contains("invalid_parameters");
        assertThat(secondsUntil("borzo", "next_check_at")).as("one lookup to check the refusal").isBetween(15, 20);
        assertThat(commandStatus()).isEqualTo("WAITING_FOR_PROVIDER");

        due();
        assertThat(worker.process(message).providerId()).isEqualTo("pidge");

        assertThat(row("pidge")).containsEntry("state", "CONFIRMED").containsEntry("provider_ref", "PG-1");
        assertThat(pidge.references).singleElement().asString().hasSize(27).endsWith("1");
        assertThat(jobProvider()).isEqualTo("pidge");
        assertThat(commandStatus()).isEqualTo("COMPLETED");
        borzo.verify();
    }

    @Test
    void aLostAnswerThatBorzoDoesNotHaveMovesTheOrderToPidge() {
        borzoLosesTheAnswer();
        borzoHasNoSuchOrder();
        assertThat(worker.process(message).providerId()).isEqualTo("RECONCILIATION_PENDING");
        assertThat(row("borzo")).containsEntry("state", "UNKNOWN");
        assertThat(secondsUntilCommand("next_reconciliation_at")).as("the first look waits for Borzo's list").isBetween(15, 20);
        assertThatThrownBy(() -> router.route(message, Instant.now())).as("nobody is quoted while a booking is unresolved")
            .hasMessageContaining("unresolved");
        assertThat(pidge.quoteCalls).isZero();

        look();

        assertThat(row("borzo")).containsEntry("state", "REJECTED");
        assertThat(secondsUntil("borzo", "next_check_at")).as("the 'not found' is checked once more").isBetween(290, 300);
        verify(publisher).publishNow(eq(message), org.mockito.ArgumentMatchers.startsWith("reconciled:" + message.commandId() + ":"));
        assertThat(commandStatus()).isEqualTo("WAITING_FOR_PROVIDER");

        assertThat(worker.process(message).providerId()).isEqualTo("pidge");
        assertThat(row("pidge")).containsEntry("state", "CONFIRMED");
        assertThat(commandAttempts()).as("the pass after reconciliation costs no delivery attempt").isEqualTo(1);
        borzo.verify();
    }

    @Test
    void anAnswerNobodyCanConfirmBecomesAnOrphanSuspectAfterFourLooksAndTheOrderMovesOn() {
        borzoLosesTheAnswer();
        borzo.expect(ExpectedCount.times(4), requestTo(startsWith(BORZO + "/orders"))).andRespond(withServerError());
        worker.process(message);

        for (int look = 1; look <= 3; look++) {
            look();
            assertThat(row("borzo")).as("look %s", look).containsEntry("state", "UNKNOWN");
            assertThat(secondsUntilCommand("next_reconciliation_at")).as("look %s", look)
                .isBetween(15 * (1 << (look - 1)) - 5, 15 * (1 << (look - 1)));
            verify(publisher, never()).publishNow(any(), any());
        }
        look();

        assertThat(row("borzo")).containsEntry("state", "ORPHAN_SUSPECT");
        assertThat(secondsUntil("borzo", "next_check_at")).isBetween(55, 60);
        verify(publisher).publishNow(eq(message), any());
        assertThat(worker.process(message).providerId()).isEqualTo("pidge");
        borzo.verify();

        // The orphan suspect's re-check finds the booking after all: its id is kept, a person is told, and it is due at once.
        database.db.update("UPDATE delivery_schema.provider_create_attempt SET next_check_at = now() WHERE provider_id = 'borzo'");
        borzo.reset();
        borzo.expect(requestTo(startsWith(BORZO + "/orders"))).andRespond(withSuccess(borzoOrder("available"), MediaType.APPLICATION_JSON));
        // The order is on Pidge, so the next tick reads the booking, cancels it and reads it again.
        borzoShows("available");
        borzo.expect(ExpectedCount.once(), requestTo(BORZO + "/cancel-order")).andExpect(jsonPath("$.order_id").value(1250032))
            .andRespond(withSuccess("{\"is_successful\":true,\"order\":{\"order_id\":1250032,\"status\":\"canceled\"}}", MediaType.APPLICATION_JSON));
        borzoShows("canceled");
        reconciliation.reconcilePending();
        assertThat(row("borzo")).containsEntry("state", "ORPHAN_SUSPECT").containsEntry("provider_ref", "1250032");
        assertThat(secondsUntil("borzo", "next_check_at")).isLessThanOrEqualTo(0);

        reconciliation.reconcilePending();
        assertThat(row("borzo")).containsEntry("state", "CANCELLED").containsEntry("provider_ref", "1250032");
        assertThat(row("borzo").get("next_check_at")).isNull();
        assertThat(jobProvider()).isEqualTo("pidge");
        borzo.verify();
    }

    @Test
    void aStrayBookingTheCourierWillNotCancelIsLeftToAPersonAfterOneTry() {
        pidgesTurn();
        assertThat(worker.process(message).providerId()).isEqualTo("pidge");
        Attempt stray = journal.begin(chefSubOrderId, "borzo").orElseThrow();
        journal.stray(chefSubOrderId, "borzo", stray.clientRef(), "1250032");
        borzoShows("available");
        borzo.expect(ExpectedCount.once(), requestTo(BORZO + "/cancel-order"))
            .andRespond(withStatus(HttpStatus.BAD_REQUEST).contentType(MediaType.APPLICATION_JSON)
                .body("{\"is_successful\":false,\"errors\":[\"order_cannot_be_canceled\"]}"));
        borzoShows("available");

        reconciliation.reconcilePending();
        reconciliation.reconcilePending();

        assertThat(row("borzo")).as("still on record as a booking nobody uses").containsEntry("state", "ORPHAN_SUSPECT")
            .containsEntry("provider_ref", "1250032");
        assertThat(row("borzo").get("next_check_at")).as("not tried again").isNull();
        borzo.verify();
    }

    @Test
    void aStrayBookingWhoseCourierHasTheFoodIsNotCancelled() {
        pidgesTurn();
        worker.process(message);
        Attempt stray = journal.begin(chefSubOrderId, "borzo").orElseThrow();
        journal.stray(chefSubOrderId, "borzo", stray.clientRef(), "1250032");
        borzoShows("active");

        reconciliation.reconcilePending();

        assertThat(row("borzo")).containsEntry("state", "ORPHAN_SUSPECT");
        assertThat(row("borzo").get("next_check_at")).isNull();
        borzo.verify();
    }

    @Test
    void aStrayBookingOfAnOrderWithNoJobBecomesItsJobUnlessSomethingHoldsTheCommand() {
        Attempt given = journal.begin(chefSubOrderId, "borzo").orElseThrow();
        journal.move(given, Set.of("INTENT"), "ORPHAN_SUSPECT", "no answer", null);
        journal.foundAt(given, "1250032");
        borzo.expect(ExpectedCount.times(3), requestTo(startsWith(BORZO + "/orders")))
            .andRespond(withSuccess(borzoOrder("available"), MediaType.APPLICATION_JSON));
        borzo.expect(ExpectedCount.times(3), requestTo(startsWith(BORZO + "/courier")))
            .andRespond(withSuccess("{\"is_successful\":true,\"courier\":null}", MediaType.APPLICATION_JSON));

        // A pass holds the command: it may be booking another courier, so nothing is decided.
        commands.claim(message.commandId(), 5, 3).orElseThrow();
        reconciliation.reconcilePending();
        assertThat(row("borzo")).containsEntry("state", "ORPHAN_SUSPECT");
        assertThat(secondsUntil("borzo", "next_check_at")).isBetween(295, 300);

        // The command is dead: nothing says the order still wants a courier, so a person decides.
        database.db.update("UPDATE delivery_schema.delivery_command SET status = 'DEAD_LETTER', processing_started_at = NULL");
        database.db.update("UPDATE delivery_schema.provider_create_attempt SET next_check_at = now()");
        reconciliation.reconcilePending();
        assertThat(row("borzo")).containsEntry("state", "ORPHAN_SUSPECT");
        assertThat(row("borzo").get("next_check_at")).isNull();
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isZero();

        // The command is waiting to book the next courier: this booking is the order's job instead.
        database.db.update("UPDATE delivery_schema.delivery_command SET status = 'WAITING_FOR_PROVIDER', next_provider_retry_at = now(), provider_wait_started_at = now()");
        database.db.update("UPDATE delivery_schema.provider_create_attempt SET next_check_at = now()");
        reconciliation.reconcilePending();
        assertThat(row("borzo")).containsEntry("state", "ADOPTED").containsEntry("provider_ref", "1250032");
        assertThat(jobProvider()).isEqualTo("borzo");
        assertThat(commandStatus()).isEqualTo("COMPLETED");
        assertThat(worker.process(message).duplicate()).as("the command's own message finds the job").isTrue();
        assertThat(pidge.references).as("nobody else was booked").isEmpty();
        borzo.verify();
    }

    @Test
    void aStrayBookingBorzoHasOnlyJustTakenIsAdoptedLikeAnyOther() {
        Attempt given = journal.begin(chefSubOrderId, "borzo").orElseThrow();
        journal.move(given, Set.of("INTENT"), "ORPHAN_SUSPECT", "no answer", null);
        journal.foundAt(given, "1250032");
        database.db.update("UPDATE delivery_schema.delivery_command SET status = 'WAITING_FOR_PROVIDER', next_provider_retry_at = now(), provider_wait_started_at = now()");
        borzoShows("new");

        reconciliation.reconcilePending();

        assertThat(row("borzo")).containsEntry("state", "ADOPTED").containsEntry("provider_ref", "1250032");
        assertThat(database.db.queryForMap("SELECT provider_id, status FROM delivery_schema.delivery_job"))
            .containsEntry("provider_id", "borzo").containsEntry("status", "PENDING");
        assertThat(commandStatus()).isEqualTo("COMPLETED");
        borzo.verify();
    }

    @Test
    void aStrayBookingIsNotMadeTheJobOfAnOrderCancelledMeanwhile() {
        Attempt given = journal.begin(chefSubOrderId, "pidge").orElseThrow();
        journal.move(given, Set.of("INTENT"), "ORPHAN_SUSPECT", "no answer", null);
        journal.foundAt(given, "PG-1");
        database.db.update("UPDATE delivery_schema.delivery_command SET status = 'WAITING_FOR_PROVIDER', next_provider_retry_at = now(), provider_wait_started_at = now()");
        RoutingResult found = router.recovered(given, pidge.delivery("PG-1"));
        // The cancel lands after the stray-booking check read the order as live: the command's status is still idle.
        commands.recordOrderCancelled(chefSubOrderId, "Customer cancelled", Instant.now());

        assertThat(completion.adoptStray(message, found)).isEmpty();

        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isZero();
        assertThat(row("pidge")).containsEntry("state", "ORPHAN_SUSPECT");
        assertThat(commandStatus()).isEqualTo("WAITING_FOR_PROVIDER");
    }

    @Test
    void adoptingAStrayBookingAndAPassClaimingTheCommandExcludeEachOther() throws Exception {
        database.db.update("UPDATE delivery_schema.delivery_command SET status = 'WAITING_FOR_PROVIDER', next_provider_retry_at = now(), provider_wait_started_at = now()");
        var transaction = new org.springframework.transaction.support.TransactionTemplate(database.transactions);
        ExecutorService other = Executors.newSingleThreadExecutor();
        try {
            var claim = transaction.execute(status -> {
                assertThat(commands.lockIdle(message.commandId())).isTrue();
                var waiting = other.submit(() -> commands.claim(message.commandId(), 5, 3));
                assertThatThrownBy(() -> waiting.get(300, java.util.concurrent.TimeUnit.MILLISECONDS)).as("the claim waits for the adoption")
                    .isInstanceOf(java.util.concurrent.TimeoutException.class);
                commands.markCompleted(message.commandId());
                return waiting;
            });
            assertThat(claim.get()).as("and then finds the command completed").isEmpty();

            database.db.update("UPDATE delivery_schema.delivery_command SET status = 'PROCESSING', processing_started_at = now()");
            assertThat(commands.lockIdle(message.commandId())).as("a pass holds the command: no adoption").isFalse();
        } finally {
            other.shutdownNow();
        }
    }

    /** A pass books just as its lease lapses and a second pass claims the command: one booking, and it becomes the job. */
    @Test
    void aPassThatLosesItsLeaseWhileBookingLosesNoBookingAndMakesNoSecondOne() {
        pidgesTurn();
        List<String> secondPass = new java.util.ArrayList<>();
        pidge.duringCreate = () -> {
            leaseAgeSeconds(181);
            secondPass.add(worker.process(message).providerId());
        };

        assertThatThrownBy(() -> worker.process(message)).isInstanceOf(DeliveryCommandTransientException.class)
            .hasMessageContaining("Another pass has taken over");

        assertThat(secondPass).as("the second pass books nobody: the first one's attempt is unresolved").containsExactly("RECONCILIATION_PENDING");
        assertThat(commandStatus()).isEqualTo("RECONCILIATION_PENDING");
        assertThat(row("pidge")).containsEntry("state", "INTENT");
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isZero();

        pidge.lookup = CreateReconciliationResult.found(pidge.delivery("PG-1"));
        look();

        assertThat(row("pidge")).containsEntry("state", "ADOPTED").containsEntry("provider_ref", "PG-1");
        assertThat(database.db.queryForList("SELECT provider_id, provider_delivery_id FROM delivery_schema.delivery_job"))
            .as("exactly one job, and it is the first pass's booking").containsExactly(Map.of("provider_id", "pidge", "provider_delivery_id", "PG-1"));
        assertThat(commandStatus()).isEqualTo("COMPLETED");
        assertThat(pidge.references).as("one booking call").hasSize(1);
        assertThat(journal.forOrder(chefSubOrderId)).as("one attempt").hasSize(1);
        assertThat(worker.process(message).duplicate()).as("the first pass's retry finds the job").isTrue();
    }

    @Test
    void theLastCouriersLostAnswerIsNeverGivenUpAndALateConfirmationIsAdopted() {
        database.db.update("UPDATE delivery_schema.delivery_command SET borzo_window_started_at = now() - INTERVAL '5 minutes'");
        pidge.create = Create.LOST;
        assertThat(worker.process(message).providerId()).isEqualTo("RECONCILIATION_PENDING");

        for (int look = 1; look <= 5; look++) {
            look();
        }
        assertThat(row("pidge")).as("Pidge is the only courier left: keep looking").containsEntry("state", "UNKNOWN");
        assertThat(commandStatus()).isEqualTo("RECONCILIATION_PENDING");
        verify(publisher, never()).publishNow(any(), any());

        pidge.lookup = CreateReconciliationResult.found(pidge.delivery("PG-LATE"));
        look();
        assertThat(row("pidge")).containsEntry("state", "ADOPTED").containsEntry("provider_ref", "PG-LATE");
        assertThat(jobProvider()).isEqualTo("pidge");
        assertThat(commandStatus()).isEqualTo("COMPLETED");
        assertThat(pidge.references).as("one booking call only").hasSize(1);
    }

    @Test
    void aMessageThatArrivesBeforeTheCommandIsMadeDueFinishesTheStepItself() {
        borzoLosesTheAnswer();
        worker.process(message);
        // The reconciliation worker resolved the booking and sent its message, and stopped before making the command due.
        Attempt lost = journal.forOrder(chefSubOrderId).get(0);
        journal.move(lost, Set.of("UNKNOWN"), "REJECTED", "not found", null);

        assertThatThrownBy(() -> worker.process(message)).isInstanceOf(DeliveryCommandTransientException.class)
            .hasMessageContaining("made due after reconciliation");
        assertThat(commandStatus()).isEqualTo("WAITING_FOR_PROVIDER");
        assertThat(worker.process(message).providerId()).isEqualTo("pidge");
    }

    @Test
    void aMessageThatCannotBeSentLeavesTheCommandForTheNextTickWithoutAskingTheCourierAgain() {
        borzoLosesTheAnswer();
        borzoHasNoSuchOrder();
        worker.process(message);
        doThrow(new IllegalStateException("Service Bus is down")).doNothing().when(publisher).publishNow(any(), any());

        look();
        assertThat(row("borzo")).containsEntry("state", "REJECTED");
        assertThat(commandStatus()).isEqualTo("RECONCILIATION_PENDING");
        assertThat(database.db.queryForObject("SELECT reconciliation_attempt_count FROM delivery_schema.delivery_command", Integer.class))
            .as("a failed send is not a look").isZero();

        look();
        verify(publisher, times(2)).publishNow(any(), any());
        assertThat(commandStatus()).isEqualTo("WAITING_FOR_PROVIDER");
        borzo.verify();
    }

    @Test
    void aWindowOpsOpensLaterLetsARefusedBorzoBeTriedAgainButNeverPastTheCap() {
        Instant window = Instant.now().minusSeconds(60);
        refuseBorzoBeforeTheWindow();
        borzoQuotes();
        borzo.expect(ExpectedCount.once(), requestTo(BORZO + "/create-order"))
            .andExpect(jsonPath("$.points[1].client_order_id").value(reference().substring(0, 26) + "2"))
            .andRespond(withSuccess("{\"is_successful\":true,\"order\":{\"order_id\":1250099,\"status\":\"available\"}}",
                MediaType.APPLICATION_JSON));
        assertThat(router.route(message, window).providerId()).as("a refusal from before this window does not close it").isEqualTo("borzo");
        borzo.verify();

        // Say that second booking was refused too, and a third: the cap.
        journal.move(journal.forOrder(chefSubOrderId).get(1), Set.of("INTENT"), "REJECTED", "refused", null);
        refuseBorzoBeforeTheWindow();
        assertThat(journal.forOrder(chefSubOrderId)).hasSize(3);
        assertThat(router.route(message, window).providerId()).as("three refusals: Borzo is used up, even in an open window")
            .isEqualTo("pidge");

        UUID other = UUID.randomUUID();
        journal.move(journal.begin(other, "pidge").orElseThrow(), Set.of("INTENT"), "ORPHAN_SUSPECT", null, null);
        DeliveryCommandMessage otherOrder = new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, other,
            message.readyAt(), message.dispatchAt(), other.toString(), 4.6, "Madhapur", 8, 4, message.deliveryRequest());
        assertThatThrownBy(() -> router.route(otherOrder, Instant.now().minusSeconds(300))).isInstanceOf(DeliveryRoutingException.class)
            .hasMessage("No courier may be booked again for this order");
        assertThat(router.anotherCourierBookable(other, "pidge")).isFalse();
        assertThat(router.anotherCourierBookable(other, "borzo")).isFalse();
        assertThat(router.anotherCourierBookable(chefSubOrderId, "borzo")).as("Pidge now holds this order's booking").isFalse();
    }

    /** The shared breaker (CRAVES_COURIER_BREAKER_ENABLED), each router with its own CourierBreaker standing for one replica. */
    @Test
    void threeBorzoBookingsAnsweredHttp500OnDifferentReplicasOpenTheBreakerOnEveryReplicaAndTheNextOrdersGoToPidge() {
        borzo.expect(ExpectedCount.times(3), requestTo(BORZO + "/calculate-order")).andRespond(withSuccess(QUOTE, MediaType.APPLICATION_JSON));
        borzo.expect(ExpectedCount.times(3), requestTo(BORZO + "/create-order")).andRespond(withServerError());
        DeliveryProviderRouter a = replica();
        DeliveryProviderRouter b = replica();

        for (DeliveryProviderRouter replica : List.of(a, b, a)) {
            assertThatThrownBy(() -> replica.route(order(), Instant.now())).isInstanceOf(DeliveryCreateReconciliationPendingException.class);
        }

        // Borzo's window is open for each of these orders, and Borzo is asked for nothing more.
        for (DeliveryProviderRouter replica : List.of(a, b, replica())) {
            RoutingResult booked = replica.route(order(), Instant.now());
            assertThat(booked.providerId()).isEqualTo("pidge");
            assertThat(booked.quoteAudit()).anySatisfy(audit -> {
                assertThat(audit.providerId()).isEqualTo("borzo");
                assertThat(audit.error()).isEqualTo("Courier breaker is open");
            });
        }
        borzo.verify();
        assertThat(database.db.queryForObject("SELECT booking_failures FROM delivery_schema.provider_breaker WHERE provider_id = 'borzo' "
            + "AND opened_at IS NOT NULL", Integer.class)).isEqualTo(3);
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.provider_breaker WHERE provider_id = 'pidge'", Integer.class))
            .as("a courier that has not failed has no row").isZero();
    }

    private DeliveryProviderRouter replica() {
        DeliveryProviderRouter replica = new DeliveryProviderRouter(List.of(borzoClient, pidge), catalog, intelligence, assignments, properties,
            quotes, Clock.systemUTC(), null);
        replica.setJournal(journal);
        replica.setCourierBreaker(new CourierBreaker(database.db, 3, 5, 30));
        return replica;
    }

    private DeliveryCommandMessage order() {
        UUID other = UUID.randomUUID();
        return new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, other, message.readyAt(),
            message.dispatchAt(), other.toString(), 4.6, "Madhapur", 8, 4, message.deliveryRequest());
    }

    /** R23's kill test: the courier answered and the pass died before it recorded the booking. */
    @Test
    void aPassThatDiesAfterBookingIsTakenOverAfterThreeMinutesAndItsBookingIsAdoptedWithoutASecondCall() {
        pidgesTurn();
        commands.claim(message.commandId(), 5, 3).orElseThrow();
        RoutingResult booked = router.route(message, Instant.now().minusSeconds(300));
        assertThat(row("pidge")).containsEntry("state", "INTENT");

        leaseAgeSeconds(170);
        assertThatThrownBy(() -> worker.process(message)).as("the lease still holds")
            .isInstanceOf(DeliveryCommandTransientException.class).hasMessageContaining("currently being processed");
        leaseAgeSeconds(181);
        assertThat(commands.claim(message.commandId(), 5)).as("with the journal off the lease is 10 minutes, as before").isEmpty();
        CommandRecord dead = commands.findById(message.commandId()).orElseThrow();

        assertThat(worker.process(message).providerId()).as("the pass that takes over books nobody: it looks first")
            .isEqualTo("RECONCILIATION_PENDING");
        assertThat(pidge.references).hasSize(1);
        assertThatThrownBy(() -> completion.complete(message, booked, dead.processingStartedAt()))
            .as("the first pass, had it only stalled, may no longer record its booking").isInstanceOf(StaleCommandLeaseException.class);
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isZero();

        pidge.lookup = CreateReconciliationResult.found(booked.delivery());
        look();
        assertThat(row("pidge")).containsEntry("state", "ADOPTED").containsEntry("provider_ref", "PG-1");
        assertThat(jobProvider()).isEqualTo("pidge");
        assertThat(commandStatus()).isEqualTo("COMPLETED");
        assertThat(pidge.references).as("one booking call only").hasSize(1);
        assertThat(database.db.queryForObject("SELECT jsonb_exists(quote_snapshot, 'clientReference') FROM delivery_schema.delivery_job",
            Boolean.class)).as("the job's stored routing is unchanged").isFalse();
    }

    @Test
    void aPassWhoseLeaseLapsedChangesNothingOnceAnotherPassHoldsTheCommand() {
        commands.claim(message.commandId(), 5, 3).orElseThrow();
        leaseAgeSeconds(181);
        Instant stale = commands.findById(message.commandId()).orElseThrow().processingStartedAt();
        Instant live = commands.claim(message.commandId(), 5, 3).orElseThrow().processingStartedAt();

        assertThat(commands.markProviderWait(message.commandId(), Instant.now(), "late", true, stale)).isFalse();
        assertThat(commands.markReconciliationPending(message.commandId(), "pidge", "ref", Instant.now(), "late",
            java.time.Duration.ZERO, stale)).isFalse();
        commands.markFailed(message.commandId(), "late", stale);
        commands.markDeadLetter(message.commandId(), "late", stale);
        assertThat(commandStatus()).isEqualTo("PROCESSING");
        assertThat(commands.lockLease(message.commandId(), stale)).isFalse();
        assertThat(commands.lockLease(message.commandId(), live)).isTrue();
        assertThat(commands.markProviderWait(message.commandId(), Instant.now(), "no quote", true, live)).isTrue();
    }

    @Test
    void aSupersededPassLeavesItsBookingToTheLookupOrKeepsItsIdWhenTheAttemptWasWrittenOff() {
        pidgesTurn();
        // Another pass takes the command over while this one's booking call is out.
        pidge.duringCreate = () -> database.db.update("UPDATE delivery_schema.delivery_command SET processing_started_at = now() + INTERVAL '1 second'");
        assertThatThrownBy(() -> worker.process(message)).isInstanceOf(DeliveryCommandTransientException.class)
            .hasMessageContaining("Another pass has taken over");
        assertThat(row("pidge")).as("still unresolved: the other pass looks it up and adopts it").containsEntry("state", "INTENT");
        assertThat(row("pidge").get("provider_ref")).isNull();
        assertThat(commandStatus()).isEqualTo("PROCESSING");
        assertThat(database.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_job", Integer.class)).isZero();

        // The same, and a lookup that ran while the call was out has already written the attempt off as not found.
        journal.move(journal.forOrder(chefSubOrderId).get(0), Set.of("INTENT"), "REJECTED", "not found", null);
        database.db.update("UPDATE delivery_schema.delivery_command SET processing_started_at = now() - INTERVAL '4 minutes'");
        pidge.duringCreate = () -> {
            database.db.update("UPDATE delivery_schema.delivery_command SET processing_started_at = now() + INTERVAL '1 second'");
            journal.move(journal.forOrder(chefSubOrderId).get(1), Set.of("INTENT"), "REJECTED", "not found", null);
        };
        assertThatThrownBy(() -> worker.process(message)).hasMessageContaining("Another pass has taken over");
        assertThat(row("pidge")).containsEntry("state", "REJECTED").containsEntry("provider_ref", "PG-2");
        assertThat(router.anotherCourierBookable(chefSubOrderId, "borzo")).as("Pidge holds a booking: never booked again for the order").isFalse();
    }

    @Test
    void aDuplicateMessageDoesNotGiveUpACommandWhoseLastPassIsStillRunning() {
        database.db.update("UPDATE delivery_schema.delivery_command SET status = 'PROCESSING', attempt_count = 5, processing_started_at = now()");
        assertThatThrownBy(() -> worker.process(message)).isInstanceOf(DeliveryCommandTransientException.class)
            .hasMessageContaining("currently being processed");
        assertThat(commandStatus()).isEqualTo("PROCESSING");

        leaseAgeSeconds(181);
        assertThatThrownBy(() -> worker.process(message)).isInstanceOf(DeliveryCommandNonRetryableException.class);
        assertThat(commandStatus()).isEqualTo("DEAD_LETTER");
    }

    /** Borzo's window is over: the timed policy books Pidge. */
    private void pidgesTurn() {
        database.db.update("UPDATE delivery_schema.delivery_command SET borzo_window_started_at = now() - INTERVAL '5 minutes'");
    }

    private void leaseAgeSeconds(int seconds) {
        database.db.update("UPDATE delivery_schema.delivery_command SET processing_started_at = now() - make_interval(secs => ?)", seconds);
    }

    private void refuseBorzoBeforeTheWindow() {
        journal.begin(chefSubOrderId, "borzo").ifPresent(attempt -> journal.move(attempt, Set.of("INTENT"), "REJECTED", "refused", null));
        database.db.update("UPDATE delivery_schema.provider_create_attempt SET created_at = now() - INTERVAL '10 minutes'");
    }

    private void borzoQuotes() {
        borzo.expect(ExpectedCount.manyTimes(), requestTo(BORZO + "/calculate-order")).andRespond(withSuccess(QUOTE, MediaType.APPLICATION_JSON));
    }

    private void borzoLosesTheAnswer() {
        borzoQuotes();
        borzo.expect(ExpectedCount.once(), requestTo(BORZO + "/create-order")).andExpect(
            org.springframework.test.web.client.match.MockRestRequestMatchers.method(HttpMethod.POST)).andRespond(request -> {
                throw new ResourceAccessException("Read timed out");
            });
    }

    /** MockRestServiceServer takes no new expectation once a request has been made, so each test scripts Borzo up front. */
    private void borzoHasNoSuchOrder() {
        borzo.expect(ExpectedCount.once(), requestTo(startsWith(BORZO + "/orders")))
            .andRespond(withSuccess("{\"is_successful\":true,\"orders_count\":0,\"orders\":[]}", MediaType.APPLICATION_JSON));
    }

    /** Borzo's order 1250032, booked under the Borzo attempt's reference, as its order list shows it. */
    private String borzoOrder(String status) {
        return "{\"is_successful\":true,\"orders_count\":1,\"orders\":[{\"order_id\":1250032,\"status\":\"" + status
            + "\",\"created_datetime\":\"" + java.time.OffsetDateTime.now() + "\",\"points\":[{},{\"client_order_id\":\""
            + row("borzo").get("client_ref") + "\"}]}]}";
    }

    /** One read of the booking by its id: the order, then its courier. */
    private void borzoShows(String status) {
        borzo.expect(ExpectedCount.once(), requestTo(startsWith(BORZO + "/orders?order_id=1250032")))
            .andRespond(withSuccess(borzoOrder(status), MediaType.APPLICATION_JSON));
        borzo.expect(ExpectedCount.once(), requestTo(startsWith(BORZO + "/courier?order_id=1250032")))
            .andRespond(withSuccess("{\"is_successful\":true,\"courier\":null}", MediaType.APPLICATION_JSON));
    }

    /** One reconciliation tick with the command's next look due now. */
    private void look() {
        database.db.update("UPDATE delivery_schema.delivery_command SET next_reconciliation_at = now() WHERE status = 'RECONCILIATION_PENDING'");
        reconciliation.reconcilePending();
    }

    private void due() {
        database.db.update("UPDATE delivery_schema.delivery_command SET next_provider_retry_at = now() WHERE status = 'WAITING_FOR_PROVIDER'");
    }

    private String reference() {
        return journal.forOrder(chefSubOrderId).stream().findFirst().map(Attempt::clientRef)
            .orElseGet(() -> pad(chefSubOrderId.getMostSignificantBits()) + pad(chefSubOrderId.getLeastSignificantBits()) + "1");
    }

    private static String pad(long half) {
        String digits = Long.toUnsignedString(half, 36);
        return "0".repeat(13 - digits.length()) + digits;
    }

    private Map<String, Object> row(String provider) {
        return database.db.queryForMap("SELECT state, client_ref, provider_ref, error, next_check_at FROM delivery_schema.provider_create_attempt "
            + "WHERE chef_sub_order_id = ? AND provider_id = ? ORDER BY attempt_no DESC LIMIT 1", chefSubOrderId, provider);
    }

    private Integer secondsUntil(String provider, String column) {
        return database.db.queryForObject("SELECT CAST(ceil(extract(epoch FROM " + column + " - now())) AS integer) FROM "
            + "delivery_schema.provider_create_attempt WHERE chef_sub_order_id = ? AND provider_id = ?", Integer.class, chefSubOrderId, provider);
    }

    private Integer secondsUntilCommand(String column) {
        return database.db.queryForObject("SELECT CAST(ceil(extract(epoch FROM " + column + " - now())) AS integer) FROM "
            + "delivery_schema.delivery_command WHERE chef_sub_order_id = ?", Integer.class, chefSubOrderId);
    }

    private String commandStatus() {
        return database.db.queryForObject("SELECT status FROM delivery_schema.delivery_command WHERE chef_sub_order_id = ?", String.class,
            chefSubOrderId);
    }

    private Integer commandAttempts() {
        return database.db.queryForObject("SELECT attempt_count FROM delivery_schema.delivery_command WHERE chef_sub_order_id = ?",
            Integer.class, chefSubOrderId);
    }

    private String jobProvider() {
        return database.db.queryForObject("SELECT provider_id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?", String.class,
            chefSubOrderId);
    }

    /** The router stores its assignment before it books; the delivery job then references it. */
    private AssignmentResponse assignment() {
        UUID id = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_assignment (id, chef_sub_order_id, order_id, strategy, status, scoring_version, "
            + "request_context) VALUES (?, ?, ?, 'STOCHASTIC', 'RANKED', 'TEST', '{}')", id, chefSubOrderId, orderId);
        UUID borzoCandidate = UUID.randomUUID();
        return new AssignmentResponse(id, chefSubOrderId, orderId, AssignmentStrategy.STOCHASTIC, AssignmentStatus.RANKED, "TEST",
            borzoCandidate, "borzo", null, List.of(candidate(borzoCandidate, 1, "borzo", CandidateStatus.SELECTED),
                candidate(UUID.randomUUID(), 2, "pidge", CandidateStatus.SKIPPED)), Instant.now());
    }

    private CandidateScore candidate(UUID id, int rank, String provider, CandidateStatus status) {
        return new CandidateScore(id, rank, provider, provider + "-quote", null, null, 7.0, new BigDecimal("100.00"), "INR", 0.9, 90.0, 90.0,
            90.0, Momentum.STABLE, 0.5, 90.0, 80.0, 85.0, status, json.createObjectNode());
    }

    enum Create { BOOKS, LOST }

    /** Pidge as the router sees it: always quotes; books, or loses the answer; found only when the test says so. */
    final class StubPidge implements DeliveryProviderAdapter {
        final List<String> references = new java.util.ArrayList<>();
        int quoteCalls;
        Create create = Create.BOOKS;
        Runnable duringCreate = () -> { };
        CreateReconciliationResult lookup = CreateReconciliationResult.inconclusive("No Pidge callback names this booking yet");

        @Override
        public String providerId() {
            return "pidge";
        }

        @Override
        public ProviderQuote quote(QuoteRequest request) {
            quoteCalls++;
            return new ProviderQuote("pidge", true, new BigDecimal("90.00"), new BigDecimal("90.00"), "INR", List.of(),
                json.createObjectNode().put("quote_id", "pidge-quote"), Instant.now());
        }

        @Override
        public ProviderDelivery create(CreateDeliveryRequest request) {
            references.add(request.clientReference());
            duringCreate.run();
            if (create == Create.LOST) {
                throw new ProviderCreateUncertainException("pidge", request.clientReference(), Instant.now(), new RuntimeException("timeout"));
            }
            return delivery("PG-" + references.size());
        }

        ProviderDelivery delivery(String id) {
            return new ProviderDelivery("pidge", id, id, DeliveryStatus.SEARCHING, "FULFILLED", new BigDecimal("90.00"),
                new BigDecimal("90.00"), null, json.createObjectNode(), Instant.now());
        }

        @Override
        public CreateReconciliationResult reconcileCreate(String clientReference, Instant notBefore) {
            return lookup;
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
