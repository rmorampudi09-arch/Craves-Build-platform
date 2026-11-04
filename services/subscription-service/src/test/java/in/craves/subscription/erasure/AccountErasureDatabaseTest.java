package in.craves.subscription.erasure;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import in.craves.subscription.billing.SubscriptionBillingProperties;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.credit.DayCreditRepository;
import in.craves.subscription.credit.DayCreditService;
import in.craves.subscription.erasure.AccountErasureDtos.Blocker;
import in.craves.subscription.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.subscription.erasure.AccountErasureDtos.Scope;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository;
import in.craves.subscription.lifecycle.SubscriptionLifecycleService;
import in.craves.subscription.occurrence.OccurrenceRepository;
import in.craves.subscription.policy.SubscriptionPolicyRepository;
import in.craves.subscription.repository.PostgresCompatibleSubscriptionRepository;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Account deletion in subscription-service: plans end the way a customer's own cancel ends them, then free text is blanked. */
@EnabledIfEnvironmentVariable(named = "SUBSCRIPTION_TEST_JDBC_URL", matches = ".+")
@ResourceLock("disposable-subscription-migration-schema")
class AccountErasureDatabaseTest {
    JdbcTemplate db;
    CapacityService capacity;
    AccountErasureService service;
    UUID customer = UUID.randomUUID(), chef = UUID.randomUUID(), request = UUID.randomUUID();
    UUID plan = UUID.randomUUID();

