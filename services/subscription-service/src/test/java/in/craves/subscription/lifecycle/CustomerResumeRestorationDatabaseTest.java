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
import in.craves.subscription.payment.SubscriptionPaymentStatusService;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.params.provider.CsvSource;
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
import org.junit.jupiter.api.Test;
import in.craves.subscription.lifecycle.SubscriptionLifecycleModels.ResumeSubscriptionRequest;
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
class CustomerResumeRestorationDatabaseTest {
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
    private CapacityRepository capacityRepository;
    private CapacityService capacity;
    private OccurrenceRepository generator;
    private OccurrenceOrderRepository dispatch;
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
        generator = transactional(new OccurrenceRepository(db));
        dispatch = transactional(new OccurrenceOrderRepository(db));
        service = lifecycleService(NOW);
        user = new CurrentUser(customer, "test-customer", null, List.of("CUSTOMER"));
    }

    @AfterEach
    void closeContext() {
        if (jdbcContext != null) jdbcContext.close();
    }

    @Test
    void generatedPaidMealSurvivesSameDatePauseResumeReplayAndDispatch() {
        invoice("PAID");
        ClaimedSubscription claim = generationClaim(TODAY);
        UUID generated = generate(generator, claim, NOW.plusSeconds(7 * 3600));
        generator.releaseAndAdvance(claim, TODAY.plusDays(7));
        assertEquals("READY_FOR_ORDER", occurrenceStatus(generated));
        service.pause(subscription, "Customer test pause", user);
        assertEquals("CANCELLED", occurrenceStatus(generated));
        service.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Customer test resume"), user);
        // The regression: the subscription becomes ACTIVE but its unique existing meal stays CANCELLED.
        assertEquals("READY_FOR_ORDER", occurrenceStatus(generated), "The original paid occurrence must be restored on same-date customer resume");
        ClaimedSubscription replay = generationClaim(TODAY);
        assertNull(generate(generator, replay, NOW.plusSeconds(7 * 3600)), "Generation replay must retain the existing occurrence identity");
        generator.releaseAndAdvance(replay, TODAY.plusDays(7));
        assertEquals(1, count("subscription_occurrence"));
        var dispatchClaim = dispatchClaim(generated);
        assertTrue(dispatch.createRequest(dispatchClaim, UUID.randomUUID(), new ObjectMapper().createObjectNode()));
        assertFalse(dispatch.createRequest(dispatchClaim, UUID.randomUUID(), new ObjectMapper().createObjectNode()));
        assertEquals(1, count("subscription_order_request_outbox"));
    }

    @ParameterizedTest
    @CsvSource({"PAID,READY_FOR_ORDER", "PAYMENT_REQUESTED,BILLING_PENDING", "PAYMENT_PENDING,BILLING_PENDING", "MISSING,BILLING_PENDING"})
    void restoresUsingInvoiceTruthAndPreservesOriginalArtifacts(String invoiceStatus, String restoredStatus) {
        if (!"MISSING".equals(invoiceStatus)) invoice(invoiceStatus);
        else db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date = ? WHERE id = ?", TODAY, subscription);
        UUID id = generateAndPause();
        var immutable = immutableArtifacts(id);
        resume();
        assertEquals("ACTIVE", subscriptionStatus());
        assertEquals(restoredStatus, occurrenceStatus(id));
        assertEquals(immutable, immutableArtifacts(id), "Resume must preserve identities, original meal snapshot, schedule and invoice artifacts");
        assertEquals(1, restoreHistoryCount(id));
        assertEquals(customer, db.queryForObject("SELECT actor_identity_id FROM subscription_schema.subscription_occurrence_history " +
            "WHERE occurrence_id = ? AND source = 'CUSTOMER_RESUME'", UUID.class, id));
        assertEquals("MATERIALIZED", allocationStatus(TODAY));
        assertEquals(id, db.queryForObject("SELECT occurrence_id FROM subscription_schema.subscription_capacity_allocation WHERE service_date = ?",
            UUID.class, TODAY));
        assertEquals(1, db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_capacity_entitlement WHERE status = 'COMMITTED'", Integer.class));
        assertEquals(0, count("subscription_order_request_outbox"));
        assertEquals(0, count("subscription_payment_outbox"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"FAILED", "CANCELLED", "MISSING_WITHOUT_CURSOR", "MISSING_AFTER_CURSOR", "OVERLAP_PAID", "OVERLAP_PENDING", "WRONG_CUSTOMER", "WRONG_PLAN", "WRONG_CHEF"})
    void ambiguousOrUnpayableInvoiceRejectsAtomically(String scenario) {
        UUID invoice = "MISSING_WITHOUT_CURSOR".equals(scenario) || "MISSING_AFTER_CURSOR".equals(scenario) ? null : invoice("PAID");
        UUID occurrence = generateAndPause();
        switch (scenario) {
            case "FAILED", "CANCELLED" -> db.update("UPDATE subscription_schema.subscription_invoice SET status = ? WHERE id = ?", scenario, invoice);
            case "MISSING_WITHOUT_CURSOR" -> db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date = NULL WHERE id = ?", subscription);
            case "MISSING_AFTER_CURSOR" -> db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date = ? WHERE id = ?", TODAY.plusDays(1), subscription);
            case "OVERLAP_PAID", "OVERLAP_PENDING" -> invoiceRange(TODAY.minusDays(1), TODAY.plusDays(1), scenario.endsWith("PAID") ? "PAID" : "PAYMENT_PENDING");
            case "WRONG_CUSTOMER" -> db.update("UPDATE subscription_schema.subscription_invoice SET customer_identity_id = ? WHERE id = ?", UUID.randomUUID(), invoice);
            case "WRONG_PLAN" -> {
                UUID other = otherPlan();
                db.update("UPDATE subscription_schema.subscription_invoice SET plan_id = ? WHERE id = ?", other, invoice);
            }
            case "WRONG_CHEF" -> db.update("UPDATE subscription_schema.subscription_invoice SET chef_identity_id = ? WHERE id = ?", UUID.randomUUID(), invoice);
            default -> throw new AssertionError(scenario);
        }
        assertRejectedUnchanged("SUBSCRIPTION_STATE_CHANGED");
        assertEquals("CANCELLED", occurrenceStatus(occurrence));
    }

    @Test
    void paidCycleEndIsExclusiveAndPriorInvoiceDoesNotMakeResumeReady() {
        invoiceRange(TODAY.minusMonths(1), TODAY, "PAID");
        db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date = ? WHERE id = ?", TODAY, subscription);
        UUID id = generateAndPause();
        resume();
        assertEquals("BILLING_PENDING", occurrenceStatus(id));
        assertEquals(1, count("subscription_invoice"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"BEFORE_PAUSE", "DURING_PAUSE", "AFTER_RESUME"})
    void realPaymentCallbackConvergesWithoutRecreatingInvoiceOrMeal(String timing) {
        UUID invoice = invoice("PAYMENT_PENDING");
        UUID id = generateCurrent();
        String event = paymentEvent(invoice);
        if ("BEFORE_PAUSE".equals(timing)) assertTrue(payments.accept(event));
        service.pause(subscription, "Customer test pause", user);
        assertEquals("CANCELLED", occurrenceStatus(id));
        if ("DURING_PAUSE".equals(timing)) {
            assertTrue(payments.accept(event));
            assertEquals("PAUSED", subscriptionStatus());
            assertEquals("CANCELLED", occurrenceStatus(id));
            assertEquals("RELEASED", allocationStatus(TODAY));
        }
        resume();
        if ("AFTER_RESUME".equals(timing)) {
            assertEquals("BILLING_PENDING", occurrenceStatus(id));
            assertTrue(payments.accept(event));
        }
        assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
        var beforeReplay = tableRows(List.of("customer_subscription", "subscription_occurrence", "subscription_capacity_entitlement",
            "subscription_capacity_allocation", "subscription_invoice", "subscription_invoice_history", "subscription_order_request_outbox"));
        assertFalse(payments.accept(event));
        assertEquals(beforeReplay, tableRows(List.of("customer_subscription", "subscription_occurrence", "subscription_capacity_entitlement",
            "subscription_capacity_allocation", "subscription_invoice", "subscription_invoice_history", "subscription_order_request_outbox")));
        assertEquals(1, count("subscription_invoice"));
        assertEquals(1, count("subscription_occurrence"));
        assertEquals(1, restoreHistoryCount(id));
        assertOneDispatch(id);
    }

    @ParameterizedTest
    @ValueSource(strings = {"NO_OCCURRENCE_HISTORY", "WRONG_OCCURRENCE_ACTOR", "NULL_OCCURRENCE_ACTOR", "UNKNOWN_OLD_STATUS", "NULL_OLD_STATUS", "STALE_PAUSE_TIME", "TIED_OCCURRENCE_HISTORY", "NEWER_CUSTOMER_PAUSE", "NO_SUBSCRIPTION_HISTORY", "WRONG_SUBSCRIPTION_ACTOR", "TIED_SUBSCRIPTION_HISTORY", "NEWER_SUBSCRIPTION_HISTORY"})
    void missingAmbiguousOrUnownedPauseProvenanceRejectsAtomically(String scenario) {
        invoice("PAID");
        UUID id = generateAndPause();
        switch (scenario) {
            case "NO_OCCURRENCE_HISTORY" -> db.update("DELETE FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id = ?", id);
            case "WRONG_OCCURRENCE_ACTOR" -> db.update("UPDATE subscription_schema.subscription_occurrence_history SET actor_identity_id = ? WHERE occurrence_id = ? AND source = 'CUSTOMER_PAUSE'", UUID.randomUUID(), id);
            case "NULL_OCCURRENCE_ACTOR" -> db.update("UPDATE subscription_schema.subscription_occurrence_history SET actor_identity_id = NULL WHERE occurrence_id = ? AND source = 'CUSTOMER_PAUSE'", id);
            case "UNKNOWN_OLD_STATUS" -> db.update("UPDATE subscription_schema.subscription_occurrence_history SET old_status = 'ORDER_REQUESTED' WHERE occurrence_id = ? AND source = 'CUSTOMER_PAUSE'", id);
            case "NULL_OLD_STATUS" -> db.update("UPDATE subscription_schema.subscription_occurrence_history SET old_status = NULL WHERE occurrence_id = ? AND source = 'CUSTOMER_PAUSE'", id);
            case "STALE_PAUSE_TIME" -> db.update("UPDATE subscription_schema.subscription_occurrence_history SET created_at = created_at - INTERVAL '1 second' WHERE occurrence_id = ? AND source = 'CUSTOMER_PAUSE'", id);
            case "TIED_OCCURRENCE_HISTORY" -> copyOccurrenceHistory(id, "CUSTOMER_PAUSE", "created_at");
            case "NEWER_CUSTOMER_PAUSE" -> copyOccurrenceHistory(id, "CUSTOMER_PAUSE", "created_at + INTERVAL '1 second'");
            case "NO_SUBSCRIPTION_HISTORY" -> db.update("DELETE FROM subscription_schema.subscription_status_history WHERE subscription_id = ?", subscription);
            case "WRONG_SUBSCRIPTION_ACTOR" -> db.update("UPDATE subscription_schema.subscription_status_history SET actor_identity_id = ? WHERE subscription_id = ?", UUID.randomUUID(), subscription);
            case "TIED_SUBSCRIPTION_HISTORY", "NEWER_SUBSCRIPTION_HISTORY" -> db.update("INSERT INTO subscription_schema.subscription_status_history " +
                "(id, subscription_id, old_status, new_status, reason, actor_identity_id, created_at) " +
                "SELECT ?, subscription_id, old_status, new_status, reason, actor_identity_id, created_at " +
                ("NEWER_SUBSCRIPTION_HISTORY".equals(scenario) ? "+ INTERVAL '1 second' " : " ") +
                "FROM subscription_schema.subscription_status_history WHERE subscription_id = ?", UUID.randomUUID(), subscription);
            default -> throw new AssertionError(scenario);
        }
        assertRejectedUnchanged("SUBSCRIPTION_STATE_CHANGED");
    }

    @Test
    void uniquelyDocumentedNonPauseCancellationIsNeverRestored() {
        invoice("PAID");
        UUID id = generateAndPause();
        copyOccurrenceHistory(id, "CUSTOMER_CANCEL", "created_at + INTERVAL '1 second'");
        var before = occurrenceRows(List.of(id));
        resume();
        assertEquals("ACTIVE", subscriptionStatus());
        assertEquals(before, occurrenceRows(List.of(id)));
        assertEquals(0, restoreHistoryCount(id));
    }

    @ParameterizedTest
    @ValueSource(strings = {"order_id", "order_requested_at", "order_created_at"})
    void anyOrderProgressMarkerRejectsAtomically(String column) {
        invoice("PAID");
        UUID id = generateAndPause();
        if ("order_id".equals(column)) db.update("UPDATE subscription_schema.subscription_occurrence SET order_id = ? WHERE id = ?", UUID.randomUUID(), id);
        else db.update("UPDATE subscription_schema.subscription_occurrence SET " + column + " = now() WHERE id = ?", id);
        assertRejectedUnchanged("SUBSCRIPTION_STATE_CHANGED");
    }

    @ParameterizedTest
    @ValueSource(strings = {"PENDING", "PROCESSING", "PUBLISHED", "FAILED", "DEAD_LETTER"})
    void anyExistingOrderOutboxEvenUnrelatedEventTypeRejectsAtomically(String status) {
        invoice("PAID");
        UUID id = generateAndPause();
        db.update("INSERT INTO subscription_schema.subscription_order_request_outbox " +
            "(id,event_key,aggregate_id,event_type,event_version,correlation_id,subject,payload,status) " +
            "VALUES (?, ?, ?, 'OTHER_ORDER_EVENT', 'v1', ?, ?, '{}'::jsonb, ?)", UUID.randomUUID(), "historical:" + id, id, id, id, status);
        assertRejectedUnchanged("SUBSCRIPTION_STATE_CHANGED");
    }

    @ParameterizedTest
    @ValueSource(strings = {"VERSION", "TIME", "TIMEZONE", "ITEM", "QUANTITY", "SEQUENCE", "WEEKDAY", "SLOT", "SUBSCRIPTION_CHEF", "OCCURRENCE_CHEF", "OCCURRENCE_CUSTOMER", "OCCURRENCE_ADDRESS"})
    void changedOriginalScheduleOrOwnershipRejectsAtomically(String drift) {
        invoice("PAID");
        UUID id = generateAndPause();
        switch (drift) {
            case "VERSION" -> db.update("UPDATE subscription_schema.subscription_plan_schedule SET version = version + 1 WHERE plan_id = ?", plan);
            case "TIME" -> db.update("UPDATE subscription_schema.subscription_plan_schedule_item SET service_time = '13:30' WHERE plan_id = ?", plan);
            case "TIMEZONE" -> db.update("UPDATE subscription_schema.subscription_plan_schedule SET timezone = 'UTC' WHERE plan_id = ?", plan);
            case "ITEM" -> db.update("UPDATE subscription_schema.subscription_plan_schedule_item SET menu_item_id = ? WHERE plan_id = ?", UUID.randomUUID(), plan);
            case "QUANTITY" -> db.update("UPDATE subscription_schema.subscription_plan_schedule_item SET quantity = 2 WHERE plan_id = ?", plan);
            case "SEQUENCE" -> db.update("UPDATE subscription_schema.subscription_plan_schedule_item SET sequence_number = 2 WHERE plan_id = ?", plan);
            case "WEEKDAY" -> db.update("UPDATE subscription_schema.subscription_plan_schedule_item SET iso_day_of_week = ? WHERE plan_id = ?", TODAY.plusDays(1).getDayOfWeek().getValue(), plan);
            case "SLOT" -> db.update("UPDATE subscription_schema.subscription_plan_schedule_item SET meal_slot_code = 'DINNER' WHERE plan_id = ?", plan);
            case "SUBSCRIPTION_CHEF" -> db.update("UPDATE subscription_schema.customer_subscription SET chef_identity_id = ? WHERE id = ?", UUID.randomUUID(), subscription);
            case "OCCURRENCE_CHEF" -> db.update("UPDATE subscription_schema.subscription_occurrence SET chef_identity_id = ? WHERE id = ?", UUID.randomUUID(), id);
            case "OCCURRENCE_CUSTOMER" -> db.update("UPDATE subscription_schema.subscription_occurrence SET customer_identity_id = ? WHERE id = ?", UUID.randomUUID(), id);
            case "OCCURRENCE_ADDRESS" -> db.update("UPDATE subscription_schema.subscription_occurrence SET delivery_address_id = ? WHERE id = ?", UUID.randomUUID(), id);
            default -> throw new AssertionError(drift);
        }
        assertRejectedUnchanged(null);
    }

    @Test
    void skipAndDatesBeforeRequestedResumeAreNotResurrected() {
        invoice("PAID");
        UUID id = generateAndPause();
        var before = occurrenceRows(List.of(id));
        service.resume(subscription, new ResumeSubscriptionRequest(TODAY.plusDays(7), "Resume next week"), user);
        assertEquals(before, occurrenceRows(List.of(id)));
        assertEquals(0, restoreHistoryCount(id));
        assertEquals(TODAY.plusDays(7), cursor());
    }

    @ParameterizedTest
    @ValueSource(strings = {"REQUESTED", "APPLIED"})
    void activeSkipRequestKeepsOriginalOccurrenceExcluded(String state) {
        invoice("PAID");
        UUID id;
        if ("APPLIED".equals(state)) {
            id = generateCurrent();
            service.skip(subscription, new SubscriptionLifecycleModels.SkipSubscriptionDateRequest(TODAY, "Keep original skip"), user);
            assertEquals("SKIPPED", occurrenceStatus(id));
            service.pause(subscription, "Pause after skip", user);
        } else {
            id = generateAndPause();
            db.update("INSERT INTO subscription_schema.subscription_skip_request (id, subscription_id, service_date, status, actor_identity_id) VALUES (?, ?, ?, 'REQUESTED', ?)",
                UUID.randomUUID(), subscription, TODAY, customer);
        }
        assertEquals(state, db.queryForObject("SELECT status FROM subscription_schema.subscription_skip_request", String.class));
        var before = occurrenceRows(List.of(id));
        resume();
        assertEquals(before, occurrenceRows(List.of(id)));
        assertEquals("RELEASED", allocationStatus(TODAY));
        assertEquals(0, restoreHistoryCount(id));
    }

    @ParameterizedTest
    @ValueSource(longs = {-1, 0, 3600})
    void pastServiceAndExactActualOccurrenceLeadFailClosed(long secondsFromNow) {
        invoice("PAID");
        UUID id = generateAndPause();
        db.update("UPDATE subscription_schema.subscription_occurrence SET service_at = ? WHERE id = ?", Timestamp.from(NOW.plusSeconds(secondsFromNow)), id);
        // Header says 12:30 IST; stored occurrence is earlier and must remain authoritative.
        assertRejectedUnchanged("SUBSCRIPTION_RESUME_LEAD");
    }

    @ParameterizedTest
    @ValueSource(strings = {"FROZEN", "FULL"})
    void capacityFreezeAndFullCapacityRollBackEntireResume(String scenario) {
        invoice("PAID");
        generateAndPause();
        if ("FROZEN".equals(scenario)) capacityRepository.setFrozen(chef, true, "Test freeze", chef);
        else capacityRepository.upsertSlotRule(chef, TODAY.getDayOfWeek().getValue(), "LUNCH", 0, 0, true, chef);
        assertRejectedUnchanged("FROZEN".equals(scenario) ? "SUBSCRIPTION_CAPACITY_FROZEN" : null);
    }

    @Test
    void occurrenceOutsideReacquisitionProjectionHorizonFailsClosed() {
        invoiceRange(TODAY, TODAY.plusMonths(3), "PAID");
        LocalDate farDate = TODAY.plusDays(35);
        ClaimedSubscription claim = generationClaim(farDate);
        UUID id = generate(generator, claim, NOW.plusSeconds(35L * 86400 + 7 * 3600));
        generator.releaseAndAdvance(claim, farDate.plusDays(7));
        service.pause(subscription, "Pause far occurrence", user);
        assertEquals("CANCELLED", occurrenceStatus(id));
        assertRejectedUnchanged("SUBSCRIPTION_STATE_CHANGED");
    }

    @Test
    void noCandidateResumeKeepsOriginalLifecycleBehavior() {
        service.pause(subscription, "Pause before generation", user);
        resume();
        assertEquals("ACTIVE", subscriptionStatus());
        assertEquals(TODAY, cursor());
        assertEquals(0, count("subscription_occurrence"));
        assertEquals(2, count("subscription_status_history"));
        assertEquals("COMMITTED", allocationStatus(TODAY));
    }

    @ParameterizedTest
    @ValueSource(strings = {"REACQUIRE", "MATERIALIZE", "OCCURRENCE_HISTORY", "SUBSCRIPTION_HISTORY"})
    void failuresAfterActualWritesRollBackEveryPersistedArtifact(String point) {
        invoice("PAID");
        UUID id = generateAndPause();
        var before = snapshot();
        AtomicBoolean reached = new AtomicBoolean();
        MethodInterceptor failAfter = invocation -> {
            Object result = invocation.proceed();
            String name = invocation.getMethod().getName();
            boolean selected = switch (point) {
                case "REACQUIRE" -> name.equals("reacquireForResume");
                case "MATERIALIZE" -> name.equals("markMaterialized");
                case "OCCURRENCE_HISTORY" -> name.equals("restorePausedOccurrence");
                case "SUBSCRIPTION_HISTORY" -> name.equals("resume");
                default -> false;
            };
            if (selected) {
                reached.set(true);
                if (point.equals("REACQUIRE")) assertEquals("COMMITTED", allocationStatus(TODAY));
                if (point.equals("MATERIALIZE")) assertEquals("MATERIALIZED", allocationStatus(TODAY));
                if (point.equals("OCCURRENCE_HISTORY")) assertEquals(1, restoreHistoryCount(id));
                if (point.equals("SUBSCRIPTION_HISTORY")) assertEquals("ACTIVE", subscriptionStatus());
                throw new IllegalStateException("Injected after real " + point);
            }
            return result;
        };
        capacity = capacityService(failAfter);
        lifecycle = transactional(new SubscriptionLifecycleRepository(db), failAfter);
        service = lifecycleService(NOW);
        IllegalStateException error = assertThrows(IllegalStateException.class, this::resume);
        assertEquals("Injected after real " + point, error.getMessage());
        assertTrue(reached.get(), "Failure must occur after actual database mutation");
        assertEquals(before, snapshot(), "Rollback must include subscriptions, original meals/items, all histories, capacity, invoices and outboxes");
    }

    @ParameterizedTest
    @ValueSource(strings = {"UNITS", "ITEM", "LINK", "MISSING", "EXTRA_RELEASED_ALLOCATION", "POST_MATERIALIZE_LINK"})
    void actualReacquisitionOrMaterializationMismatchRollsBack(String mismatch) {
        invoice("PAID");
        generateAndPause();
        var before = snapshot();
        AtomicBoolean reached = new AtomicBoolean();
        capacity = capacityService(invocation -> {
            Object result = invocation.proceed();
            String hook = "POST_MATERIALIZE_LINK".equals(mismatch) ? "markMaterialized" : "reacquireForResume";
            if (invocation.getMethod().getName().equals(hook)) {
                reached.set(true);
                switch (mismatch) {
                    case "UNITS" -> db.update("UPDATE subscription_schema.subscription_capacity_allocation SET units = 2 WHERE subscription_id = ? AND service_date = ?", subscription, TODAY);
                    case "ITEM" -> db.update("UPDATE subscription_schema.subscription_capacity_allocation SET menu_item_id = ? WHERE subscription_id = ? AND service_date = ?", UUID.randomUUID(), subscription, TODAY);
                    case "LINK", "POST_MATERIALIZE_LINK" -> db.update("UPDATE subscription_schema.subscription_capacity_allocation SET occurrence_id = NULL WHERE subscription_id = ? AND service_date = ?", subscription, TODAY);
                    case "EXTRA_RELEASED_ALLOCATION" -> capacityRepository.upsertAllocation(subscription, chef, TODAY, "LUNCH", UUID.randomUUID(), 1, "RELEASED", null);
                    case "MISSING" -> db.update("DELETE FROM subscription_schema.subscription_capacity_allocation WHERE subscription_id = ? AND service_date = ?", subscription, TODAY);
                    default -> throw new AssertionError(mismatch);
                }
                if ("LINK".equals(mismatch)) db.update("UPDATE subscription_schema.subscription_capacity_allocation SET status = 'MATERIALIZED' WHERE subscription_id = ? AND service_date = ?", subscription, TODAY);
            }
            return result;
        });
        service = lifecycleService(NOW);
        assertThrows(ApiException.class, this::resume);
        assertTrue(reached.get());
        assertEquals(before, snapshot());
    }

    @Test
    void simultaneousRepeatedResumeUsesDistinctConnectionsAndRestoresExactlyOnce() throws Exception {
        invoice("PAID");
        UUID id = generateAndPause();
        try (Race race = new Race()) {
            SubscriptionLifecycleService first = transactional(serviceTarget(NOW), afterMethod("resume", race.winner));
            Future<?> winningResume = race.threads.submit(() -> first.resume(subscription, new ResumeSubscriptionRequest(TODAY, "First resume"), user));
            race.winner.awaitEntered();
            SubscriptionLifecycleService second = transactional(serviceTarget(NOW), beforeMethod("resume", race.contender));
            Future<?> repeatedResume = race.threads.submit(() -> {
                ApiException error = assertThrows(ApiException.class,
                    () -> second.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Repeated resume"), user));
                assertEquals("SUBSCRIPTION_NOT_PAUSED", error.getCode());
            });
            race.assertBlocked();
            race.winner.release();
            winningResume.get(10, TimeUnit.SECONDS);
            repeatedResume.get(10, TimeUnit.SECONDS);
        }
        assertEquals("ACTIVE", subscriptionStatus());
        assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
        assertEquals(1, restoreHistoryCount(id));
        assertEquals(2, count("subscription_status_history"));
        assertEquals(1, db.queryForObject("SELECT count(*) FROM subscription_schema.capacity_audit WHERE action = 'CAPACITY_REACQUIRED_ON_RESUME'", Integer.class));
        assertOneDispatch(id);
    }

    @ParameterizedTest
    @ValueSource(strings = {"PAYMENT_FIRST", "RESUME_FIRST"})
    void paymentAndResumeSerializeOnDistinctConnectionsWithoutDeadlock(String order) throws Exception {
        UUID invoice = invoice("PAYMENT_PENDING");
        UUID id = generateAndPause();
        String event = paymentEvent(invoice);
        try (Race race = new Race()) {
            Future<?> winner;
            Future<?> contender;
            if ("PAYMENT_FIRST".equals(order)) {
                var first = transactional(new SubscriptionPaymentStatusService(db, new ObjectMapper(), capacity, new SubscriptionRepository(db)), afterMethod("accept", race.winner));
                winner = race.threads.submit(() -> assertTrue(first.accept(event)));
                race.winner.awaitEntered();
                var second = transactional(serviceTarget(NOW), beforeMethod("resume", race.contender));
                contender = race.threads.submit(() -> second.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Resume after callback"), user));
            } else {
                var first = transactional(serviceTarget(NOW), afterMethod("resume", race.winner));
                winner = race.threads.submit(() -> first.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Resume before callback"), user));
                race.winner.awaitEntered();
                var second = transactional(new SubscriptionPaymentStatusService(db, new ObjectMapper(), capacity, new SubscriptionRepository(db)), beforeMethod("accept", race.contender));
                contender = race.threads.submit(() -> assertTrue(second.accept(event)));
            }
            race.assertBlocked();
            race.winner.release();
            winner.get(10, TimeUnit.SECONDS);
            contender.get(10, TimeUnit.SECONDS);
        }
        assertEquals("ACTIVE", subscriptionStatus());
        assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
        assertEquals("MATERIALIZED", allocationStatus(TODAY));
        assertEquals(id, db.queryForObject("SELECT occurrence_id FROM subscription_schema.subscription_capacity_allocation WHERE service_date = ?", UUID.class, TODAY));
        assertEquals(1, restoreHistoryCount(id));
        assertEquals(1, count("subscription_invoice"));
        assertFalse(payments.accept(event));
        assertOneDispatch(id);
    }

    @Test
    void invoiceLockedBeforeResumeDoesNotInvertCallbackSubscriptionLockOrder() throws Exception {
        UUID invoice = invoice("PAYMENT_PENDING");
        UUID id = generateAndPause();
        String event = paymentEvent(invoice);
        try (Race race = new Race()) {
            var invoiceTransaction = new org.springframework.transaction.support.TransactionTemplate(transactions);
            Future<?> payment = race.threads.submit(() -> invoiceTransaction.executeWithoutResult(status -> {
                db.queryForObject("SELECT id FROM subscription_schema.subscription_invoice WHERE id = ? FOR UPDATE", UUID.class, invoice);
                race.winner.hold();
                assertTrue(payments.accept(event));
            }));
            race.winner.awaitEntered();
            var second = transactional(serviceTarget(NOW), beforeMethod("resume", race.contender));
            Future<?> resuming = race.threads.submit(() -> second.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Resume while invoice locked"), user));
            int otherPid = race.contender.get(10, TimeUnit.SECONDS);
            assertNotEquals(race.winner.entered.get(10, TimeUnit.SECONDS), otherPid);
            // Resume must not acquire invoice locks after taking the subscription lock.
            resuming.get(5, TimeUnit.SECONDS);
            assertEquals("BILLING_PENDING", occurrenceStatus(id));
            race.winner.release();
            payment.get(10, TimeUnit.SECONDS);
        }
        assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
        assertEquals(1, restoreHistoryCount(id));
        assertOneDispatch(id);
    }

    @Test
    void staleGeneratorRejectsRevokedClaimDuringResumeAndPreservesRestoredMeal() throws Exception {
        invoice("PAID");
        ClaimedSubscription stale = generationClaim(TODAY);
        UUID id = generate(generator, stale, NOW.plusSeconds(7 * 3600));
        generator.releaseAndAdvance(stale, TODAY.plusDays(7));
        service.pause(subscription, "Pause generated meal", user);
        try (Race race = new Race()) {
            var first = transactional(serviceTarget(NOW), afterMethod("resume", race.winner));
            Future<?> resuming = race.threads.submit(() -> first.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Concurrent resume"), user));
            race.winner.awaitEntered();
            var second = transactional(new OccurrenceRepository(db), beforeMethod("createOccurrence", race.contender));
            Future<?> replay = race.threads.submit(() -> assertThrows(IllegalStateException.class,
                () -> generate(second, stale, NOW.plusSeconds(7 * 3600))));
            assertNotEquals(race.winner.entered.get(10, TimeUnit.SECONDS), race.contender.get(10, TimeUnit.SECONDS));
            // The committed pause already revoked this token; a stale worker can reject immediately.
            replay.get(5, TimeUnit.SECONDS);
            race.winner.release();
            resuming.get(10, TimeUnit.SECONDS);
        }
        var before = snapshot();
        assertThrows(IllegalStateException.class, () -> generator.releaseAndAdvance(stale, TODAY.plusDays(7)));
        generator.releaseAfterFailure(stale);
        assertEquals(before, snapshot());
        assertEquals(1, count("subscription_occurrence"));
        assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
        assertEquals(1, restoreHistoryCount(id));
        assertOneDispatch(id);
    }

    @Test
    void staleDispatcherCannotReuseClearedPrePauseClaimDuringResume() throws Exception {
        invoice("PAID");
        UUID id = generateCurrent();
        OccurrenceClaim stale = dispatchClaim(id);
        service.pause(subscription, "Pause claimed meal", user);
        try (Race race = new Race()) {
            var first = transactional(serviceTarget(NOW), afterMethod("resume", race.winner));
            Future<?> resuming = race.threads.submit(() -> first.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Concurrent resume"), user));
            race.winner.awaitEntered();
            var second = transactional(new OccurrenceOrderRepository(db), beforeMethod("createRequest", race.contender));
            Future<Boolean> staleDispatch = race.threads.submit(() -> second.createRequest(stale, UUID.randomUUID(), new ObjectMapper().createObjectNode()));
            assertNotEquals(race.winner.entered.get(10, TimeUnit.SECONDS), race.contender.get(10, TimeUnit.SECONDS),
                "Stale dispatch and resume use distinct connections");
            // MVCC sees the already committed CANCELLED row; its predicate can reject without waiting.
            assertFalse(staleDispatch.get(10, TimeUnit.SECONDS));
            race.winner.release();
            resuming.get(10, TimeUnit.SECONDS);
        }
        var before = snapshot();
        dispatch.releaseClaim(stale);
        assertEquals(before, snapshot());
        assertEquals(0, count("subscription_order_request_outbox"));
        assertOneDispatch(id);
    }

    @Test
    void concurrentDispatchersAfterResumeCreateOneOutboxOnActualConnections() throws Exception {
        invoice("PAID");
        UUID id = generateAndPause();
        resume();
        var pids = java.util.concurrent.ConcurrentHashMap.<Integer>newKeySet();
        var barrier = new java.util.concurrent.CyclicBarrier(2);
        var repository = transactional(new OccurrenceOrderRepository(db), invocation -> {
            if (invocation.getMethod().getName().equals("claimReady")) {
                pids.add(db.queryForObject("SELECT pg_backend_pid()", Integer.class));
                barrier.await(10, TimeUnit.SECONDS);
            }
            return invocation.proceed();
        });
        try (ExecutorService threads = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Integer> work = () -> {
                int created = 0;
                for (var claim : repository.claimReady(36500 * 24, 10, 10)) {
                    if (repository.createRequest(claim, UUID.randomUUID(), new ObjectMapper().createObjectNode())) created++;
                }
                return created;
            };
            Future<Integer> first = threads.submit(work);
            Future<Integer> second = threads.submit(work);
            assertEquals(1, first.get(10, TimeUnit.SECONDS) + second.get(10, TimeUnit.SECONDS));
        }
        assertEquals(2, pids.size(), "Competing dispatch claims must use distinct actual connections");
        assertEquals("ORDER_REQUESTED", occurrenceStatus(id));
        assertEquals(1, count("subscription_order_request_outbox"));
        assertEquals(1, restoreHistoryCount(id));
    }

    @ParameterizedTest
    @ValueSource(strings = {"BILLING_PENDING", "PAYMENT_PENDING", "READY_FOR_ORDER", "ORDER_REQUESTED", "ORDER_CREATED", "FAILED"})
    void mixedExistingLiveOrProgressedMealRejectsBroadReacquisition(String status) {
        invoice("PAID");
        generateAndPause();
        db.update("INSERT INTO subscription_schema.subscription_occurrence " +
            "(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,delivery_address_id,service_date,meal_slot_code,service_at,schedule_version,status) " +
            "VALUES (?,?,?,?,?,?,?,'DINNER',?,1,?)", UUID.randomUUID(), subscription, plan, customer, chef, address, TODAY, Timestamp.from(NOW.plusSeconds(12 * 3600)), status);
        assertRejectedUnchanged("SUBSCRIPTION_STATE_CHANGED");
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

    @Test
    void missingInvoiceReentersExistingBillingThenPaymentAndDispatchWithoutDuplicateMeal() throws Exception {
        db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date = ? WHERE id = ?", TODAY, subscription);
        UUID id = generateAndPause();
        resume();
        assertEquals("BILLING_PENDING", occurrenceStatus(id));
        var billingRepository = transactional(new in.craves.subscription.billing.SubscriptionBillingRepository(db));
        var addressChecks = new java.util.concurrent.atomic.AtomicInteger();
        var addressServer = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        addressServer.createContext("/internal/v1/customer-addresses/" + address, exchange -> {
            assertEquals("identityId=" + customer, exchange.getRequestURI().getQuery());
            addressChecks.incrementAndGet();
            var body = new ObjectMapper().createObjectNode().put("id", address.toString())
                .put("identityId", customer.toString()).put("active", true).put("addressLabel", "Home")
                .put("recipientName", "Synthetic Customer").put("contactPhoneNumber", "+919999999999")
                .put("addressLine1", "1 Test Road").put("areaName", "Test Area").put("city", "Hyderabad")
                .put("state", "Telangana").put("postalCode", "500001").put("latitude", 17.385).put("longitude", 78.4867)
                .toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        addressServer.start();
        try {
        var addresses = new in.craves.subscription.address.SubscriptionDeliveryAddressClient(
            "http://127.0.0.1:" + addressServer.getAddress().getPort(), "synthetic-test-internal-secret",
            org.springframework.web.client.RestClient.builder());
        var billing = new in.craves.subscription.billing.SubscriptionBillingService(
            new in.craves.subscription.billing.SubscriptionBillingProperties(), billingRepository, new ObjectMapper(), addresses);
        var generated = billing.generateDueInvoices();
        assertEquals(1, generated.created());
        assertEquals(0, generated.failed());
        assertEquals(1, count("subscription_invoice"));
        assertEquals(1, count("subscription_payment_outbox"));
        UUID invoice = db.queryForObject("SELECT id FROM subscription_schema.subscription_invoice", UUID.class);
        assertTrue(payments.accept(paymentEvent(invoice)));
        assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
        assertEquals(0, billing.generateDueInvoices().created());
        assertEquals(1, count("subscription_occurrence"));
        assertOneDispatch(id);
        assertEquals(1, addressChecks.get());
        } finally { addressServer.stop(0); }
    }

    @Test
    void multipleMealsAndItemsRestoreAtomicallyWithOriginalSnapshotsAndCapacityLinks() {
        invoice("PAID");
        UUID otherItem = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule_item " +
            "(id,plan_id,menu_item_id,quantity,iso_day_of_week,sequence_number,meal_slot_code,service_time) VALUES (?,?,?,2,?,2,'LUNCH','12:30')",
            UUID.randomUUID(), plan, otherItem, TODAY.getDayOfWeek().getValue());
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule_item " +
            "(id,plan_id,menu_item_id,quantity,iso_day_of_week,sequence_number,meal_slot_code,service_time) VALUES (?,?,?,1,?,1,'DINNER','19:30')",
            UUID.randomUUID(), plan, menuItem, TODAY.getDayOfWeek().getValue());
        capacityRepository.upsertMenuRule(chef, otherItem, TODAY.getDayOfWeek().getValue(), "LUNCH", 100, true, chef);
        capacityRepository.upsertSlotRule(chef, TODAY.getDayOfWeek().getValue(), "DINNER", 100, 100, true, chef);
        capacityRepository.upsertMenuRule(chef, menuItem, TODAY.getDayOfWeek().getValue(), "DINNER", 100, true, chef);
        capacityRepository.upsertAllocation(subscription, chef, TODAY, "LUNCH", otherItem, 2, "COMMITTED", null);
        capacityRepository.upsertAllocation(subscription, chef, TODAY, "DINNER", menuItem, 1, "COMMITTED", null);
        ClaimedSubscription claim = generationClaim(TODAY);
        var schedule = generator.findActiveSchedule(plan).orElseThrow();
        UUID lunch = generate(generator, claim, NOW.plusSeconds(7 * 3600));
        UUID dinner = generator.createOccurrence(claim, schedule, TODAY, "DINNER", NOW.plusSeconds(14 * 3600),
            schedule.items().stream().filter(item -> "DINNER".equals(item.mealSlotCode())).toList(), null);
        generator.releaseAndAdvance(claim, TODAY.plusDays(7));
        var lunchSnapshot = immutableArtifacts(lunch);
        var dinnerSnapshot = immutableArtifacts(dinner);
        service.pause(subscription, "Pause both meals", user);
        resume();
        assertEquals(lunchSnapshot, immutableArtifacts(lunch));
        assertEquals(dinnerSnapshot, immutableArtifacts(dinner));
        for (UUID id : List.of(lunch, dinner)) {
            assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
            assertEquals(1, restoreHistoryCount(id));
            var dispatchClaim = dispatchClaim(id);
            assertTrue(dispatch.createRequest(dispatchClaim, UUID.randomUUID(), new ObjectMapper().createObjectNode()));
        }
        assertEquals(2, count("subscription_occurrence"));
        assertEquals(3, count("subscription_occurrence_item"));
        assertEquals(3, db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_capacity_allocation WHERE service_date = ? AND status = 'MATERIALIZED'", Integer.class, TODAY));
        assertEquals(2, count("subscription_order_request_outbox"));
    }

    @Test
    void oneUnsafeCandidateRollsBackAllOtherSafeMeals() {
        invoice("PAID");
        ClaimedSubscription claim = generationClaim(TODAY);
        UUID first = generate(generator, claim, NOW.plusSeconds(7 * 3600));
        LocalDate following = TODAY.plusDays(7);
        generator.releaseAndAdvance(claim, following);
        ClaimedSubscription followingClaim = generator.claimDue(36500, 10, 10).getFirst();
        UUID second = generator.createOccurrence(followingClaim, generator.findActiveSchedule(plan).orElseThrow(), following, "LUNCH", NOW.plusSeconds(7L * 86400 + 7 * 3600),
            generator.findActiveSchedule(plan).orElseThrow().items(), null);
        generator.releaseAndAdvance(followingClaim, following.plusDays(7));
        service.pause(subscription, "Pause both dates", user);
        db.update("UPDATE subscription_schema.subscription_occurrence SET order_requested_at = now() WHERE id = ?", second);
        assertRejectedUnchanged("SUBSCRIPTION_STATE_CHANGED");
        assertEquals("CANCELLED", occurrenceStatus(first));
        assertEquals(0, restoreHistoryCount(first));
    }

    @Test
    void pauseCommitsFirstAndWaitingResumeRestoresItsExactNewPause() throws Exception {
        invoice("PAID");
        UUID id = generateCurrent();
        try (Race race = new Race()) {
            var first = transactional(serviceTarget(NOW), afterMethod("pause", race.winner));
            Future<?> pausing = race.threads.submit(() -> first.pause(subscription, "Concurrent customer pause", user));
            race.winner.awaitEntered();
            var second = transactional(serviceTarget(NOW), beforeMethod("resume", race.contender));
            Future<?> resuming = race.threads.submit(() -> second.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Concurrent customer resume"), user));
            race.assertBlocked();
            race.winner.release();
            pausing.get(10, TimeUnit.SECONDS);
            resuming.get(10, TimeUnit.SECONDS);
        }
        assertEquals("ACTIVE", subscriptionStatus());
        assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
        assertEquals(1, restoreHistoryCount(id));
        assertEquals(2, count("subscription_status_history"));
    }

    @Test
    void pauseDuringResumeUsesOnlyCommittedStateOrWaitsForTheLifecycleLock() throws Exception {
        invoice("PAID");
        UUID id = generateAndPause();
        boolean pauseCommitted;
        try (Race race = new Race()) {
            var first = transactional(serviceTarget(NOW), afterMethod("resume", race.winner));
            Future<?> resuming = race.threads.submit(() -> first.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Resume first"), user));
            race.winner.awaitEntered();
            var second = transactional(serviceTarget(NOW), beforeMethod("pause", race.contender));
            Future<Boolean> pausing = race.threads.submit(() -> {
                try {
                    second.pause(subscription, "Pause during resume", user);
                    return true;
                } catch (ApiException error) {
                    assertEquals("SUBSCRIPTION_NOT_ACTIVE", error.getCode());
                    return false;
                }
            });
            int holdingPid = race.winner.entered.get(10, TimeUnit.SECONDS);
            int waitingPid = race.contender.get(10, TimeUnit.SECONDS);
            assertNotEquals(holdingPid, waitingPid);
            // Standalone main rejects committed PAUSED immediately. CP01's stricter lifecycle
            // lock may wait instead, then pause the ACTIVE state after resume commits.
            boolean observedSafeOrdering = false;
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                if (pausing.isDone()) {
                    assertFalse(pausing.get(10, TimeUnit.SECONDS), "Pause cannot succeed against uncommitted ACTIVE state");
                    observedSafeOrdering = true;
                    break;
                }
                if (Boolean.TRUE.equals(db.queryForObject("SELECT ? = ANY(pg_blocking_pids(?))", Boolean.class, holdingPid, waitingPid))) {
                    observedSafeOrdering = true;
                    break;
                }
                Thread.sleep(10);
            }
            assertTrue(observedSafeOrdering, "Pause must reject the committed PAUSED state or wait on resume's actual lock");
            race.winner.release();
            resuming.get(10, TimeUnit.SECONDS);
            pauseCommitted = pausing.get(10, TimeUnit.SECONDS);
        }
        assertEquals(1, restoreHistoryCount(id));
        if (!pauseCommitted) {
            assertEquals("ACTIVE", subscriptionStatus());
            assertEquals("READY_FOR_ORDER", occurrenceStatus(id));
            service.pause(subscription, "Retry customer pause after resume commits", user);
        }
        assertEquals("PAUSED", subscriptionStatus());
        assertEquals("CANCELLED", occurrenceStatus(id));
        assertEquals("RELEASED", allocationStatus(TODAY));
        assertEquals(3, count("subscription_status_history"));
        assertEquals(1, restoreHistoryCount(id));
        assertEquals(0, count("subscription_order_request_outbox"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"CANCEL_FIRST", "RESUME_FIRST"})
    void cancellationAndResumeSerializeWithoutResurrectingCancelledSubscription(String order) throws Exception {
        invoice("PAID");
        UUID id = generateAndPause();
        try (Race race = new Race()) {
            Future<?> winner;
            Future<?> contender;
            if ("CANCEL_FIRST".equals(order)) {
                var first = transactional(serviceTarget(NOW), afterMethod("cancel", race.winner));
                winner = race.threads.submit(() -> first.cancel(subscription, "Cancel first", user));
                race.winner.awaitEntered();
                var second = transactional(serviceTarget(NOW), beforeMethod("resume", race.contender));
                contender = race.threads.submit(() -> {
                    ApiException error = assertThrows(ApiException.class,
                        () -> second.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Resume after cancel"), user));
                    assertEquals("SUBSCRIPTION_NOT_PAUSED", error.getCode());
                });
            } else {
                var first = transactional(serviceTarget(NOW), afterMethod("resume", race.winner));
                winner = race.threads.submit(() -> first.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Resume first"), user));
                race.winner.awaitEntered();
                var second = transactional(serviceTarget(NOW), beforeMethod("cancel", race.contender));
                contender = race.threads.submit(() -> second.cancel(subscription, "Cancel after resume", user));
            }
            race.assertBlocked();
            race.winner.release();
            winner.get(10, TimeUnit.SECONDS);
            contender.get(10, TimeUnit.SECONDS);
        }
        assertEquals("CANCELLED", subscriptionStatus());
        assertEquals("CANCELLED", occurrenceStatus(id));
        assertNull(cursor());
        assertEquals("RELEASED", allocationStatus(TODAY));
        assertEquals(0, count("subscription_order_request_outbox"));
        assertEquals("CANCEL_FIRST".equals(order) ? 0 : 1, restoreHistoryCount(id));
    }

    @ParameterizedTest
    @ValueSource(strings = {"VERSION", "TIME"})
    void scheduleChangedOnAnotherConnectionAfterReacquireRejectsAndRollsBack(String drift) throws Exception {
        invoice("PAID");
        generateAndPause();
        var before = snapshot();
        try (Race race = new Race()) {
            capacity = capacityService(afterMethod("reacquireForResume", race.winner));
            service = lifecycleService(NOW);
            Future<?> resuming = race.threads.submit(() -> {
                ApiException error = assertThrows(ApiException.class, this::resume);
                assertEquals("SUBSCRIPTION_STATE_CHANGED", error.getCode());
            });
            race.winner.awaitEntered();
            var tx = new org.springframework.transaction.support.TransactionTemplate(transactions);
            int editingPid = tx.execute(status -> {
                int pid = db.queryForObject("SELECT pg_backend_pid()", Integer.class);
                if ("VERSION".equals(drift)) db.update("UPDATE subscription_schema.subscription_plan_schedule SET version = version + 1 WHERE plan_id = ?", plan);
                else db.update("UPDATE subscription_schema.subscription_plan_schedule_item SET service_time = '13:30' WHERE plan_id = ?", plan);
                return pid;
            });
            assertNotEquals(race.winner.entered.get(10, TimeUnit.SECONDS), editingPid);
            race.winner.release();
            resuming.get(10, TimeUnit.SECONDS);
        }
        assertEquals(before, snapshot(), "Concurrent schedule change must survive but no partial resume artifacts may survive");
    }

    @Test
    void eligiblePauseAlongsideExplicitCancellationRejectsWithoutReallocatingEitherMeal() {
        invoice("PAID");
        ClaimedSubscription claim = generationClaim(TODAY);
        UUID first = generate(generator, claim, NOW.plusSeconds(7 * 3600));
        generator.releaseAndAdvance(claim, TODAY.plusDays(7));
        ClaimedSubscription followingClaim = generator.claimDue(36500, 10, 10).getFirst();
        UUID cancelled = generator.createOccurrence(followingClaim, generator.findActiveSchedule(plan).orElseThrow(), TODAY.plusDays(7), "LUNCH",
            NOW.plusSeconds(7L * 86400 + 7 * 3600), generator.findActiveSchedule(plan).orElseThrow().items(), null);
        generator.releaseAndAdvance(followingClaim, TODAY.plusDays(14));
        service.pause(subscription, "Pause both original meals", user);
        copyOccurrenceHistory(cancelled, "CUSTOMER_CANCEL", "created_at + INTERVAL '1 second'");
        assertRejectedUnchanged("SUBSCRIPTION_STATE_CHANGED");
        assertEquals("CANCELLED", occurrenceStatus(first));
        assertEquals("CANCELLED", occurrenceStatus(cancelled));
        assertEquals(0, restoreHistoryCount(first));
    }

    private void resume() {
        service.resume(subscription, new ResumeSubscriptionRequest(TODAY, "Customer test resume"), user);
    }

    private UUID generateCurrent() {
        ClaimedSubscription claim = generationClaim(TODAY);
        UUID id = generate(generator, claim, NOW.plusSeconds(7 * 3600));
        generator.releaseAndAdvance(claim, TODAY.plusDays(7));
        return id;
    }

    private UUID generateAndPause() {
        UUID id = generateCurrent();
        service.pause(subscription, "Customer test pause", user);
        assertEquals("CANCELLED", occurrenceStatus(id));
        return id;
    }

    private void assertRejectedUnchanged(String code) {
        var before = snapshot();
        ApiException error = assertThrows(ApiException.class, this::resume);
        assertEquals(409, error.getStatus());
        if (code != null) assertEquals(code, error.getCode());
        assertEquals(before, snapshot(), "Rejected resume must not change any lifecycle, capacity, billing or outbox artifact");
    }

    private int restoreHistoryCount(UUID id) {
        return db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id = ? AND source = 'CUSTOMER_RESUME'", Integer.class, id);
    }

    private List<List<String>> immutableArtifacts(UUID id) {
        var rows = new java.util.ArrayList<List<String>>();
        rows.add(db.queryForList("SELECT (to_jsonb(t) - ARRAY['status','updated_at','order_dispatch_lock_token','order_dispatch_locked_at'])::text " +
            "FROM subscription_schema.subscription_occurrence t WHERE id = ?", String.class, id));
        rows.addAll(tableRows(List.of("subscription_occurrence_item", "subscription_plan_schedule", "subscription_plan_schedule_item", "subscription_invoice", "subscription_invoice_history", "subscription_payment_outbox")));
        return rows;
    }

    private void copyOccurrenceHistory(UUID id, String source, String timeExpression) {
        db.update("INSERT INTO subscription_schema.subscription_occurrence_history " +
            "(id, occurrence_id, old_status, new_status, reason, actor_identity_id, source, created_at) " +
            "SELECT ?, occurrence_id, old_status, new_status, reason, actor_identity_id, ?, " + timeExpression +
            " FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id = ? AND source = 'CUSTOMER_PAUSE'", UUID.randomUUID(), source, id);
    }

    private UUID otherPlan() {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_plan (id, plan_code, chef_identity_id, name, billing_period, amount) " +
            "VALUES (?, ?, ?, 'Other test plan', 'MONTHLY', 300)", id, "OTHER-" + id, chef);
        return id;
    }

    private UUID invoiceRange(LocalDate from, LocalDate until, String state) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_invoice " +
            "(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,cycle_start,cycle_end,amount,currency,status) " +
            "VALUES (?,?,?,?,?,?,?,300,'INR',?)", id, subscription, plan, customer, chef, from, until, state);
        return id;
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

    private void assertOneDispatch(UUID id) {
        var claim = dispatchClaim(id);
        assertTrue(dispatch.createRequest(claim, UUID.randomUUID(), new ObjectMapper().createObjectNode()));
        assertFalse(dispatch.createRequest(claim, UUID.randomUUID(), new ObjectMapper().createObjectNode()));
        assertEquals(1, count("subscription_order_request_outbox"));
        assertEquals(id, db.queryForObject("SELECT aggregate_id FROM subscription_schema.subscription_order_request_outbox", UUID.class));
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

    private OccurrenceClaim dispatchClaim(UUID occurrenceId) {
        db.update("UPDATE subscription_schema.subscription_occurrence SET order_dispatch_lock_token = NULL, " +
            "order_dispatch_locked_at = NULL WHERE id = ?", occurrenceId);
        return dispatch.claimReady(36500 * 24, 10, 10).stream()
            .filter(claim -> claim.occurrenceId().equals(occurrenceId)).findFirst().orElseThrow();
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
