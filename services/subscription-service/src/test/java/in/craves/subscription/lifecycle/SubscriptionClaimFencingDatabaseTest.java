package in.craves.subscription.lifecycle;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.billing.SubscriptionBillingRepository.BillingClaim;
import in.craves.subscription.capacity.CapacityProperties;
import in.craves.subscription.capacity.CapacityRepository;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.config.JdbcInstantConfiguration;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.occurrence.OccurrenceRepository;
import in.craves.subscription.occurrence.OccurrenceRepository.ClaimedSubscription;
import in.craves.subscription.payment.SubscriptionPaymentStatusService;
import org.junit.jupiter.params.provider.CsvSource;
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
import org.aopalliance.intercept.MethodInterceptor;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import in.craves.subscription.lifecycle.SubscriptionLifecycleModels.ResumeSubscriptionRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
class SubscriptionClaimFencingDatabaseTest {
    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC).plusDays(1);
    private static final Instant NOW = TODAY.atStartOfDay(ZoneOffset.UTC).toInstant();
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
    private SubscriptionBillingRepository billing;
    private CapacityRepository capacityRepository;
    private CapacityService capacity;
    private OccurrenceRepository generator;
    private SubscriptionLifecycleService service;
    private CurrentUser user;
    private CapacityProperties capacityProperties;
    private SubscriptionPaymentStatusService payments;

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
            "(id, plan_code, chef_identity_id, name, billing_period, amount, status) VALUES (?, ?, ?, 'Resume restoration test', 'MONTHLY', 300, 'ACTIVE')",
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
        capacityRepository.upsertSlotRule(chef, TODAY.getDayOfWeek().getValue(), "LUNCH", 100, 100, true, chef);
        capacityRepository.upsertMenuRule(chef, menuItem, TODAY.getDayOfWeek().getValue(), "LUNCH", 100, true, chef);
        capacityRepository.insertEntitlement(subscription, chef, "WEEKLY", TODAY.getDayOfWeek().getValue(), null,
            "LUNCH", menuItem, 1, "COMMITTED", null);
        capacityRepository.upsertAllocation(subscription, chef, TODAY, "LUNCH", menuItem, 1, "COMMITTED", null);
        capacityRepository.upsertAllocation(subscription, chef, TODAY.plusDays(7), "LUNCH", menuItem, 1, "COMMITTED", null);
        var subscriptions = new SubscriptionRepository(db);
        capacityProperties = new CapacityProperties();
        capacityProperties.setProjectionHorizonDays(30);
        capacity = capacityService();
        payments = transactional(new SubscriptionPaymentStatusService(db, new ObjectMapper(), capacity, subscriptions));
        lifecycle = transactional(new SubscriptionLifecycleRepository(db));
        billing = transactional(new SubscriptionBillingRepository(db));
        db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date = ? WHERE id = ?", TODAY, subscription);
        generator = transactional(new OccurrenceRepository(db));
        service = lifecycleService(NOW);
        user = new CurrentUser(customer, "test-customer", null, List.of("CUSTOMER"));
    }

    @AfterEach
    void closeContext() {
        if (jdbcContext != null) jdbcContext.close();
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel"})
    void billingCannotWriteAfterCustomerLifecycle(String action) {
        BillingClaim claim = billing.claimDue(36500, 10, 10).getFirst();
        transition(service, action);
        var before = snapshot();
        assertThrows(IllegalStateException.class, () -> bill(billing, claim));
        assertEquals(before, snapshot(), "A rejected stale claim must have no artifact or cursor side effects");
        assertEquals(TODAY, billingCursor());
        assertEquals(0, count("subscription_invoice"));
        assertEquals(0, count("subscription_invoice_history"));
        assertEquals(0, count("subscription_payment_outbox"));
    }

    @Test
    void staleGenerationCannotInsertAbsentDateAfterLaterCustomerResume() {
        invoice("PAID");
        ClaimedSubscription claim = generationClaim(TODAY);
        service.pause(subscription, "Pause before any meal exists", user);
        service.resume(subscription, new ResumeSubscriptionRequest(TODAY.plusDays(7), "Resume later"), user);
        var before = snapshot();
        assertThrows(IllegalStateException.class, () -> generate(generator, claim, NOW.plusSeconds(7 * 3600)));
        assertEquals(before, snapshot(), "Stale generation must not insert a paid earlier meal after resume");
        assertEquals(0, count("subscription_occurrence"));
        assertEquals(TODAY.plusDays(7), cursor());
    }

    @ParameterizedTest
    @ValueSource(strings = {"PENDING_PAYMENT", "ACTIVE", "PAYMENT_FAILED"})
    void billingPreservesExistingAllowedStatesAndExactCursor(String status) {
        db.update("UPDATE subscription_schema.customer_subscription SET status = ? WHERE id = ?", status, subscription);
        BillingClaim claim = billing.claimDue(36500, 10, 10).getFirst();
        assertTrue(bill(billing, claim));
        assertEquals(TODAY.plusMonths(1), billingCursor());
        assertEquals(status, subscriptionStatus());
        assertNull(billingToken());
        assertEquals(1, count("subscription_invoice"));
        assertEquals(1, count("subscription_invoice_history"));
        assertEquals(1, count("subscription_payment_outbox"));
        assertRejectedUnchanged(() -> bill(billing, claim));
    }

    @ParameterizedTest
    @ValueSource(strings = {"PAUSED", "CANCELLED", "EXPIRED"})
    void billingStatusFenceRejectsEvenWhenOldTokenAndDateRemain(String status) {
        BillingClaim claim = billing.claimDue(36500, 10, 10).getFirst();
        db.update("UPDATE subscription_schema.customer_subscription SET status = ? WHERE id = ?", status, subscription);
        assertRejectedUnchanged(() -> bill(billing, claim));
        assertRejectedUnchanged(() -> billing.releaseAndAdvance(claim, TODAY.plusMonths(1)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"CLEARED", "REPLACED", "DATE", "OWNER"})
    void billingRejectsLostClaimOwnershipOrCycleBeforeWriting(String drift) {
        BillingClaim claim = billing.claimDue(36500, 10, 10).getFirst();
        if ("CLEARED".equals(drift)) db.update("UPDATE subscription_schema.customer_subscription SET billing_lock_token = NULL, billing_locked_at = NULL WHERE id = ?", subscription);
        if ("REPLACED".equals(drift)) db.update("UPDATE subscription_schema.customer_subscription SET billing_locked_at = now() - INTERVAL '30 minutes' WHERE id = ?", subscription);
        if ("REPLACED".equals(drift)) assertNotEquals(claim.lockToken(), billing.claimDue(36500, 10, 10).getFirst().lockToken());
        if ("DATE".equals(drift)) db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date = ? WHERE id = ?", TODAY.plusMonths(1), subscription);
        if ("OWNER".equals(drift)) db.update("UPDATE subscription_schema.customer_subscription SET customer_identity_id = ? WHERE id = ?", UUID.randomUUID(), subscription);
        assertRejectedUnchanged(() -> bill(billing, claim));
        assertRejectedUnchanged(() -> billing.releaseAndAdvance(claim, TODAY.plusMonths(1)));
    }

    @Test
    void billingPauseResumeAbaRejectsOldTokenWithoutDisturbingReplacementClaim() {
        BillingClaim oldClaim = billing.claimDue(36500, 10, 10).getFirst();
        service.pause(subscription, "Pause", user);
        assertNull(billingToken());
        service.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Resume"), user);
        BillingClaim current = billing.claimDue(36500, 10, 10).getFirst();
        assertNotEquals(oldClaim.lockToken(), current.lockToken());
        assertRejectedUnchanged(() -> bill(billing, oldClaim));
        var before = snapshot();
        billing.releaseAfterFailure(oldClaim);
        billing.deferAddressFailure(oldClaim);
        assertEquals(before, snapshot());
        assertTrue(bill(billing, current));
        assertEquals(TODAY.plusMonths(1), billingCursor());
    }

    @Test
    void customerResumeInvalidatesAnyClaimsLeftOnPausedSubscription() {
        service.pause(subscription, "Pause", user);
        db.update("UPDATE subscription_schema.customer_subscription SET billing_lock_token = ?, billing_locked_at = now(), generation_lock_token = ?, generation_locked_at = now() WHERE id = ?", UUID.randomUUID(), UUID.randomUUID(), subscription);
        service.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Resume"), user);
        assertNull(billingToken());
        assertNull(db.queryForObject("SELECT generation_lock_token FROM subscription_schema.customer_subscription WHERE id = ?", UUID.class, subscription));
        assertNull(db.queryForObject("SELECT billing_locked_at FROM subscription_schema.customer_subscription WHERE id = ?", Timestamp.class, subscription));
        assertNull(db.queryForObject("SELECT generation_locked_at FROM subscription_schema.customer_subscription WHERE id = ?", Timestamp.class, subscription));
        assertEquals(TODAY, billingCursor());
    }

    @Test
    void existingInvoiceIsPreservedAndValidClaimAdvancesExactlyOneCycle() {
        UUID invoiceId = invoice("PAYMENT_PENDING");
        var before = tableRows(List.of("subscription_invoice", "subscription_invoice_history", "subscription_payment_outbox"));
        BillingClaim claim = billing.claimDue(36500, 10, 10).getFirst();
        assertFalse(bill(billing, claim));
        assertEquals(before, tableRows(List.of("subscription_invoice", "subscription_invoice_history", "subscription_payment_outbox")));
        assertEquals(invoiceId, db.queryForObject("SELECT id FROM subscription_schema.subscription_invoice", UUID.class));
        assertEquals(TODAY.plusMonths(1), billingCursor());
        assertRejectedUnchanged(() -> bill(billing, claim));
    }

    @ParameterizedTest
    @ValueSource(strings = {"CLEARED", "REPLACED", "DATE", "OWNER", "PAUSED", "CANCELLED", "EXPIRED", "PENDING_PAYMENT", "PAYMENT_FAILED"})
    void generationRejectsLostClaimOwnershipDateOrActiveState(String drift) {
        ClaimedSubscription claim = generationClaim(TODAY);
        if ("CLEARED".equals(drift)) db.update("UPDATE subscription_schema.customer_subscription SET generation_lock_token = NULL, generation_locked_at = NULL WHERE id = ?", subscription);
        if ("REPLACED".equals(drift)) {
            db.update("UPDATE subscription_schema.customer_subscription SET generation_locked_at = now() - INTERVAL '30 minutes' WHERE id = ?", subscription);
            assertNotEquals(claim.lockToken(), generator.claimDue(36500, 10, 10).getFirst().lockToken());
        }
        if ("DATE".equals(drift)) db.update("UPDATE subscription_schema.customer_subscription SET next_service_date = ? WHERE id = ?", TODAY.plusDays(7), subscription);
        if ("OWNER".equals(drift)) db.update("UPDATE subscription_schema.customer_subscription SET customer_identity_id = ? WHERE id = ?", UUID.randomUUID(), subscription);
        if (List.of("PAUSED", "CANCELLED", "EXPIRED", "PENDING_PAYMENT", "PAYMENT_FAILED").contains(drift)) db.update("UPDATE subscription_schema.customer_subscription SET status = ? WHERE id = ?", drift, subscription);
        assertRejectedUnchanged(() -> generate(generator, claim, NOW.plusSeconds(7 * 3600)));
        assertRejectedUnchanged(() -> generator.releaseAndAdvance(claim, TODAY.plusDays(7)));
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 7})
    void generationResumeAbaRejectsOldClaimAndPreservesNewClaim(int days) {
        invoice("PAID");
        ClaimedSubscription oldClaim = generationClaim(TODAY);
        service.pause(subscription, "Pause", user);
        LocalDate resumedDate = TODAY.plusDays(days);
        service.resume(subscription, new ResumeSubscriptionRequest(resumedDate, "Resume"), user);
        ClaimedSubscription current = generator.claimDue(36500, 10, 10).getFirst();
        assertEquals(resumedDate, current.serviceDate());
        assertNotEquals(oldClaim.lockToken(), current.lockToken());
        assertRejectedUnchanged(() -> generate(generator, oldClaim, NOW.plusSeconds(7 * 3600)));
        var before = snapshot();
        generator.releaseAfterFailure(oldClaim);
        assertEquals(before, snapshot());
        UUID id = generate(generator, current, NOW.plusSeconds(days * 86400L + 7 * 3600));
        assertNotNull(id);
        assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
        generator.releaseAndAdvance(current, resumedDate.plusDays(7));
        assertEquals(resumedDate.plusDays(7), cursor());
    }

    @Test
    void generationRequiresArtifactDateToEqualClaimedDate() {
        ClaimedSubscription claim = generationClaim(TODAY);
        var schedule = generator.findActiveSchedule(plan).orElseThrow();
        assertRejectedUnchanged(() -> generator.createOccurrence(claim, schedule, TODAY.plusDays(7), "LUNCH", NOW.plusSeconds(7L * 86400 + 7 * 3600), schedule.items(), null));
    }

    @Test
    void validMultiSlotClaimPreservesIdempotenceUntilOneCursorAdvance() {
        invoice("PAID");
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule_item (id,plan_id,menu_item_id,quantity,iso_day_of_week,sequence_number,meal_slot_code,service_time) VALUES (?,?,?,1,?,1,'DINNER','19:30')", UUID.randomUUID(), plan, menuItem, TODAY.getDayOfWeek().getValue());
        capacityRepository.upsertSlotRule(chef, TODAY.getDayOfWeek().getValue(), "DINNER", 100, 100, true, chef);
        capacityRepository.upsertMenuRule(chef, menuItem, TODAY.getDayOfWeek().getValue(), "DINNER", 100, true, chef);
        capacityRepository.upsertAllocation(subscription, chef, TODAY, "DINNER", menuItem, 1, "COMMITTED", null);
        ClaimedSubscription claim = generationClaim(TODAY);
        var schedule = generator.findActiveSchedule(plan).orElseThrow();
        UUID lunch = generate(generator, claim, NOW.plusSeconds(7 * 3600));
        UUID dinner = generator.createOccurrence(claim, schedule, TODAY, "DINNER", NOW.plusSeconds(14 * 3600), schedule.items().stream().filter(i -> "DINNER".equals(i.mealSlotCode())).toList(), null);
        assertNotNull(lunch);
        assertNotNull(dinner);
        var before = snapshot();
        assertNull(generate(generator, claim, NOW.plusSeconds(7 * 3600)));
        assertNull(generator.createOccurrence(claim, schedule, TODAY, "DINNER", NOW.plusSeconds(14 * 3600), schedule.items().stream().filter(i -> "DINNER".equals(i.mealSlotCode())).toList(), null));
        assertEquals(before, snapshot());
        assertEquals(2, count("subscription_occurrence"));
        assertEquals(2, count("subscription_occurrence_item"));
        assertEquals(2, count("subscription_occurrence_history"));
        assertEquals(2, db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_capacity_allocation WHERE service_date = ? AND status = 'MATERIALIZED'", Integer.class, TODAY));
        generator.releaseAndAdvance(claim, TODAY.plusDays(7));
        assertEquals(TODAY.plusDays(7), cursor());
        assertRejectedUnchanged(() -> generate(generator, claim, NOW.plusSeconds(7 * 3600)));
    }

    @ParameterizedTest
    @CsvSource({"pause,BILLING", "cancel,BILLING", "pause,GENERATION", "cancel,GENERATION"})
    void lifecycleWinnerRejectsWaitingWorkerBeforeAnyArtifacts(String action, String worker) throws Exception {
        BillingClaim billingClaim = billing.claimDue(36500, 10, 10).getFirst();
        ClaimedSubscription generationClaim = generationClaim(TODAY);
        try (Race race = new Race()) {
            var first = transactional(serviceTarget(NOW), afterMethod(action, race.winner));
            Future<?> lifecycleFuture = race.threads.submit(() -> transition(first, action));
            race.winner.awaitEntered();
            Future<?> workerFuture;
            if ("BILLING".equals(worker)) {
                var repository = transactional(new SubscriptionBillingRepository(db), beforeMethod("createInvoiceAndOutbox", race.contender));
                workerFuture = race.threads.submit(() -> assertThrows(IllegalStateException.class, () -> bill(repository, billingClaim)));
            } else {
                var repository = transactional(new OccurrenceRepository(db), beforeMethod("createOccurrence", race.contender));
                workerFuture = race.threads.submit(() -> assertThrows(IllegalStateException.class, () -> generate(repository, generationClaim, NOW.plusSeconds(7 * 3600))));
            }
            race.assertBlocked();
            race.winner.release();
            lifecycleFuture.get(10, TimeUnit.SECONDS);
            workerFuture.get(10, TimeUnit.SECONDS);
        }
        assertEquals("pause".equals(action) ? "PAUSED" : "CANCELLED", subscriptionStatus());
        assertEquals(TODAY, billingCursor());
        assertNull(billingToken());
        assertEquals(0, count("subscription_invoice"));
        assertEquals(0, count("subscription_invoice_history"));
        assertEquals(0, count("subscription_payment_outbox"));
        assertEquals(0, count("subscription_occurrence"));
        assertEquals(0, count("subscription_occurrence_item"));
        assertEquals(0, count("subscription_occurrence_history"));
        assertEquals(0, count("subscription_order_request_outbox"));
        assertEquals(1, count("subscription_status_history"));
    }

    @ParameterizedTest
    @CsvSource({"pause,BILLING", "cancel,BILLING", "pause,GENERATION", "cancel,GENERATION"})
    void workerWinnerPreservesCommittedArtifactsThenLifecycleApplies(String action, String worker) throws Exception {
        BillingClaim billingClaim = billing.claimDue(36500, 10, 10).getFirst();
        ClaimedSubscription generationClaim = generationClaim(TODAY);
        try (Race race = new Race()) {
            Future<?> workerFuture;
            if ("BILLING".equals(worker)) {
                var repository = transactional(new SubscriptionBillingRepository(db), afterMethod("createInvoiceAndOutbox", race.winner));
                workerFuture = race.threads.submit(() -> assertTrue(bill(repository, billingClaim)));
            } else {
                var repository = transactional(new OccurrenceRepository(db), afterMethod("createOccurrence", race.winner));
                workerFuture = race.threads.submit(() -> assertNotNull(generate(repository, generationClaim, NOW.plusSeconds(7 * 3600))));
            }
            race.winner.awaitEntered();
            var second = transactional(serviceTarget(NOW), beforeMethod(action, race.contender));
            Future<?> lifecycleFuture = race.threads.submit(() -> transition(second, action));
            race.assertBlocked();
            race.winner.release();
            workerFuture.get(10, TimeUnit.SECONDS);
            lifecycleFuture.get(10, TimeUnit.SECONDS);
        }
        assertEquals("pause".equals(action) ? "PAUSED" : "CANCELLED", subscriptionStatus());
        assertNull(billingToken());
        if ("BILLING".equals(worker)) {
            assertEquals(TODAY.plusMonths(1), billingCursor());
            assertEquals(1, count("subscription_invoice"));
            assertEquals(1, count("subscription_invoice_history"));
            assertEquals(1, count("subscription_payment_outbox"));
            assertEquals(0, count("subscription_occurrence"));
            var outbox = tableRows(List.of("subscription_payment_outbox"));
            UUID invoiceId = db.queryForObject("SELECT id FROM subscription_schema.subscription_invoice", UUID.class);
            String event = paymentEvent(invoiceId);
            assertTrue(payments.accept(event));
            assertFalse(payments.accept(event));
            assertEquals("PAID", db.queryForObject("SELECT status FROM subscription_schema.subscription_invoice", String.class));
            assertEquals("pause".equals(action) ? "PAUSED" : "CANCELLED", subscriptionStatus());
            assertEquals(outbox, tableRows(List.of("subscription_payment_outbox")));
            if ("cancel".equals(action)) assertEquals("PAYMENT_RECEIVED_AFTER_SUBSCRIPTION_CLOSED", db.queryForObject("SELECT failure_code FROM subscription_schema.subscription_invoice", String.class));
        } else {
            assertEquals(TODAY, billingCursor());
            assertEquals(1, count("subscription_occurrence"));
            assertEquals("CANCELLED", db.queryForObject("SELECT status FROM subscription_schema.subscription_occurrence", String.class));
            assertEquals(1, count("subscription_occurrence_item"));
            assertEquals(2, count("subscription_occurrence_history"));
            assertEquals(0, count("subscription_invoice"));
            assertRejectedUnchanged(() -> generator.releaseAndAdvance(generationClaim, TODAY.plusDays(7)));
        }
        assertEquals(0, count("subscription_order_request_outbox"));
    }

    @Test
    void invoiceFirstPaymentLockAndDuplicateBillingDoNotInvertLocks() throws Exception {
        UUID invoiceId = invoice("PAYMENT_PENDING");
        BillingClaim claim = billing.claimDue(36500, 10, 10).getFirst();
        try (Race race = new Race()) {
            var tx = new org.springframework.transaction.support.TransactionTemplate(transactions);
            Future<?> payment = race.threads.submit(() -> tx.execute(status -> {
                db.queryForObject("SELECT id FROM subscription_schema.subscription_invoice WHERE id = ? FOR UPDATE", UUID.class, invoiceId);
                race.winner.hold();
                return payments.accept(paymentEvent(invoiceId));
            }));
            race.winner.awaitEntered();
            // This must finish while payment still holds the invoice lock. No new invoice or outbox is needed.
            Future<Boolean> duplicate = race.threads.submit(() -> bill(billing, claim));
            assertFalse(duplicate.get(5, TimeUnit.SECONDS));
            race.winner.release();
            payment.get(10, TimeUnit.SECONDS);
        }
        assertEquals(1, count("subscription_invoice"));
        assertEquals(0, count("subscription_payment_outbox"));
        assertEquals(TODAY.plusMonths(1), billingCursor());
        assertEquals("PAID", db.queryForObject("SELECT status FROM subscription_schema.subscription_invoice", String.class));
    }

    private void assertRejectedUnchanged(org.junit.jupiter.api.function.Executable work) {
        var before = snapshot();
        assertThrows(IllegalStateException.class, work);
        assertEquals(before, snapshot(), "Rejected stale work must leave every lifecycle, capacity, invoice, item, history, outbox and claim field unchanged");
    }

    private UUID billingToken() {
        return db.queryForObject("SELECT billing_lock_token FROM subscription_schema.customer_subscription WHERE id = ?", UUID.class, subscription);
    }

    @ParameterizedTest
    @ValueSource(strings = {"BILLING", "GENERATION"})
    void administratorPauseActiveAbaRevokesBothOriginalWorkerClaims(String worker) {
        if ("GENERATION".equals(worker)) invoice("PAID");
        BillingClaim billingClaim = billing.claimDue(36500, 10, 10).getFirst();
        ClaimedSubscription generationClaim = generationClaim(TODAY);
        var admin = adminService();
        admin.adminChangeStatus(subscription, "PAUSED", "Pause for operations", administrator());
        admin.adminChangeStatus(subscription, "ACTIVE", "Resume for operations", administrator());
        if ("BILLING".equals(worker)) assertRejectedUnchanged(() -> bill(billing, billingClaim));
        else assertRejectedUnchanged(() -> generate(generator, generationClaim, NOW.plusSeconds(7 * 3600)));
        assertNull(billingToken());
        assertNull(db.queryForObject("SELECT generation_lock_token FROM subscription_schema.customer_subscription WHERE id = ?", UUID.class, subscription));
        assertEquals("ACTIVE", subscriptionStatus());
        assertEquals(TODAY, billingCursor());
        assertEquals(TODAY, cursor());
        assertEquals(0, count("subscription_occurrence"));
        assertEquals(0, count("subscription_payment_outbox"));
    }

    private in.craves.subscription.service.SubscriptionService adminService(MethodInterceptor... hooks) {
        return transactional(new in.craves.subscription.service.SubscriptionService(
            transactional(new SubscriptionRepository(db)), capacity,
            new in.craves.subscription.address.SubscriptionDeliveryAddressClient("", "", org.springframework.web.client.RestClient.builder())), hooks);
    }

    private CurrentUser administrator() {
        return new CurrentUser(chef, "test-subscription-admin", null, List.of("SUBSCRIPTION_ADMIN"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"PAUSED", "CANCELLED", "EXPIRED", "PAYMENT_FAILED", "PENDING_PAYMENT"})
    void administratorStatusTransitionRevokesBothClaimsWithoutMovingCursors(String target) {
        BillingClaim billingClaim = billing.claimDue(36500, 10, 10).getFirst();
        ClaimedSubscription generationClaim = generationClaim(TODAY);
        var response = adminService().adminChangeStatus(subscription, target, "Operations test", administrator());
        assertEquals(target, response.status());
        assertEquals(target, subscriptionStatus());
        assertEquals(TODAY, cursor());
        assertEquals(TODAY, billingCursor());
        assertNull(billingToken());
        assertNull(db.queryForObject("SELECT generation_lock_token FROM subscription_schema.customer_subscription WHERE id = ?", UUID.class, subscription));
        assertNull(db.queryForObject("SELECT billing_locked_at FROM subscription_schema.customer_subscription WHERE id = ?", Timestamp.class, subscription));
        assertNull(db.queryForObject("SELECT generation_locked_at FROM subscription_schema.customer_subscription WHERE id = ?", Timestamp.class, subscription));
        assertEquals(1, count("subscription_status_history"));
        assertRejectedUnchanged(() -> bill(billing, billingClaim));
        assertRejectedUnchanged(() -> generate(generator, generationClaim, NOW.plusSeconds(7 * 3600)));
    }

    @Test
    void administratorNoOpAndRejectedRequestsPreserveClaimsCapacityAndHistory() {
        billing.claimDue(36500, 10, 10);
        generationClaim(TODAY);
        var before = snapshot();
        var admin = adminService();
        assertEquals("ACTIVE", admin.adminChangeStatus(subscription, "ACTIVE", "No-op", administrator()).status());
        assertEquals(before, snapshot());
        assertThrows(ApiException.class, () -> admin.adminChangeStatus(subscription, "PAUSED", " ", administrator()));
        assertEquals(before, snapshot());
        assertThrows(ApiException.class, () -> admin.adminChangeStatus(subscription, "BOGUS", "Invalid status", administrator()));
        assertEquals(before, snapshot());
        assertThrows(ApiException.class, () -> admin.adminChangeStatus(subscription, "PAUSED", "Not an administrator", user));
        assertEquals(before, snapshot());
    }

    @ParameterizedTest
    @CsvSource({"PAUSED,BILLING", "CANCELLED,BILLING", "PAUSED,GENERATION", "CANCELLED,GENERATION"})
    void administratorWinnerRevokesWaitingWorkerBeforeArtifacts(String status, String worker) throws Exception {
        BillingClaim billingClaim = billing.claimDue(36500, 10, 10).getFirst();
        ClaimedSubscription generationClaim = generationClaim(TODAY);
        try (Race race = new Race()) {
            var first = adminService(afterMethod("adminChangeStatus", race.winner));
            Future<?> admin = race.threads.submit(() -> first.adminChangeStatus(subscription, status, "Admin wins", administrator()));
            race.winner.awaitEntered();
            Future<?> workerFuture;
            if ("BILLING".equals(worker)) {
                var repository = transactional(new SubscriptionBillingRepository(db), beforeMethod("createInvoiceAndOutbox", race.contender));
                workerFuture = race.threads.submit(() -> assertThrows(IllegalStateException.class, () -> bill(repository, billingClaim)));
            } else {
                var repository = transactional(new OccurrenceRepository(db), beforeMethod("createOccurrence", race.contender));
                workerFuture = race.threads.submit(() -> assertThrows(IllegalStateException.class, () -> generate(repository, generationClaim, NOW.plusSeconds(7 * 3600))));
            }
            race.assertBlocked();
            race.winner.release();
            admin.get(10, TimeUnit.SECONDS);
            workerFuture.get(10, TimeUnit.SECONDS);
        }
        assertEquals(status, subscriptionStatus());
        assertEquals(TODAY, cursor());
        assertEquals(TODAY, billingCursor());
        assertNull(billingToken());
        assertEquals(0, count("subscription_occurrence"));
        assertEquals(0, count("subscription_occurrence_item"));
        assertEquals(0, count("subscription_occurrence_history"));
        assertEquals(0, count("subscription_invoice"));
        assertEquals(0, count("subscription_invoice_history"));
        assertEquals(0, count("subscription_payment_outbox"));
        assertEquals(0, count("subscription_order_request_outbox"));
        assertEquals(1, count("subscription_status_history"));
    }

    @ParameterizedTest
    @CsvSource({"PAUSED,BILLING", "CANCELLED,BILLING", "PAUSED,GENERATION", "CANCELLED,GENERATION"})
    void workerWinnerCommitsBeforeAdministratorAndDoesNotInvertCapacityLocks(String status, String worker) throws Exception {
        BillingClaim billingClaim = billing.claimDue(36500, 10, 10).getFirst();
        ClaimedSubscription generationClaim = generationClaim(TODAY);
        var capacityEntered = new java.util.concurrent.atomic.AtomicBoolean();
        var ordinaryCapacity = capacity;
        capacity = capacityService(invocation -> {
            if (invocation.getMethod().getName().equals("releaseForPauseOrTerminal")) capacityEntered.set(true);
            return invocation.proceed();
        });
        try (Race race = new Race()) {
            Future<?> workerFuture;
            if ("BILLING".equals(worker)) {
                var repository = transactional(new SubscriptionBillingRepository(db), afterMethod("createInvoiceAndOutbox", race.winner));
                workerFuture = race.threads.submit(() -> assertTrue(bill(repository, billingClaim)));
            } else {
                var repository = transactional(new OccurrenceRepository(db), afterMethod("createOccurrence", race.winner));
                workerFuture = race.threads.submit(() -> assertNotNull(generate(repository, generationClaim, NOW.plusSeconds(7 * 3600))));
            }
            race.winner.awaitEntered();
            var second = adminService(beforeMethod("adminChangeStatus", race.contender));
            Future<?> admin = race.threads.submit(() -> second.adminChangeStatus(subscription, status, "Admin waits", administrator()));
            race.assertBlocked();
            assertFalse(capacityEntered.get(), "Admin must acquire the subscription lock before entering capacity work");
            race.winner.release();
            workerFuture.get(10, TimeUnit.SECONDS);
            admin.get(10, TimeUnit.SECONDS);
        } finally { capacity = ordinaryCapacity; }
        assertTrue(capacityEntered.get());
        assertEquals(status, subscriptionStatus());
        assertEquals(TODAY, cursor(), "Admin status change must preserve the existing generation cursor contract");
        assertNull(billingToken());
        if ("BILLING".equals(worker)) {
            assertEquals(TODAY.plusMonths(1), billingCursor());
            assertEquals(1, count("subscription_invoice"));
            assertEquals(1, count("subscription_invoice_history"));
            assertEquals(1, count("subscription_payment_outbox"));
            assertEquals(0, count("subscription_occurrence"));
        } else {
            assertEquals(TODAY, billingCursor());
            assertEquals(1, count("subscription_occurrence"));
            assertEquals("BILLING_PENDING", db.queryForObject("SELECT status FROM subscription_schema.subscription_occurrence", String.class), "Admin's existing occurrence contract remains unchanged");
            assertEquals(1, count("subscription_occurrence_history"));
            assertEquals(1, count("subscription_occurrence_item"));
            assertEquals(0, count("subscription_invoice"));
        }
        assertEquals(0, count("subscription_order_request_outbox"));
        assertRejectedUnchanged(() -> generator.releaseAndAdvance(generationClaim, TODAY.plusDays(7)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"pause", "cancel", "ADMIN"})
    void lifecycleFailureRollsBackClaimInvalidationAndCapacityTogether(String action) {
        billing.claimDue(36500, 10, 10);
        generationClaim(TODAY);
        var before = snapshot();
        capacity = capacityService(invocation -> {
            Object value = invocation.proceed();
            if (invocation.getMethod().getName().equals("releaseForPauseOrTerminal")) throw new IllegalStateException("Injected failure after capacity release");
            return value;
        });
        if ("ADMIN".equals(action)) assertThrows(IllegalStateException.class, () -> adminService().adminChangeStatus(subscription, "PAUSED", "Failing change", administrator()));
        else assertThrows(IllegalStateException.class, () -> transition(lifecycleService(NOW), action));
        assertEquals(before, snapshot());
    }

    @ParameterizedTest
    @ValueSource(strings = {"BILLING", "GENERATION"})
    void workerFailureRollsBackArtifactsAndRetainsValidClaim(String worker) {
        BillingClaim billingClaim = billing.claimDue(36500, 10, 10).getFirst();
        ClaimedSubscription generationClaim = generationClaim(TODAY);
        var before = snapshot();
        MethodInterceptor failAfterWrite = invocation -> {
            Object value = invocation.proceed();
            if (invocation.getMethod().getName().equals("createInvoiceAndOutbox") || invocation.getMethod().getName().equals("createOccurrence")) throw new IllegalStateException("Injected failure before commit");
            return value;
        };
        if ("BILLING".equals(worker)) assertThrows(IllegalStateException.class, () -> bill(transactional(new SubscriptionBillingRepository(db), failAfterWrite), billingClaim));
        else assertThrows(IllegalStateException.class, () -> generate(transactional(new OccurrenceRepository(db), failAfterWrite), generationClaim, NOW.plusSeconds(7 * 3600)));
        assertEquals(before, snapshot());
    }

    private boolean bill(SubscriptionBillingRepository repository, BillingClaim claim) {
        return repository.createInvoiceAndOutbox(claim, claim.cycleStart().plusMonths(1), UUID.randomUUID(), UUID.randomUUID(), new ObjectMapper().createObjectNode());
    }

    private void transition(SubscriptionLifecycleService target, String action) {
        if ("pause".equals(action)) target.pause(subscription, "Claim fencing test pause", user);
        else target.cancel(subscription, "Claim fencing test cancel", user);
    }

    private LocalDate billingCursor() {
        return db.queryForObject("SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id = ?", LocalDate.class, subscription);
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

    private String paymentEvent(UUID invoice) {
        var event = new ObjectMapper().createObjectNode().put("eventId", UUID.randomUUID().toString())
            .put("eventType", "SUBSCRIPTION_PAYMENT_STATUS_CHANGED").put("eventVersion", "v1")
            .put("correlationId", invoice.toString()).put("causationId", subscription.toString()).put("subject", invoice.toString());
        event.putObject("data").put("invoiceId", invoice.toString()).put("subscriptionId", subscription.toString())
            .put("paymentIntentId", UUID.randomUUID().toString()).put("status", "PAID").put("providerStatus", "captured")
            .put("providerPaymentId", "local-disposable-test").put("amount", "300.00").put("currency", "INR");
        return event.toString();
    }

    private CapacityService capacityService(MethodInterceptor... hooks) {
        return transactional(new CapacityService(capacityRepository, new PlanScheduleRepository(db), mock(PlanCatalogClient.class),
            new SubscriptionRepository(db), capacityProperties, new ObjectMapper()), hooks);
    }

    private UUID invoice(String status) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_invoice " +
            "(id, subscription_id, plan_id, customer_identity_id, chef_identity_id, cycle_start, cycle_end, amount, currency, status) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, 300, 'INR', ?)", id, subscription, plan, customer, chef, TODAY, TODAY.plusMonths(1), status);
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
        return repository.createOccurrence(claim, schedule, claim.serviceDate(), "LUNCH", serviceAt, schedule.items().stream().filter(item -> "LUNCH".equals(item.mealSlotCode())).toList(), null);
    }

    private SubscriptionLifecycleService serviceTarget(Instant now) {
        return new SubscriptionLifecycleService(lifecycle, new SubscriptionPolicyRepository(db), new SubscriptionRepository(db),
            capacity, Clock.fixed(now, ZoneOffset.UTC));
    }

    private SubscriptionLifecycleService lifecycleService(Instant now) {
        return transactional(serviceTarget(now));
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

    private int count(String table) {
        return db.queryForObject("SELECT count(*) FROM subscription_schema." + table, Integer.class);
    }

    private String subscriptionStatus() {
        return db.queryForObject("SELECT status FROM subscription_schema.customer_subscription WHERE id = ?", String.class, subscription);
    }

    private String occurrenceStatus(UUID id) {
        return db.queryForObject("SELECT status FROM subscription_schema.subscription_occurrence WHERE id = ?", String.class, id);
    }

    private LocalDate cursor() {
        return db.queryForObject("SELECT next_service_date FROM subscription_schema.customer_subscription WHERE id = ?", LocalDate.class, subscription);
    }

    private List<List<String>> snapshot() {
        return tableRows(List.of("customer_subscription", "subscription_occurrence", "subscription_occurrence_item", "subscription_status_history",
            "subscription_occurrence_history", "subscription_capacity_entitlement", "subscription_capacity_allocation", "chef_capacity_control",
            "chef_capacity_bucket", "chef_menu_item_capacity_bucket", "capacity_audit", "subscription_order_request_outbox",
            "subscription_invoice", "subscription_invoice_history", "subscription_payment_outbox", "subscription_skip_request",
            "subscription_payment_status_inbox", "capacity_incident"));
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
