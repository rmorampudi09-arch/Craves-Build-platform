package in.craves.subscription.order;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.occurrence.OccurrenceRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Meals go to the chef at 07:00 on the day (breakfast at 20:00 the evening before); a declined day is added to the end. */
@EnabledIfEnvironmentVariable(named="SUBSCRIPTION_TEST_JDBC_URL",matches=".+")
@ResourceLock("disposable-subscription-migration-schema")
class ChefDispatchAndDeclineDatabaseTest {
    JdbcTemplate db;TransactionTemplate tx;OccurrenceOrderRepository repository;OccurrenceOrderService service;
    UUID plan=UUID.randomUUID(),subscription=UUID.randomUUID(),customer=UUID.randomUUID(),chef=UUID.randomUUID(),address=UUID.randomUUID();
    static LocalDate d(String monthDay){return LocalDate.parse("2026-"+monthDay);}
    static Instant ist(String monthDayTime){return java.time.OffsetDateTime.parse("2026-"+monthDayTime+":00+05:30").toInstant();}

    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url=System.getenv("SUBSCRIPTION_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("SUBSCRIPTION_TEST_DB_USER"),System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        assertEquals("subscription_schema_test",db.queryForObject("SELECT current_database()",String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(ds).defaultSchema("public").table("subscription_service_flyway_schema_history").locations("classpath:db/migration").load().migrate();
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount) VALUES (?,?,?,'TEST plan','WEEKLY',300)",plan,"TEST-"+plan,chef);
        // Weekday lunches and dinners.
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule(plan_id,recurrence_type,timezone,service_time,generation_lead_hours,status,created_by_identity_id,activated_at) VALUES (?,'WEEKLY','Asia/Kolkata','12:30',24,'ACTIVE',?,now())",plan,chef);
        UUID lunchDish=UUID.randomUUID(),dinnerDish=UUID.randomUUID();
        for(int day=1;day<=5;day++){
            db.update("INSERT INTO subscription_schema.subscription_plan_schedule_item(id,plan_id,menu_item_id,quantity,iso_day_of_week,sequence_number,meal_slot_code,service_time) VALUES (?,?,?,1,?,1,'LUNCH','12:30')",UUID.randomUUID(),plan,lunchDish,day);
            db.update("INSERT INTO subscription_schema.subscription_plan_schedule_item(id,plan_id,menu_item_id,quantity,iso_day_of_week,sequence_number,meal_slot_code,service_time) VALUES (?,?,?,1,?,2,'DINNER','19:30')",UUID.randomUUID(),plan,dinnerDish,day);
        }
        // Paid Saturday 3 to Saturday 10 October.
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date,next_billing_date,delivery_address_id) VALUES (?,?,?,?,'ACTIVE',?,?,?)",subscription,customer,plan,chef,d("10-03"),d("10-10"),address);
        db.update("INSERT INTO subscription_schema.subscription_invoice(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,cycle_start,cycle_end,amount,currency,status) VALUES (?,?,?,?,?,?,?,300,'INR','PAID')",UUID.randomUUID(),subscription,plan,customer,chef,d("10-03"),d("10-10"));
        repository=new OccurrenceOrderRepository(db);
        service=new OccurrenceOrderService(new OccurrenceOrderProperties(),repository,new ObjectMapper(),new SubscriptionBillingRepository(db),new OccurrenceRepository(db));
    }
    UUID meal(LocalDate date,String slot,Instant serviceAt,String status,UUID orderId){
        UUID id=UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_occurrence(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,delivery_address_id,service_date,service_at,schedule_version,status,meal_slot_code,order_id) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)",
            id,subscription,plan,customer,chef,address,date,java.sql.Timestamp.from(serviceAt),status,slot,orderId);
        return id;
    }
    Set<UUID> claim(Instant now){return repository.claimReady(now,10,50).stream().map(OccurrenceOrderRepository.OccurrenceClaim::occurrenceId).collect(Collectors.toSet());}
    void decline(UUID occurrence,UUID order){tx.executeWithoutResult(s->service.orderDeclined(occurrence,order));}
    String status(UUID occurrence){return db.queryForObject("SELECT status FROM subscription_schema.subscription_occurrence WHERE id=?",String.class,occurrence);}
    List<String> credits(){return db.queryForList("SELECT cycle_start||'..'||cycle_end||' '||status||' '||amount FROM subscription_schema.subscription_invoice WHERE provider_reference='DECLINE_CREDIT'",String.class);}
    LocalDate nextBilling(){return db.queryForObject("SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id=?",LocalDate.class,subscription);}

    @Test void breakfastGoesTheEveningBeforeAndOtherMealsAtSevenOnTheDay() {
        UUID breakfast=meal(d("10-14"),"BREAKFAST",ist("10-14T08:30"),"READY_FOR_ORDER",null);
        UUID earlySnack=meal(d("10-14"),"SNACK",ist("10-14T08:00"),"READY_FOR_ORDER",null);
        UUID lunch=meal(d("10-14"),"LUNCH",ist("10-14T12:30"),"READY_FOR_ORDER",null);
        UUID dinner=meal(d("10-14"),"DINNER",ist("10-14T19:30"),"READY_FOR_ORDER",null);

        assertEquals(Set.of(),claim(ist("10-13T19:59")));
        assertEquals(Set.of(breakfast,earlySnack),claim(ist("10-13T20:00")));
        assertEquals(Set.of(),claim(ist("10-14T06:59")));
        assertEquals(Set.of(lunch,dinner),claim(ist("10-14T07:00")));
    }

    @Test void declinedLunchAddsDaysThroughTheNextLunchDay() {
        UUID order=UUID.randomUUID();
        UUID lunch=meal(d("10-08"),"LUNCH",ist("10-08T12:30"),"ORDER_CREATED",order);
        // Already generated for Monday, waiting for the next bill.
        UUID monday=meal(d("10-12"),"LUNCH",ist("10-12T12:30"),"BILLING_PENDING",null);

        decline(lunch,order);

        assertEquals("FAILED",status(lunch));
        assertEquals(List.of("CHEF_DECLINED"),db.queryForList("SELECT source FROM subscription_schema.subscription_occurrence_history WHERE occurrence_id=? AND new_status='FAILED'",String.class,lunch));
        // Saturday and Sunday serve nothing, so the added stretch runs through Monday's lunch.
        assertEquals(List.of("2026-10-10..2026-10-13 PAID 0.00"),credits());
        assertEquals(d("10-13"),nextBilling());
        assertEquals("READY_FOR_ORDER",status(monday));
    }

    @Test void aDayIsAddedOnceHoweverManyOfItsMealsAreDeclined() {
        UUID lunchOrder=UUID.randomUUID(),dinnerOrder=UUID.randomUUID();
        UUID lunch=meal(d("10-08"),"LUNCH",ist("10-08T12:30"),"ORDER_CREATED",lunchOrder);
        UUID dinner=meal(d("10-08"),"DINNER",ist("10-08T19:30"),"ORDER_REQUESTED",null);

        decline(lunch,lunchOrder);
        decline(dinner,dinnerOrder);
        decline(lunch,lunchOrder);

        assertEquals("FAILED",status(dinner));
        assertEquals(dinnerOrder,db.queryForObject("SELECT order_id FROM subscription_schema.subscription_occurrence WHERE id=?",UUID.class,dinner));
        assertEquals(1,credits().size());
        assertEquals(d("10-13"),nextBilling());
    }

    @Test void cancelledPlanGetsNoDayAdded() {
        db.update("UPDATE subscription_schema.customer_subscription SET status='CANCELLED' WHERE id=?",subscription);
        UUID order=UUID.randomUUID();
        UUID lunch=meal(d("10-08"),"LUNCH",ist("10-08T12:30"),"ORDER_CREATED",order);

        decline(lunch,order);

        assertEquals("FAILED",status(lunch));
        assertEquals(List.of(),credits());
        assertEquals(d("10-10"),nextBilling());
    }

    @Test void declinedDayIsNotCreditedAgainByAResume() {
        UUID order=UUID.randomUUID();
        UUID lunch=meal(d("10-08"),"LUNCH",ist("10-08T12:30"),"ORDER_CREATED",order);
        // Paused at 09:00 IST on 8 October, after that lunch went to the chef.
        db.update("UPDATE subscription_schema.customer_subscription SET status='PAUSED' WHERE id=?",subscription);
        db.update("INSERT INTO subscription_schema.subscription_status_history(subscription_id,old_status,new_status,reason,created_at) VALUES (?,'ACTIVE','PAUSED','Travelling',CAST('2026-10-08T03:30:00Z' AS timestamptz))",subscription);
        decline(lunch,order);

        var credit=tx.execute(s->new SubscriptionBillingRepository(db).applyPauseCredit(subscription,d("10-09")));

        assertEquals(0,credit.creditDays());
        assertEquals(1,credits().size());
        assertEquals(d("10-13"),nextBilling());
    }

    @Test void declineForAnotherOrderIsRefused() {
        UUID lunch=meal(d("10-08"),"LUNCH",ist("10-08T12:30"),"ORDER_CREATED",UUID.randomUUID());

        assertThrows(IllegalStateException.class,()->decline(lunch,UUID.randomUUID()));
        assertEquals("ORDER_CREATED",status(lunch));
        assertEquals(List.of(),credits());
    }
}