    @BeforeEach
    void setup() {
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url = System.getenv("SUBSCRIPTION_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("SUBSCRIPTION_TEST_DB_USER"), System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        db = new JdbcTemplate(ds);
        assertEquals("subscription_schema_test", db.queryForObject("SELECT current_database()", String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");
        db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(ds).defaultSchema("public").table("subscription_service_flyway_schema_history")
            .locations("classpath:db/migration").load().migrate();
        capacity = mock(CapacityService.class);
        SubscriptionLifecycleService lifecycle = new SubscriptionLifecycleService(
            new SubscriptionLifecycleRepository(db), new SubscriptionPolicyRepository(db), new PostgresCompatibleSubscriptionRepository(db),
            capacity, new SubscriptionBillingProperties(),
            new DayCreditService(new DayCreditRepository(db), new SubscriptionBillingRepository(db), new OccurrenceRepository(db), false, Clock.systemUTC())
        );
        service = new AccountErasureService(db, lifecycle);
        addPlan(plan, chef, "ACTIVE", true);
    }

    void addPlan(UUID id, UUID owner, String status, boolean cancelEnabled) {
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount,status) "
            + "VALUES (?,?,?,'TEST plan','MONTHLY',2800,?)", id, "TEST-" + id, owner, status);
        // Cancel is allowed up to the next meal (cutoff 0) unless the admin policy switches it off.
        db.update("INSERT INTO subscription_schema.subscription_plan_policy(id,plan_id,version,status,customer_pause_enabled,"
            + "customer_resume_enabled,customer_cancel_enabled,customer_skip_enabled,pause_cutoff_minutes,resume_lead_minutes,"
            + "cancel_cutoff_minutes,skip_cutoff_minutes,created_by_identity_id,activated_at) "
            + "VALUES (?,?,1,'ACTIVE',true,true,?,true,0,1440,?,1440,?,now())",
            UUID.randomUUID(), id, cancelEnabled, cancelEnabled ? 0 : null, owner);
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule(plan_id,recurrence_type,timezone,service_time,"
            + "generation_lead_hours,status,created_by_identity_id,activated_at) VALUES (?,'WEEKLY','Asia/Kolkata','12:00',24,'ACTIVE',?,now())",
            id, owner);
    }

    UUID subscribe(UUID owner, UUID onPlan, String status, String notes) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,"
            + "start_date,next_service_date,next_billing_date,notes) VALUES (?,?,?,(SELECT chef_identity_id FROM subscription_schema.subscription_plan WHERE id=?),?,?,?,?,?)",
            id, owner, onPlan, onPlan, status, LocalDate.now().minusDays(5), LocalDate.now().minusDays(1), LocalDate.now().plusDays(20), notes);
        return id;
    }

    void invoice(UUID subscription, UUID onPlan, String status) {
        db.update("INSERT INTO subscription_schema.subscription_invoice(id,subscription_id,plan_id,customer_identity_id,cycle_start,cycle_end,"
            + "amount,currency,status) VALUES (?,?,?,?,?,?,2800,'INR',?)",
            UUID.randomUUID(), subscription, onPlan, customer, LocalDate.now().minusDays(5), LocalDate.now().plusDays(23), status);
    }

    String status(UUID subscription) {
        return db.queryForObject("SELECT status FROM subscription_schema.customer_subscription WHERE id=?", String.class, subscription);
    }

    String notes(UUID subscription) {
        return db.queryForObject("SELECT notes FROM subscription_schema.customer_subscription WHERE id=?", String.class, subscription);
    }

    void history(UUID subscription, UUID actor, String reason) {
        db.update("INSERT INTO subscription_schema.subscription_status_history(subscription_id,old_status,new_status,reason,actor_identity_id,created_at) "
            + "VALUES (?,'ACTIVE','CANCELLED',?,?,clock_timestamp())", subscription, reason, actor);
    }

    Timestamp updatedAt(UUID subscription) {
        return db.queryForObject("SELECT updated_at FROM subscription_schema.customer_subscription WHERE id=?", Timestamp.class, subscription);
    }

    int count(String sql, Object... args) {
        return db.queryForObject("SELECT count(*) FROM " + sql, Integer.class, args);
    }

    List<String> codes(List<Blocker> blockers) {
        return blockers.stream().map(Blocker::code).sorted().toList();
    }

    @Test
    void prepareCustomerCancelsActiveSubscriptionsUnderNormalRules() {
        UUID active = subscribe(customer, plan, "ACTIVE", null);
        UUID paused = subscribe(customer, plan, "PAUSED", null);
        UUID alreadyCancelled = subscribe(customer, plan, "CANCELLED", null);
        UUID someoneElse = subscribe(UUID.randomUUID(), plan, "ACTIVE", null);
        UUID meal = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_occurrence(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,"
            + "delivery_address_id,service_date,service_at,schedule_version,status,meal_slot_code) "
            + "VALUES (?,?,?,?,?,?,?,now() + interval '3 days',1,'BILLING_PENDING','LUNCH')",
            meal, active, plan, customer, chef, UUID.randomUUID(), LocalDate.now().plusDays(3));

        ErasureResponse done = service.prepare(customer, Scope.CUSTOMER, request);

        assertEquals("DONE", done.status());
        assertEquals(2, done.counts().get("customer_subscription"));
        assertEquals("CANCELLED", status(active));
        assertEquals("CANCELLED", status(paused));
        assertEquals("CANCELLED", status(alreadyCancelled));
        assertEquals("ACTIVE", status(someoneElse));
        // The same rows a customer's own cancel writes: history with the customer as actor, undispatched meals cancelled.
        assertEquals(1, count("subscription_schema.subscription_status_history WHERE subscription_id=? AND old_status='ACTIVE' "
            + "AND new_status='CANCELLED' AND actor_identity_id=?", active, customer));
        assertEquals(1, count("subscription_schema.subscription_status_history WHERE subscription_id=? AND old_status='PAUSED' "
            + "AND new_status='CANCELLED'", paused));
        assertEquals("CANCELLED", db.queryForObject("SELECT status FROM subscription_schema.subscription_occurrence WHERE id=?", String.class, meal));
        verify(capacity, times(2)).releaseForPauseOrTerminal(any(), any(), any());
        // A cancel offers no day credit or refund choice in this service, so none appears.
        assertEquals(0, count("subscription_schema.subscription_day_credit"));

        assertEquals(0, service.prepare(customer, Scope.CUSTOMER, request).counts().get("customer_subscription"));
    }

    @Test
    void prepareCancelsWhatItCanAndReportsThePlanThatRefusesCancellation() {
        UUID strictPlan = UUID.randomUUID();
        addPlan(strictPlan, chef, "ACTIVE", false);
        UUID refused = subscribe(customer, strictPlan, "PAUSED", null);
        UUID cancelled = subscribe(customer, plan, "PAUSED", null);

        ApiException failure = assertThrows(ApiException.class, () -> service.prepare(customer, Scope.CUSTOMER, request));

        assertEquals("SUBSCRIPTION_CANCEL_DISABLED", failure.getCode());
        assertEquals("PAUSED", status(refused));
        assertEquals("CANCELLED", status(cancelled));
    }

    @Test
    void prepareAllClosesTheChefsPlansEvenWhenACustomerCancelIsRefused() {
        // One person who runs a plan and also subscribes to another chef's plan that cannot be cancelled.
        UUID strictPlan = UUID.randomUUID();
        addPlan(strictPlan, UUID.randomUUID(), "ACTIVE", false);
        UUID refused = subscribe(chef, strictPlan, "PAUSED", null);

        ApiException failure = assertThrows(ApiException.class, () -> service.prepare(chef, Scope.ALL, request));

        assertEquals("SUBSCRIPTION_CANCEL_DISABLED", failure.getCode());
        assertEquals("PAUSED", status(refused));
        assertEquals(0, count("subscription_schema.subscription_plan WHERE chef_identity_id=? AND accepting_subscribers", chef));
    }

    @Test
    void prepareChefStopsNewSubscribers() {
        UUID draft = UUID.randomUUID();
        addPlan(draft, chef, "DRAFT", true);
        UUID otherChefPlan = UUID.randomUUID();
        addPlan(otherChefPlan, UUID.randomUUID(), "ACTIVE", true);

        assertEquals(0, service.prepare(chef, Scope.CUSTOMER, request).counts().getOrDefault("subscription_plan", 0));
        assertEquals(2, count("subscription_schema.subscription_plan WHERE chef_identity_id=? AND accepting_subscribers", chef));

        ErasureResponse done = service.prepare(chef, Scope.CHEF, request);

        assertEquals(2, done.counts().get("subscription_plan"));
        assertEquals(0, count("subscription_schema.subscription_plan WHERE chef_identity_id=? AND accepting_subscribers", chef));
        assertEquals("ACTIVE", db.queryForObject("SELECT status FROM subscription_schema.subscription_plan WHERE id=?", String.class, plan));
        assertEquals("DRAFT", db.queryForObject("SELECT status FROM subscription_schema.subscription_plan WHERE id=?", String.class, draft));
        assertEquals(Boolean.TRUE, db.queryForObject("SELECT accepting_subscribers FROM subscription_schema.subscription_plan WHERE id=?", Boolean.class, otherChefPlan));
        assertEquals(2, count("subscription_schema.subscription_plan_audit WHERE actor_identity_id=? AND action='CHEF_ACCEPTING_OFF'", chef));
        assertEquals(0, service.prepare(chef, Scope.CHEF, request).counts().get("subscription_plan"));
    }

    @Test
    void eraseCustomerAnonymisesNotesAndSkipReasons() {
        UUID mine = subscribe(customer, plan, "CANCELLED", "Ring the bell, flat 4B, call 9876543210");
        UUID theirs = subscribe(UUID.randomUUID(), plan, "ACTIVE", "Not mine");
        UUID withoutNotes = subscribe(customer, plan, "CANCELLED", null);
        invoice(mine, plan, "PAID");
        db.update("INSERT INTO subscription_schema.subscription_status_history(subscription_id,old_status,new_status,reason,actor_identity_id) "
            + "VALUES (?,'ACTIVE','CANCELLED','Moving house',?)", mine, customer);
        db.update("INSERT INTO subscription_schema.subscription_skip_request(id,subscription_id,service_date,status,reason,actor_identity_id) "
            + "VALUES (?,?,?,'REQUESTED','Out of town at my mother''s',?)", UUID.randomUUID(), mine, LocalDate.now().plusDays(2), customer);
        String invoicesBefore = db.queryForObject("SELECT jsonb_agg(to_jsonb(i) ORDER BY id)::text FROM subscription_schema.subscription_invoice i", String.class);
        String historyBefore = db.queryForObject("SELECT jsonb_agg(to_jsonb(h) - 'reason' ORDER BY id)::text FROM subscription_schema.subscription_status_history h", String.class);
        String planBefore = db.queryForObject("SELECT to_jsonb(p)::text FROM subscription_schema.subscription_plan p WHERE id=?", String.class, plan);
        Timestamp touchedBefore = updatedAt(mine), untouchedBefore = updatedAt(withoutNotes);

        ErasureResponse done = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals("DONE", done.status());
        assertEquals(Map.of("customer_subscription", 1, "subscription_skip_request", 1, "subscription_status_history", 1), done.counts());
        assertEquals(AccountErasureService.ERASED_TEXT, notes(mine));
        assertEquals(AccountErasureService.ERASED_TEXT, db.queryForObject(
            "SELECT reason FROM subscription_schema.subscription_skip_request WHERE subscription_id=?", String.class, mine));
        assertNull(notes(withoutNotes));
        assertTrue(updatedAt(mine).after(touchedBefore), "a changed row says when it changed");
        assertEquals(untouchedBefore, updatedAt(withoutNotes));
        assertEquals("Not mine", notes(theirs));
        assertEquals(invoicesBefore, db.queryForObject("SELECT jsonb_agg(to_jsonb(i) ORDER BY id)::text FROM subscription_schema.subscription_invoice i", String.class));
        assertEquals(historyBefore, db.queryForObject("SELECT jsonb_agg(to_jsonb(h) - 'reason' ORDER BY id)::text FROM subscription_schema.subscription_status_history h", String.class));
        // A dual-role chef who erases the customer side keeps the meal plans they run.
        assertEquals(planBefore, db.queryForObject("SELECT to_jsonb(p)::text FROM subscription_schema.subscription_plan p WHERE id=?", String.class, plan));
    }

    @Test
    void eraseBlanksOnlyWhatTheCustomerTypedInStatusHistory() {
        UUID mine = subscribe(customer, plan, "CANCELLED", null);
        UUID other = UUID.randomUUID();
        UUID theirs = subscribe(other, plan, "CANCELLED", null);
        history(mine, customer, "Moving to Pune, call 9876543210");
        history(mine, customer, AccountErasureService.DELETION_CANCEL_REASON);
        history(mine, null, "Provider status FAILED");
        history(mine, chef, "Admin note");
        history(theirs, other, "Their own words");

        ErasureResponse done = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals(1, done.counts().get("subscription_status_history"));
        assertEquals(List.of(AccountErasureService.ERASED_TEXT, AccountErasureService.DELETION_CANCEL_REASON, "Provider status FAILED", "Admin note"),
            db.queryForList("SELECT reason FROM subscription_schema.subscription_status_history WHERE subscription_id=? ORDER BY created_at, id", String.class, mine));
        assertEquals(List.of("Their own words"),
            db.queryForList("SELECT reason FROM subscription_schema.subscription_status_history WHERE subscription_id=?", String.class, theirs));
        assertEquals(0, service.erase(customer, Scope.CUSTOMER, request).counts().get("subscription_status_history"));
    }

    @Test
    void eraseIsBlockedWhileAnInvoiceIsUnpaid() {
        UUID mine = subscribe(customer, plan, "CANCELLED", "Leave at the gate");
        invoice(mine, plan, "PAYMENT_PENDING");
        db.update("INSERT INTO subscription_schema.subscription_day_credit(id,subscription_id,kind,first_date,last_date,status,choice_deadline) "
            + "VALUES (?,?,'DECLINE',?,?,'PENDING_CHOICE',now() + interval '2 days')", UUID.randomUUID(), mine, LocalDate.now(), LocalDate.now());

        assertEquals(List.of("DAY_CREDIT_CHOICE_PENDING", "SUBSCRIPTION_UNPAID_INVOICE"), codes(service.blockers(customer, Scope.CUSTOMER)));
        assertEquals(List.of(), service.blockers(customer, Scope.CHEF));
        ErasureResponse blocked = service.erase(customer, Scope.ALL, request);

        assertEquals("BLOCKED", blocked.status());
        assertNull(blocked.counts());
        assertEquals(List.of("DAY_CREDIT_CHOICE_PENDING", "SUBSCRIPTION_UNPAID_INVOICE"), codes(blocked.blockers()));
        assertEquals("Leave at the gate", notes(mine));
    }

    @Test
    void eraseIsBlockedWhileASubscriptionIsStillActive() {
        UUID active = subscribe(customer, plan, "ACTIVE", "Leave at the gate");
        subscribe(customer, plan, "PAUSED", null);
        subscribe(customer, plan, "PENDING_PAYMENT", null);
        subscribe(customer, plan, "PAYMENT_FAILED", null);
        subscribe(customer, plan, "EXPIRED", null);
        subscribe(UUID.randomUUID(), plan, "ACTIVE", null);

        assertEquals(List.of("SUBSCRIPTION_STILL_ACTIVE"), codes(service.blockers(customer, Scope.CUSTOMER)));
        assertEquals(List.of("SUBSCRIPTION_STILL_ACTIVE"), codes(service.blockers(customer, Scope.ALL)));
        assertEquals("4 meal plan subscription(s) are still running", service.blockers(customer, Scope.CUSTOMER).get(0).detail());
        assertEquals(List.of(), service.blockers(customer, Scope.CHEF));
        ErasureResponse blocked = service.erase(customer, Scope.ALL, request);

        assertEquals("BLOCKED", blocked.status());
        assertEquals(List.of("SUBSCRIPTION_STILL_ACTIVE"), codes(blocked.blockers()));
        assertEquals("Leave at the gate", notes(active));

        // Once prepare has cancelled the plans that can be cancelled and the rest have ended, erase goes through.
        db.update("UPDATE subscription_schema.customer_subscription SET status = 'CANCELLED' WHERE customer_identity_id = ?", customer);
        assertEquals(List.of(), service.blockers(customer, Scope.CUSTOMER));
        assertEquals("DONE", service.erase(customer, Scope.CUSTOMER, request).status());
        assertEquals(AccountErasureService.ERASED_TEXT, notes(active));
    }

    @Test
    void eraseChefIsBlockedWhileAnySubscriberRemainsThenDeactivatesThePlans() {
        UUID subscriber = subscribe(customer, plan, "PAYMENT_FAILED", null);
        subscribe(UUID.randomUUID(), plan, "EXPIRED", null);

        assertEquals(List.of("PLAN_HAS_ACTIVE_SUBSCRIBERS"), codes(service.blockers(chef, Scope.CHEF)));
        assertEquals(List.of("PLAN_HAS_ACTIVE_SUBSCRIBERS"), codes(service.blockers(chef, Scope.ALL)));
        assertEquals(List.of(), service.blockers(chef, Scope.CUSTOMER));
        assertEquals("BLOCKED", service.erase(chef, Scope.CHEF, request).status());
        assertEquals("ACTIVE", db.queryForObject("SELECT status FROM subscription_schema.subscription_plan WHERE id=?", String.class, plan));

        db.update("UPDATE subscription_schema.customer_subscription SET status='CANCELLED' WHERE id=?", subscriber);
        ErasureResponse done = service.erase(chef, Scope.CHEF, request);

        assertEquals("DONE", done.status());
        assertEquals(Map.of("subscription_plan", 1), done.counts());
        assertEquals("INACTIVE", db.queryForObject("SELECT status FROM subscription_schema.subscription_plan WHERE id=?", String.class, plan));
        assertEquals(Boolean.FALSE, db.queryForObject("SELECT accepting_subscribers FROM subscription_schema.subscription_plan WHERE id=?", Boolean.class, plan));
        assertEquals(1, count("subscription_schema.subscription_plan_audit WHERE plan_id=? AND action='ACCOUNT_ERASURE' AND old_status='ACTIVE' AND new_status='INACTIVE'", plan));
    }

    @Test
    void eraseTwiceIsDoneWithZeroCounts() {
        subscribe(customer, plan, "CANCELLED", "Ring twice");
        for (Scope scope : Scope.values()) {
            service.erase(customer, scope, request);
            service.erase(chef, scope, request);
            ErasureResponse again = service.erase(customer, scope, request);
            ErasureResponse chefAgain = service.erase(chef, scope, request);
            assertEquals("DONE", again.status());
            assertEquals("DONE", chefAgain.status());
            assertTrue(again.counts().values().stream().allMatch(n -> n == 0), again.counts().toString());
            assertTrue(chefAgain.counts().values().stream().allMatch(n -> n == 0), chefAgain.counts().toString());
        }
    }

    /** Writes the audit row prepare's close statement writes, at a chosen time, so the order of changes is under the test's control. */
    void audit(UUID onPlan, String action, String reason, int minutesFromNow) {
        db.update("INSERT INTO subscription_schema.subscription_plan_audit(id,plan_id,actor_identity_id,action,old_status,new_status,reason,created_at) "
            + "VALUES (?,?,?,?,'ACTIVE','ACTIVE',?, now() + make_interval(mins => ?))", UUID.randomUUID(), onPlan, chef, action, reason, minutesFromNow);
    }

    boolean accepting(UUID onPlan) {
        return db.queryForObject("SELECT accepting_subscribers FROM subscription_schema.subscription_plan WHERE id=?", Boolean.class, onPlan);
    }

    @Test
    void releaseReopensOnlyThePlansPrepareClosed() {
        // A plan the chef had closed before the request, a plan prepare closes, and a plan closed by prepare that the chef then closed again by hand.
        UUID closedByChef = UUID.randomUUID(), closedAgainByChef = UUID.randomUUID(), neverAudited = UUID.randomUUID();
        addPlan(closedByChef, chef, "ACTIVE", true);
        addPlan(closedAgainByChef, chef, "ACTIVE", true);
        addPlan(neverAudited, chef, "ACTIVE", true);
        db.update("UPDATE subscription_schema.subscription_plan SET accepting_subscribers=FALSE WHERE id IN (?,?)", closedByChef, neverAudited);
        audit(closedByChef, "CHEF_ACCEPTING_OFF", "Chef closed the plan to new subscribers", -60);
        service.prepare(chef, Scope.CHEF, request);
        audit(closedAgainByChef, "CHEF_ACCEPTING_OFF", "Chef closed the plan to new subscribers", 1);
        assertEquals(0, count("subscription_schema.subscription_plan WHERE chef_identity_id=? AND accepting_subscribers", chef));

        ErasureResponse released = service.release(chef, Scope.CHEF, request);

        assertEquals("DONE", released.status());
        assertEquals(Map.of("subscription_plan", 1), released.counts());
        assertTrue(accepting(plan));
        assertFalse(accepting(closedByChef));
        assertFalse(accepting(closedAgainByChef));
        assertFalse(accepting(neverAudited));
        assertEquals(1, count("subscription_schema.subscription_plan_audit WHERE plan_id=? AND action='CHEF_ACCEPTING_ON' "
            + "AND actor_identity_id=? AND old_status='ACTIVE' AND new_status='ACTIVE' AND reason='Account deletion cancelled'", plan, chef));
        assertEquals(1, count("subscription_schema.subscription_plan_audit WHERE reason='Account deletion cancelled'"));
        assertEquals(0, service.release(chef, Scope.ALL, request).counts().get("subscription_plan"));
        assertEquals(1, count("subscription_schema.subscription_plan_audit WHERE reason='Account deletion cancelled'"));
    }

    @Test
    void releaseLeavesOtherChefsAndCustomerOnlyRequestsAlone() {
        UUID otherChefPlan = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        addPlan(otherChefPlan, other, "ACTIVE", true);
        service.prepare(chef, Scope.CHEF, request);
        service.prepare(other, Scope.CHEF, request);

        assertEquals(0, service.release(chef, Scope.CUSTOMER, request).counts().get("subscription_plan"));
        assertFalse(accepting(plan));

        assertEquals(1, service.release(chef, Scope.ALL, request).counts().get("subscription_plan"));
        assertTrue(accepting(plan));
        assertFalse(accepting(otherChefPlan));
    }

    @Test
    void releaseDoesNotReopenAPlanAnAdminRetiredMeanwhile() {
        service.prepare(chef, Scope.CHEF, request);
        db.update("UPDATE subscription_schema.subscription_plan SET status='INACTIVE' WHERE id=?", plan);

        assertEquals(0, service.release(chef, Scope.CHEF, request).counts().get("subscription_plan"));
        assertFalse(accepting(plan));
    }

    void ageCheckout(UUID subscription, int hours) {
        db.update("UPDATE subscription_schema.customer_subscription SET created_at = now() - make_interval(hours => ?) WHERE id=?", hours, subscription);
    }

    @Test
    void anAbandonedCheckoutNoLongerBlocks() {
        UUID checkout = subscribe(customer, plan, "PENDING_PAYMENT", "Leave at the gate");
        invoice(checkout, plan, "PAYMENT_REQUESTED");
        UUID second = subscribe(customer, plan, "PENDING_PAYMENT", null);
        invoice(second, plan, "PAYMENT_PENDING");
        ageCheckout(checkout, 25);
        ageCheckout(second, 25);

        assertEquals(List.of(), service.blockers(customer, Scope.CUSTOMER));
        ErasureResponse done = service.erase(customer, Scope.ALL, request);

        assertEquals("DONE", done.status());
        assertEquals(AccountErasureService.ERASED_TEXT, notes(checkout));
        assertEquals("PENDING_PAYMENT", status(checkout));
        assertEquals(2, count("subscription_schema.subscription_invoice WHERE customer_identity_id=? AND status IN ('PAYMENT_REQUESTED','PAYMENT_PENDING')", customer));
    }

    @Test
    void aFreshCheckoutStillBlocks() {
        UUID checkout = subscribe(customer, plan, "PENDING_PAYMENT", "Leave at the gate");
        invoice(checkout, plan, "PAYMENT_REQUESTED");
        ageCheckout(checkout, 1);

        assertEquals(List.of("SUBSCRIPTION_STILL_ACTIVE", "SUBSCRIPTION_UNPAID_INVOICE"), codes(service.blockers(customer, Scope.CUSTOMER)));
        assertEquals("BLOCKED", service.erase(customer, Scope.CUSTOMER, request).status());
        assertEquals("Leave at the gate", notes(checkout));
    }

    @Test
    void anOldRunningOrFailedPlanStillBlocks() {
        UUID running = subscribe(customer, plan, "ACTIVE", null);
        invoice(running, plan, "PAYMENT_REQUESTED");
        ageCheckout(running, 48);
        UUID failed = subscribe(customer, plan, "PAYMENT_FAILED", null);
        ageCheckout(failed, 48);

        assertEquals(List.of("SUBSCRIPTION_STILL_ACTIVE", "SUBSCRIPTION_UNPAID_INVOICE"), codes(service.blockers(customer, Scope.CUSTOMER)));
        assertEquals("2 meal plan subscription(s) are still running", service.blockers(customer, Scope.CUSTOMER).get(0).detail());
    }
}
