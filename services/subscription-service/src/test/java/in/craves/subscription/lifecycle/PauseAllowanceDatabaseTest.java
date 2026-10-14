package in.craves.subscription.lifecycle;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.craves.subscription.billing.SubscriptionBillingProperties;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.PauseUsage;
import in.craves.subscription.policy.SubscriptionPolicyRepository;
import in.craves.subscription.repository.SubscriptionRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** The pause allowance is counted per paid bill and stored on the subscription. */
@EnabledIfEnvironmentVariable(named="SUBSCRIPTION_TEST_JDBC_URL",matches=".+")
@ResourceLock("disposable-subscription-migration-schema")
class PauseAllowanceDatabaseTest {
    JdbcTemplate db;TransactionTemplate tx;SubscriptionLifecycleRepository repository;
    UUID plan=UUID.randomUUID(),subscription=UUID.randomUUID(),customer=UUID.randomUUID(),chef=UUID.randomUUID();
    static LocalDate d(String monthDay){return LocalDate.parse("2026-"+monthDay);}

    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url=System.getenv("SUBSCRIPTION_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("SUBSCRIPTION_TEST_DB_USER"),System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        assertEquals("subscription_schema_test",db.queryForObject("SELECT current_database()",String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(ds).defaultSchema("public").table("subscription_service_flyway_schema_history").locations("classpath:db/migration").load().migrate();
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount) VALUES (?,?,?,'TEST plan','MONTHLY',2800)",plan,"TEST-"+plan,chef);
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date,next_billing_date) VALUES (?,?,?,?,'ACTIVE',?,?)",subscription,customer,plan,chef,d("10-13"),d("11-10"));
        invoice(d("10-13"),d("11-10"),2800,null);
        repository=new SubscriptionLifecycleRepository(db);
    }
    void invoice(LocalDate start,LocalDate end,int amount,String reference) {
        db.update("INSERT INTO subscription_schema.subscription_invoice(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,cycle_start,cycle_end,amount,currency,status,provider_reference) VALUES (?,?,?,?,?,?,?,?,'INR','PAID',?)",UUID.randomUUID(),subscription,plan,customer,chef,start,end,amount,reference);
    }
    void pause(LocalDate from,LocalDate billStart,int used,LocalDate auto) {
        Boolean paused=tx.execute(s->repository.pause(subscription,customer,"Travelling",from,billStart,used,auto));
        assertEquals(Boolean.TRUE,paused);
    }

    @Test void fortnightlyPlanAccepted() {
        assertEquals(1,db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount) VALUES (?,?,?,'Two weeks','FORTNIGHTLY',1400)",UUID.randomUUID(),"TEST-14-"+plan,chef));
    }

    @Test void pauseStoresAllowanceColumns() {
        pause(d("10-20"),d("10-13"),0,d("10-27"));
        assertEquals(new PauseUsage(d("10-13"),0,d("10-20"),d("10-27")),repository.pauseUsage(subscription));
        assertEquals("PAUSED",db.queryForObject("SELECT status FROM subscription_schema.customer_subscription WHERE id=?",String.class,subscription));
    }

    @Test void closePauseRecordsUsedDays() {
        pause(d("10-20"),d("10-13"),0,d("10-27"));
        repository.closePause(subscription,d("10-23"));
        assertEquals(new PauseUsage(d("10-13"),3,null,null),repository.pauseUsage(subscription));
    }

    @Test void secondPauseInSameBillGetsOnlyRemainingDays() {
        pause(d("10-20"),d("10-13"),0,d("10-27"));
        repository.closePause(subscription,d("10-23"));
        PauseUsage usage=repository.pauseUsage(subscription);
        assertEquals(4,PauseAllowance.daysLeft(7,repository.currentBillStart(subscription,d("10-25")),usage.billStart(),usage.usedDays()));
    }

    @Test void closePauseWithoutPauseDatesAddsNothing() {
        repository.closePause(subscription,d("10-23"));
        assertEquals(new PauseUsage(null,0,null,null),repository.pauseUsage(subscription));
    }

    @Test void pauseNearBillEndCountsAgainstCurrentBill() {
        assertEquals(d("10-13"),repository.currentBillStart(subscription,d("11-09")));
    }

    @Test void nextPaidBillStartsAFreshAllowance() {
        invoice(d("11-10"),d("12-08"),2800,null);
        assertEquals(d("11-10"),repository.currentBillStart(subscription,d("11-12")));
    }

    @Test void creditInvoiceIsNotABill() {
        invoice(d("11-10"),d("11-13"),0,"PAUSE_CREDIT");
        assertEquals(d("10-13"),repository.currentBillStart(subscription,d("11-11")));
    }

    @Test void noPaidBillFallsBackToStartDate() {
        db.update("DELETE FROM subscription_schema.subscription_invoice WHERE subscription_id=?",subscription);
        assertEquals(d("10-13"),repository.currentBillStart(subscription,d("10-20")));
    }

    @Test void firstUnservedDateSkipsMealsAlreadySent() {
        assertEquals(d("10-20"),repository.firstUnservedDate(subscription,d("10-20")));
        db.update("INSERT INTO subscription_schema.subscription_occurrence(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,delivery_address_id,service_date,service_at,schedule_version,status,meal_slot_code) VALUES (?,?,?,?,?,?,?,CAST(? AS timestamptz),1,'ORDER_CREATED','LUNCH')",UUID.randomUUID(),subscription,plan,customer,chef,UUID.randomUUID(),d("10-20"),"2026-10-20T06:30:00Z");
        assertEquals(d("10-21"),repository.firstUnservedDate(subscription,d("10-20")));
    }

    // A customer paused on 20 October with 7 days left, so the plan restarts on 27 October.
    PauseAutoResumeWorker pausedUntil(LocalDate auto) {
        pause(d("10-20"),d("10-13"),0,auto);
        db.update("UPDATE subscription_schema.subscription_status_history SET created_at=CAST('2026-10-20T04:00:00Z' AS timestamptz) WHERE subscription_id=?",subscription);
        CapacityService capacity=mock(CapacityService.class);
        when(capacity.hasCommittedCapacity(subscription)).thenReturn(true);
        SubscriptionLifecycleService service=new SubscriptionLifecycleService(repository,mock(SubscriptionPolicyRepository.class),
            mock(SubscriptionRepository.class),capacity,new SubscriptionBillingProperties(),new SubscriptionBillingRepository(db),Clock.systemUTC());
        return new PauseAutoResumeWorker(repository,service);
    }
    String status(){return db.queryForObject("SELECT status FROM subscription_schema.customer_subscription WHERE id=?",String.class,subscription);}

    @Test void sweepRestartsPlanTheDayBefore() {
        assertEquals(1,pausedUntil(d("10-27")).resumeDue(d("10-26")));
        assertEquals("ACTIVE",status());
        assertEquals(d("10-27"),db.queryForObject("SELECT next_service_date FROM subscription_schema.customer_subscription WHERE id=?",LocalDate.class,subscription));
        assertEquals(new PauseUsage(d("10-13"),7,null,null),repository.pauseUsage(subscription));
        assertEquals("Pause days used up; plan restarted automatically",db.queryForObject(
            "SELECT reason FROM subscription_schema.subscription_status_history WHERE subscription_id=? AND new_status='ACTIVE'",String.class,subscription));
        // The 7 paused paid days are carried to the end of the plan.
        assertEquals(d("11-17"),db.queryForObject("SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id=?",LocalDate.class,subscription));
    }

    @Test void sweepLeavesFuturePauses() {
        assertEquals(0,pausedUntil(d("10-29")).resumeDue(d("10-26")));
        assertEquals("PAUSED",status());
    }

    @Test void legacyPauseWithoutAutoDateIsIgnoredBySweep() {
        assertEquals(0,pausedUntil(null).resumeDue(d("10-26")));
        assertEquals("PAUSED",status());
    }
}
