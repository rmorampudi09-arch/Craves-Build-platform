package in.craves.subscription.lifecycle;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.subscription.capacity.CapacityProperties;
import in.craves.subscription.capacity.CapacityRepository;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.config.JdbcInstantConfiguration;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.occurrence.OccurrenceRepository;
import in.craves.subscription.occurrence.OccurrenceRepository.ClaimedSubscription;
import in.craves.subscription.order.OccurrenceOrderRepository;
import in.craves.subscription.order.OccurrenceOrderRepository.OccurrenceClaim;
import in.craves.subscription.policy.SubscriptionPolicyRepository;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.schedule.PlanCatalogClient;
import in.craves.subscription.schedule.PlanScheduleRepository;
import in.craves.subscription.security.CurrentUser;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import org.aopalliance.intercept.MethodInterceptor;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Real PostgreSQL coverage. Never point this destructive harness at an application database. */
@EnabledIfEnvironmentVariable(named = "SUBSCRIPTION_TEST_JDBC_URL", matches = ".+")
@ResourceLock("disposable-subscription-migration-schema")
@Timeout(30)
class SubscriptionLifecycleCutoffDatabaseTest {
    private static final Instant NOW = Instant.parse("2026-10-09T06:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 9);
    private final UUID plan = UUID.randomUUID();
    private final UUID subscription = UUID.randomUUID();
    private final UUID customer = UUID.randomUUID();
    private final UUID chef = UUID.randomUUID();
    private final UUID address = UUID.randomUUID();
    private final UUID menuItem = UUID.randomUUID();
    private final UUID generationToken = UUID.randomUUID();
    private JdbcTemplate db;
    private AnnotationConfigApplicationContext jdbcContext;
    private DataSourceTransactionManager transactions;
    private SubscriptionLifecycleRepository lifecycle;
    private CapacityRepository capacityRepository;
    private CapacityService capacity;
    private OccurrenceRepository generator;
    private OccurrenceOrderRepository dispatch;
    private SubscriptionLifecycleService service;
    private CurrentUser user;

    @BeforeEach
    void setUp() {
        assertTrue("true".equals(System.getenv("GITHUB_ACTIONS")) || "True".equals(System.getenv("TF_BUILD"))
            || "YES_LOCAL_DISPOSABLE_SUBSCRIPTION_ONLY".equals(System.getenv("CRAVES_LOCAL_DISPOSABLE_PARITY")),
            "Only CI or explicitly acknowledged local disposable parity may run");
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url = System.getenv("SUBSCRIPTION_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var dataSource = new DriverManagerDataSource(url, System.getenv("SUBSCRIPTION_TEST_DB_USER"),
            System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        jdbcContext = new AnnotationConfigApplicationContext();
        jdbcContext.registerBean(javax.sql.DataSource.class, () -> dataSource);
        jdbcContext.register(JdbcInstantConfiguration.class);
        jdbcContext.refresh();
        db = jdbcContext.getBean(JdbcTemplate.class);
        transactions = new DataSourceTransactionManager(dataSource);
        assertEquals("subscription_schema_test", db.queryForObject("SELECT current_database()", String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");
        db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(dataSource).defaultSchema("public")
            .table("subscription_service_flyway_schema_history").locations("classpath:db/migration").load().migrate();
        db.update("INSERT INTO subscription_schema.subscription_plan " +
            "(id, plan_code, chef_identity_id, name, billing_period, amount) VALUES (?, ?, ?, 'Cutoff test', 'MONTHLY', 300)",
            plan, "CUTOFF-" + plan, chef);
        db.update("INSERT INTO subscription_schema.customer_subscription " +
            "(id, customer_identity_id, plan_id, chef_identity_id, delivery_address_id, status, start_date, " +
            "next_service_date, generation_lock_token, generation_locked_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, now())",
            subscription, customer, plan, chef, address, TODAY, TODAY.plusDays(7), generationToken);
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule " +
            "(plan_id, recurrence_type, timezone, service_time, generation_lead_hours, status, created_by_identity_id, activated_at) " +
            "VALUES (?, 'WEEKLY', 'Asia/Kolkata', '12:30', 24, 'ACTIVE', ?, now())", plan, chef);
        db.update("INSERT INTO subscription_schema.subscription_plan_policy " +
            "(id, plan_id, version, status, customer_pause_enabled, customer_resume_enabled, customer_cancel_enabled, " +
            "customer_skip_enabled, pause_cutoff_minutes, resume_lead_minutes, cancel_cutoff_minutes, skip_cutoff_minutes, " +
            "created_by_identity_id, activated_at) VALUES (?, ?, 1, 'ACTIVE', true, true, true, true, 60, 60, 60, 60, ?, now())",
            UUID.randomUUID(), plan, chef);
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule_item " +
            "(id, plan_id, menu_item_id, quantity, iso_day_of_week, sequence_number, meal_slot_code, service_time) " +
            "VALUES (?, ?, ?, 1, ?, 1, 'LUNCH', '12:30')", UUID.randomUUID(), plan, menuItem, TODAY.getDayOfWeek().getValue());
        capacityRepository = new CapacityRepository(db);
        capacityRepository.insertEntitlement(subscription, chef, "WEEKLY", TODAY.getDayOfWeek().getValue(), null,
            "LUNCH", menuItem, 1, "COMMITTED", null);
        capacityRepository.upsertAllocation(subscription, chef, TODAY, "LUNCH", menuItem, 1, "COMMITTED", null);
        capacityRepository.upsertAllocation(subscription, chef, TODAY.plusDays(7), "LUNCH", menuItem, 1, "COMMITTED", null);
        var subscriptions = new SubscriptionRepository(db);
        capacity = transactional(new CapacityService(capacityRepository, new PlanScheduleRepository(db),
            mock(PlanCatalogClient.class), subscriptions, new CapacityProperties(), new ObjectMapper()));
        lifecycle = transactional(new SubscriptionLifecycleRepository(db));
        generator = transactional(new OccurrenceRepository(db));
        dispatch = transactional(new OccurrenceOrderRepository(db));
        service = lifecycleService(NOW);
        user = new CurrentUser(customer, "test-customer", null, List.of("CUSTOMER"));
    }

    @AfterEach
    void closeContext() {
        if (jdbcContext != null) jdbcContext.close();
    }

    static Stream<Arguments> generationBoundaryCases() {
        return Stream.of("pause", "cancel").flatMap(action ->
            Stream.of(-1000L, 0L, 1000L).map(nanos -> Arguments.of(action, nanos)));
    }

    @ParameterizedTest(name = "generated {0}: service time offset from cutoff {1}ns")
    @MethodSource("generationBoundaryCases")
    void generatedOccurrenceBeforeAdvancedCursorRespectsStoredCutoff(String action, long nanos) {
        // Use the real repository transaction boundaries: claim, insert, then cursor advance.
        ClaimedSubscription claim = generationClaim(TODAY);
        UUID generated = generate(generator, claim, NOW.plusSeconds(3600).plusNanos(nanos));
        generator.releaseAndAdvance(claim, TODAY.plusDays(7));
        assertEquals("BILLING_PENDING", occurrenceStatus(generated));
        assertEquals(TODAY.plusDays(7), cursor());
        assertEquals("MATERIALIZED", allocationStatus(TODAY));
        if (nanos <= 0) {
            assertCutoffAndUnchanged(action);
        } else {
            act(action);
            assertTransitionAndCapacity(action);
            assertEquals("CANCELLED", occurrenceStatus(generated));
            assertEquals(2, count("subscription_occurrence_history"));
            assertEquals(1, historyCount(generated, "BILLING_PENDING"));
            assertEquals(1, historyCount(generated, "CANCELLED"));
            assertEquals("CUSTOMER_" + action.toUpperCase(java.util.Locale.ROOT), db.queryForObject(
                "SELECT source FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id = ? AND new_status = 'CANCELLED'",
                String.class, generated));
        }
    }

    static Stream<Arguments> cutoffCases() {
        return Stream.of("pause", "cancel").flatMap(action ->
            Stream.of("BILLING_PENDING", "PAYMENT_PENDING", "READY_FOR_ORDER").flatMap(status ->
                // PostgreSQL stores microsecond precision; one microsecond before the deadline is allowed.
                Stream.of(-1000L, 0L, 1000L).map(nanos -> Arguments.of(action, status, nanos))));
    }

    @ParameterizedTest(name = "{0}: {1}, service time offset from cutoff {2}ns")
    @MethodSource("cutoffCases")
    void allCancellableStatusesRespectStoredTimestampBoundary(String action, String status, long nanos) {
        UUID affected = occurrence(status, "LUNCH", NOW.plusSeconds(3600).plusNanos(nanos));
        if (nanos <= 0) {
            assertCutoffAndUnchanged(action);
        } else {
            act(action);
            assertAccepted(action, List.of(affected));
            assertEquals(status, db.queryForObject("SELECT old_status FROM subscription_schema.subscription_occurrence_history " +
                "WHERE occurrence_id = ?", String.class, affected));
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void oneProtectedSlotRejectsEntireMixedOccurrenceSet(String action) {
        occurrence("READY_FOR_ORDER", "DINNER", NOW.plusSeconds(10 * 3600));
        occurrence("PAYMENT_PENDING", "LUNCH", NOW.plusSeconds(3600));
        occurrence("BILLING_PENDING", "BREAKFAST", NOW.plusSeconds(24 * 3600));
        occurrence("ORDER_REQUESTED", "LEGACY", NOW.minusSeconds(3600));
        assertCutoffAndUnchanged(action);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void progressedAndTerminalOccurrencesAreNotAffectedOrCutoffBlockers(String action) {
        List<UUID> unaffected = Stream.of("ORDER_REQUESTED", "ORDER_CREATED", "SKIPPED", "CANCELLED", "FAILED")
            .map(status -> occurrence(status, status, NOW.minusSeconds(3600))).toList();
        var before = occurrenceRows(unaffected);
        UUID future = occurrence("READY_FOR_ORDER", "LUNCH", NOW.plusSeconds(2 * 3600));
        act(action);
        assertAccepted(action, List.of(future));
        assertEquals(before, occurrenceRows(unaffected));
        assertEquals(0, db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_occurrence_history " +
            "WHERE occurrence_id <> ?", Integer.class, future));
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void generatedTimestampWinsOverEditedScheduleForAffectedMeal(String action) {
        occurrence("READY_FOR_ORDER", "LUNCH", NOW.plusSeconds(3600));
        db.update("UPDATE subscription_schema.subscription_plan_schedule SET service_time = '23:00', timezone = 'UTC' WHERE plan_id = ?", plan);
        assertCutoffAndUnchanged(action);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void storedPastOccurrenceIsProtectedDespiteFarFutureCursor(String action) {
        occurrence("BILLING_PENDING", "LUNCH", NOW.minusSeconds(1));
        assertCutoffAndUnchanged(action);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void zeroMinuteCutoffStillRejectsAtServiceTime(String action) {
        db.update("UPDATE subscription_schema.subscription_plan_policy SET pause_cutoff_minutes = 0, cancel_cutoff_minutes = 0 WHERE plan_id = ?", plan);
        occurrence("PAYMENT_PENDING", "LUNCH", NOW);
        assertCutoffAndUnchanged(action);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void noAffectedRowsKeepExistingActiveCursorScheduleFallback(String action) {
        db.update("UPDATE subscription_schema.customer_subscription SET next_service_date = ? WHERE id = ?", TODAY, subscription);
        assertCutoffAndUnchanged(action); // 12:30 IST = 07:00 UTC; the 60-minute deadline is NOW.
        service = lifecycleService(NOW.minusNanos(1000));
        act(action);
        assertAccepted(action, List.of());
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void activeMissingCursorStillFailsClosed(String action) {
        occurrence("READY_FOR_ORDER", "LUNCH", NOW.plusSeconds(7200));
        db.update("UPDATE subscription_schema.customer_subscription SET next_service_date = NULL WHERE id = ?", subscription);
        assertErrorAndUnchanged(action, "NEXT_SERVICE_DATE_MISSING");
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void activeMissingScheduleStillFailsClosed(String action) {
        occurrence("READY_FOR_ORDER", "LUNCH", NOW.plusSeconds(7200));
        db.update("UPDATE subscription_schema.subscription_plan_schedule SET status = 'INACTIVE' WHERE plan_id = ?", plan);
        assertErrorAndUnchanged(action, "SUBSCRIPTION_SCHEDULE_NOT_ACTIVE");
    }

    @ParameterizedTest
    @ValueSource(strings = {"BILLING_PENDING", "PAYMENT_PENDING", "READY_FOR_ORDER"})
    void pausedCancelChecksResidualCancellableRowsEvenWithoutCursorOrSchedule(String status) {
        makePausedWithoutSchedule();
        occurrence(status, "LUNCH", NOW.plusSeconds(3600));
        assertCutoffAndUnchanged("cancel");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void pausedCancelRemainsAllowedWithNoRowsOrOnlyRowsOutsideCutoff(boolean withFutureRow) {
        makePausedWithoutSchedule();
        List<UUID> affected = withFutureRow ? List.of(occurrence("READY_FOR_ORDER", "LUNCH", NOW.plusSeconds(7200))) : List.of();
        act("cancel");
        assertAccepted("cancel", affected);
        assertEquals("PAUSED", db.queryForObject("SELECT old_status FROM subscription_schema.subscription_status_history", String.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void capacityFailureRollsBackActualStatusHistoriesClaimsAndCapacity(String action) {
        occurrence("READY_FOR_ORDER", "LUNCH", NOW.plusSeconds(7200));
        var before = snapshot();
        var failingCapacity = transactional(new CapacityService(capacityRepository, new PlanScheduleRepository(db),
            mock(PlanCatalogClient.class), new SubscriptionRepository(db), new CapacityProperties(), new ObjectMapper()),
            invocation -> {
                Object result = invocation.proceed();
                if (invocation.getMethod().getName().equals("releaseForPauseOrTerminal")) {
                    assertEquals("RELEASED", allocationStatus(TODAY));
                    throw new IllegalStateException("Simulated failure after real capacity release");
                }
                return result;
            });
        service = transactional(new SubscriptionLifecycleService(lifecycle, new SubscriptionPolicyRepository(db),
            new SubscriptionRepository(db), failingCapacity, Clock.fixed(NOW, ZoneOffset.UTC)));
        assertEquals("Simulated failure after real capacity release",
            assertThrows(IllegalStateException.class, () -> act(action)).getMessage());
        assertEquals(before, snapshot(), "The Spring service transaction must roll back all nested repository work");
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void lockedProtectedRowIsWaitedForAndNeverSkipped(String action) throws Exception {
        UUID protectedRow = occurrence("READY_FOR_ORDER", "LUNCH", NOW.plusSeconds(3600));
        occurrence("BILLING_PENDING", "DINNER", NOW.plusSeconds(7200));
        var before = snapshot();
        try (Race race = new Race()) {
            Future<?> locker = race.threads.submit(() -> {
                // Hold only an occurrence row, exactly the lock a dispatch transaction takes.
                var transaction = new org.springframework.transaction.support.TransactionTemplate(transactions);
                transaction.executeWithoutResult(status -> {
                    db.queryForObject("SELECT id FROM subscription_schema.subscription_occurrence WHERE id = ? FOR UPDATE", UUID.class, protectedRow);
                    race.winner.hold();
                });
            });
            race.winner.awaitEntered();
            service = observedService(race.contender);
            Future<?> customerRequest = race.threads.submit(() -> assertCutoffAndUnchanged(action));
            race.assertBlocked();
            race.winner.release();
            locker.get(10, TimeUnit.SECONDS);
            customerRequest.get(10, TimeUnit.SECONDS);
        }
        assertEquals(before, snapshot());
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void generatorCommitsFirstAndCustomerObservesGeneratedProtectedRow(String action) throws Exception {
        ClaimedSubscription claim = generationClaim(TODAY);
        var beforeCapacity = capacityRows();
        try (Race race = new Race()) {
            OccurrenceRepository blockedGenerator = transactional(new OccurrenceRepository(db), afterMethod("createOccurrence", race.winner));
            Future<UUID> generation = race.threads.submit(() -> generate(blockedGenerator, claim, NOW.plusSeconds(3600)));
            race.winner.awaitEntered();
            service = observedService(race.contender);
            Future<?> customerRequest = race.threads.submit(() -> {
                ApiException failure = assertThrows(ApiException.class, () -> act(action));
                assertEquals(cutoffCode(action), failure.getCode());
            });
            race.assertBlocked();
            race.winner.release();
            UUID generated = generation.get(10, TimeUnit.SECONDS);
            customerRequest.get(10, TimeUnit.SECONDS);
            // The production generator advances in its separate statement after insertion commits.
            generator.releaseAndAdvance(claim, TODAY.plusDays(7));
            assertEquals("BILLING_PENDING", occurrenceStatus(generated));
            assertEquals(1, count("subscription_occurrence_history"));
            assertEquals("SCHEDULER", db.queryForObject("SELECT source FROM subscription_schema.subscription_occurrence_history", String.class));
        }
        assertEquals("ACTIVE", subscriptionStatus());
        assertEquals(TODAY.plusDays(7), cursor());
        assertEquals(0, count("subscription_status_history"));
        assertEquals(0, count("capacity_audit"));
        assertEquals("COMMITTED", entitlementStatus());
        assertEquals("MATERIALIZED", allocationStatus(TODAY));
        assertEquals("COMMITTED", allocationStatus(TODAY.plusDays(7)));
        assertEquals(beforeCapacity.getFirst(), capacityRows().getFirst(), "Generation cannot release recurring entitlement");
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void customerCommitsFirstAndStaleGeneratorCannotInsertOrAdvanceCursor(String action) throws Exception {
        ClaimedSubscription claim = generationClaim(TODAY.plusDays(7));
        try (Race race = new Race()) {
            service = transactional(serviceTarget(NOW), afterMethod(action, race.winner));
            Future<?> customerRequest = race.threads.submit(() -> act(action));
            race.winner.awaitEntered();
            OccurrenceRepository observedGenerator = transactional(new OccurrenceRepository(db), beforeMethod("createOccurrence", race.contender));
            Future<?> generation = race.threads.submit(() -> {
                IllegalStateException failure = assertThrows(IllegalStateException.class,
                    () -> generate(observedGenerator, claim, NOW.plusSeconds(7 * 24 * 3600 + 3600)));
                assertEquals("Subscription generation claim was lost", failure.getMessage());
            });
            race.assertBlocked();
            race.winner.release();
            customerRequest.get(10, TimeUnit.SECONDS);
            generation.get(10, TimeUnit.SECONDS);
        }
        var afterLifecycle = snapshot();
        assertEquals("Subscription generation claim was lost",
            assertThrows(IllegalStateException.class, () -> generator.releaseAndAdvance(claim, TODAY.plusDays(14))).getMessage());
        generator.releaseAfterFailure(claim);
        assertEquals(afterLifecycle, snapshot());
        assertAccepted(action, List.of());
        assertEquals(0, count("subscription_occurrence"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void dispatchCommitsFirstAndCustomerPreservesRequestedOccurrence(String action) throws Exception {
        UUID requested = occurrence("READY_FOR_ORDER", "LUNCH", NOW.plusSeconds(3600));
        OccurrenceClaim claim = dispatchClaim(requested);
        UUID cancellable = occurrence("PAYMENT_PENDING", "DINNER", NOW.plusSeconds(7200));
        try (Race race = new Race()) {
            OccurrenceOrderRepository blockedDispatch = transactional(new OccurrenceOrderRepository(db), afterMethod("createRequest", race.winner));
            Future<Boolean> request = race.threads.submit(() -> blockedDispatch.createRequest(claim, UUID.randomUUID(), new ObjectMapper().createObjectNode()));
            race.winner.awaitEntered();
            service = observedService(race.contender);
            Future<?> customerRequest = race.threads.submit(() -> act(action));
            race.assertBlocked();
            race.winner.release();
            assertTrue(request.get(10, TimeUnit.SECONDS));
            customerRequest.get(10, TimeUnit.SECONDS);
        }
        assertEquals("ORDER_REQUESTED", occurrenceStatus(requested));
        assertEquals("CANCELLED", occurrenceStatus(cancellable));
        assertEquals(1, count("subscription_order_request_outbox"));
        assertEquals(1, historyCount(requested, "ORDER_REQUESTED"));
        assertEquals(0, historyCount(requested, "CANCELLED"));
        assertEquals(1, historyCount(cancellable, "CANCELLED"));
        assertTransitionAndCapacity(action);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void customerCommitsFirstAndStaleDispatchCannotCreateHistoryOrOutbox(String action) throws Exception {
        UUID cancelled = occurrence("READY_FOR_ORDER", "LUNCH", NOW.plusSeconds(7200));
        OccurrenceClaim claim = dispatchClaim(cancelled);
        try (Race race = new Race()) {
            service = transactional(serviceTarget(NOW), afterMethod(action, race.winner));
            Future<?> customerRequest = race.threads.submit(() -> act(action));
            race.winner.awaitEntered();
            OccurrenceOrderRepository observedDispatch = transactional(new OccurrenceOrderRepository(db), beforeMethod("createRequest", race.contender));
            Future<Boolean> request = race.threads.submit(() -> observedDispatch.createRequest(claim, UUID.randomUUID(), new ObjectMapper().createObjectNode()));
            race.assertBlocked();
            race.winner.release();
            customerRequest.get(10, TimeUnit.SECONDS);
            assertFalse(request.get(10, TimeUnit.SECONDS));
        }
        var afterLifecycle = snapshot();
        dispatch.releaseClaim(claim);
        assertEquals(afterLifecycle, snapshot());
        assertAccepted(action, List.of(cancelled));
        assertEquals(0, count("subscription_order_request_outbox"));
    }

    private UUID occurrence(String status, String slot, Instant serviceAt) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_occurrence " +
            "(id, subscription_id, plan_id, customer_identity_id, chef_identity_id, delivery_address_id, service_date, " +
            "meal_slot_code, service_at, schedule_version, status, order_dispatch_lock_token, order_dispatch_locked_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, now())", id, subscription, plan, customer, chef, address,
            serviceAt.atZone(ZoneOffset.UTC).toLocalDate(), slot, Timestamp.from(serviceAt), status, UUID.randomUUID());
        db.update("INSERT INTO subscription_schema.subscription_occurrence_item " +
            "(id, occurrence_id, menu_item_id, quantity, sequence_number) VALUES (?, ?, ?, 1, 1)", UUID.randomUUID(), id, menuItem);
        return id;
    }

    private ClaimedSubscription generationClaim(LocalDate date) {
        db.update("UPDATE subscription_schema.customer_subscription SET next_service_date = ?, generation_lock_token = NULL, " +
            "generation_locked_at = NULL WHERE id = ?", date, subscription);
        // A wide horizon keeps this fixed-clock fixture independent of the machine's calendar date.
        return generator.claimDue(36500, 10, 10).getFirst();
    }

    private UUID generate(OccurrenceRepository repository, ClaimedSubscription claim, Instant serviceAt) {
        var schedule = repository.findActiveSchedule(plan).orElseThrow();
        return repository.createOccurrence(claim, schedule, claim.serviceDate(), "LUNCH", serviceAt, schedule.items(), null);
    }

    private OccurrenceClaim dispatchClaim(UUID occurrenceId) {
        db.update("UPDATE subscription_schema.subscription_occurrence SET order_dispatch_lock_token = NULL, " +
            "order_dispatch_locked_at = NULL WHERE id = ?", occurrenceId);
        return dispatch.claimReady(36500 * 24, 10, 10).stream()
            .filter(claim -> claim.occurrenceId().equals(occurrenceId)).findFirst().orElseThrow();
    }

    private void makePausedWithoutSchedule() {
        db.update("UPDATE subscription_schema.customer_subscription SET status = 'PAUSED', next_service_date = NULL WHERE id = ?", subscription);
        db.update("UPDATE subscription_schema.subscription_plan_schedule SET status = 'INACTIVE' WHERE plan_id = ?", plan);
    }

    private SubscriptionLifecycleService serviceTarget(Instant now) {
        return new SubscriptionLifecycleService(lifecycle, new SubscriptionPolicyRepository(db), new SubscriptionRepository(db),
            capacity, Clock.fixed(now, ZoneOffset.UTC));
    }

    private SubscriptionLifecycleService lifecycleService(Instant now) {
        return transactional(serviceTarget(now));
    }

    private SubscriptionLifecycleService observedService(CompletableFuture<Integer> entered) {
        return transactional(serviceTarget(NOW), invocation -> {
            entered.complete(db.queryForObject("SELECT pg_backend_pid()", Integer.class));
            return invocation.proceed();
        });
    }

    private <T> T transactional(T target, MethodInterceptor... interceptors) {
        ProxyFactory factory = new ProxyFactory(target);
        factory.setProxyTargetClass(true);
        // Real annotations drive each boundary, including nontransactional cursor advancement.
        var advice = new TransactionInterceptor();
        advice.setTransactionManager(transactions);
        advice.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        factory.addAdvice(advice);
        for (MethodInterceptor interceptor : interceptors) factory.addAdvice(interceptor);
        @SuppressWarnings("unchecked") T result = (T) factory.getProxy();
        return result;
    }

    private MethodInterceptor afterMethod(String name, Gate gate) {
        return invocation -> {
            Object result = invocation.proceed();
            if (invocation.getMethod().getName().equals(name)) gate.hold();
            return result;
        };
    }

    private MethodInterceptor beforeMethod(String name, CompletableFuture<Integer> entered) {
        return invocation -> {
            if (invocation.getMethod().getName().equals(name)) entered.complete(db.queryForObject("SELECT pg_backend_pid()", Integer.class));
            return invocation.proceed();
        };
    }

    private void act(String action) {
        if ("pause".equals(action)) service.pause(subscription, "Customer test", user);
        else service.cancel(subscription, "Customer test", user);
    }

    private String cutoffCode(String action) {
        return "SUBSCRIPTION_" + action.toUpperCase(java.util.Locale.ROOT) + "_CUTOFF";
    }

    private void assertCutoffAndUnchanged(String action) {
        assertErrorAndUnchanged(action, cutoffCode(action));
    }

    private void assertErrorAndUnchanged(String action, String code) {
        var before = snapshot();
        ApiException exception = assertThrows(ApiException.class, () -> act(action));
        assertEquals(409, exception.getStatus());
        assertEquals(code, exception.getCode());
        assertEquals(before, snapshot(), "A rejected lifecycle request must preserve status, cursor, claims, histories, capacity and outboxes");
    }

    private void assertAccepted(String action, List<UUID> affected) {
        assertTransitionAndCapacity(action);
        assertEquals(affected.size(), count("subscription_occurrence_history"));
        for (UUID id : affected) {
            assertEquals("CANCELLED", occurrenceStatus(id));
            assertNull(db.queryForObject("SELECT order_dispatch_lock_token FROM subscription_schema.subscription_occurrence WHERE id = ?", UUID.class, id));
            assertNull(db.queryForObject("SELECT order_dispatch_locked_at FROM subscription_schema.subscription_occurrence WHERE id = ?", Timestamp.class, id));
            assertEquals(1, historyCount(id, "CANCELLED"));
            assertEquals("CUSTOMER_" + action.toUpperCase(java.util.Locale.ROOT), db.queryForObject(
                "SELECT source FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id = ?", String.class, id));
            assertEquals(customer, db.queryForObject("SELECT actor_identity_id FROM subscription_schema.subscription_occurrence_history " +
                "WHERE occurrence_id = ?", UUID.class, id));
        }
    }

    private void assertTransitionAndCapacity(String action) {
        assertEquals("pause".equals(action) ? "PAUSED" : "CANCELLED", subscriptionStatus());
        if ("cancel".equals(action)) assertNull(cursor());
        assertNull(db.queryForObject("SELECT generation_lock_token FROM subscription_schema.customer_subscription WHERE id = ?", UUID.class, subscription));
        assertNull(db.queryForObject("SELECT generation_locked_at FROM subscription_schema.customer_subscription WHERE id = ?", Timestamp.class, subscription));
        assertEquals(1, count("subscription_status_history"));
        assertEquals(customer, db.queryForObject("SELECT actor_identity_id FROM subscription_schema.subscription_status_history", UUID.class));
        assertEquals("Customer test", db.queryForObject("SELECT reason FROM subscription_schema.subscription_status_history", String.class));
        assertEquals("RELEASED", entitlementStatus());
        assertEquals("RELEASED", allocationStatus(TODAY));
        assertEquals("RELEASED", allocationStatus(TODAY.plusDays(7)));
        assertEquals(1, count("capacity_audit"));
    }

    private int historyCount(UUID id, String status) {
        return db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id = ? AND new_status = ?",
            Integer.class, id, status);
    }

    private int count(String table) {
        return db.queryForObject("SELECT count(*) FROM subscription_schema." + table, Integer.class);
    }

    private String subscriptionStatus() {
        return db.queryForObject("SELECT status FROM subscription_schema.customer_subscription WHERE id = ?", String.class, subscription);
    }

    private String occurrenceStatus(UUID id) {
        return db.queryForObject("SELECT status FROM subscription_schema.subscription_occurrence WHERE id = ?", String.class, id);
    }

    private String entitlementStatus() {
        return db.queryForObject("SELECT status FROM subscription_schema.subscription_capacity_entitlement", String.class);
    }

    private String allocationStatus(LocalDate date) {
        return db.queryForObject("SELECT status FROM subscription_schema.subscription_capacity_allocation WHERE service_date = ?", String.class, date);
    }

    private LocalDate cursor() {
        return db.queryForObject("SELECT next_service_date FROM subscription_schema.customer_subscription WHERE id = ?", LocalDate.class, subscription);
    }

    private List<List<String>> occurrenceRows(List<UUID> ids) {
        return ids.stream().map(id -> db.queryForList("SELECT row_to_json(t)::text FROM subscription_schema.subscription_occurrence t WHERE id = ?",
            String.class, id)).toList();
    }

    private List<List<String>> capacityRows() {
        return tableRows(List.of("subscription_capacity_entitlement", "subscription_capacity_allocation", "capacity_audit"));
    }

    private List<List<String>> snapshot() {
        return tableRows(List.of("customer_subscription", "subscription_occurrence", "subscription_occurrence_item", "subscription_status_history",
            "subscription_occurrence_history", "subscription_capacity_entitlement", "subscription_capacity_allocation", "chef_capacity_control",
            "chef_capacity_bucket", "chef_menu_item_capacity_bucket", "capacity_audit", "subscription_order_request_outbox",
            "subscription_invoice", "subscription_invoice_history", "subscription_payment_outbox", "subscription_skip_request"));
    }

    private List<List<String>> tableRows(List<String> tables) {
        return tables.stream().map(table -> db.queryForList("SELECT row_to_json(t)::text FROM subscription_schema." + table +
            " t ORDER BY row_to_json(t)::text", String.class)).toList();
    }

    private final class Gate {
        private final CompletableFuture<Integer> entered = new CompletableFuture<>();
        private final CountDownLatch released = new CountDownLatch(1);

        void hold() {
            entered.complete(db.queryForObject("SELECT pg_backend_pid()", Integer.class));
            try {
                if (!released.await(10, TimeUnit.SECONDS)) throw new AssertionError("Timed out waiting to release transaction gate");
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new AssertionError("Transaction gate interrupted", exception);
            }
        }

        void awaitEntered() throws Exception {
            entered.get(10, TimeUnit.SECONDS);
        }

        void release() {
            released.countDown();
        }
    }

    private final class Race implements AutoCloseable {
        private final ExecutorService threads = Executors.newFixedThreadPool(2);
        private final Gate winner = new Gate();
        private final CompletableFuture<Integer> contender = new CompletableFuture<>();

        void assertBlocked() throws Exception {
            int waitingPid = contender.get(10, TimeUnit.SECONDS);
            int holdingPid = winner.entered.get(10, TimeUnit.SECONDS);
            assertNotEquals(holdingPid, waitingPid, "The race must use distinct PostgreSQL connections");
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                Boolean blocked = db.queryForObject("SELECT ? = ANY(pg_blocking_pids(?))", Boolean.class, holdingPid, waitingPid);
                if (Boolean.TRUE.equals(blocked)) return;
                Thread.sleep(10);
            }
            fail("The customer/worker statement did not block on the competing transaction's row lock");
        }

        @Override
        public void close() throws Exception {
            winner.release();
            threads.shutdown();
            if (!threads.awaitTermination(15, TimeUnit.SECONDS)) {
                threads.shutdownNow();
                fail("Competing database transactions did not terminate");
            }
        }
    }
}
