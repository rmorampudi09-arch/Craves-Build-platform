package in.craves.subscription.credit;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.credit.DayCreditRepository.DayCredit;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.occurrence.OccurrenceRepository;
import in.craves.subscription.order.OccurrenceOrderProperties;
import in.craves.subscription.order.OccurrenceOrderRepository;
import in.craves.subscription.order.OccurrenceOrderService;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.DayCreditResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
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

/** With the refunds switch on, a declined paid day or paused paid days become a choice; off, they are added at the end. */
@EnabledIfEnvironmentVariable(named="SUBSCRIPTION_TEST_JDBC_URL",matches=".+")
@ResourceLock("disposable-subscription-migration-schema")
class DayCreditOfferDatabaseTest {
    JdbcTemplate db;TransactionTemplate tx;DayCreditRepository credits;
    UUID plan=UUID.randomUUID(),subscription=UUID.randomUUID(),customer=UUID.randomUUID(),chef=UUID.randomUUID(),address=UUID.randomUUID();
    Instant now=Instant.parse("2026-10-08T06:00:00Z");
    static LocalDate d(String monthDay){return LocalDate.parse("2026-"+monthDay);}

    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url=System.getenv("SUBSCRIPTION_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("SUBSCRIPTION_TEST_DB_USER"),System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        assertEquals("subscription_schema_test",db.queryForObject("SELECT current_database()",String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(ds).defaultSchema("public").table("subscription_service_flyway_schema_history").locations("classpath:db/migration").load().migrate();
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount) VALUES (?,?,?,'TEST plan','WEEKLY',300)",plan,"TEST-"+plan,chef);
        // Weekday lunches.
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule(plan_id,recurrence_type,timezone,service_time,generation_lead_hours,status,created_by_identity_id,activated_at) VALUES (?,'WEEKLY','Asia/Kolkata','12:30',24,'ACTIVE',?,now())",plan,chef);
        UUID lunchDish=UUID.randomUUID();
        for(int day=1;day<=5;day++){
            db.update("INSERT INTO subscription_schema.subscription_plan_schedule_item(id,plan_id,menu_item_id,quantity,iso_day_of_week,sequence_number,meal_slot_code,service_time) VALUES (?,?,?,1,?,1,'LUNCH','12:30')",UUID.randomUUID(),plan,lunchDish,day);
        }
        // Paid Saturday 3 to Saturday 10 October.
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date,next_billing_date,delivery_address_id) VALUES (?,?,?,?,'ACTIVE',?,?,?)",subscription,customer,plan,chef,d("10-03"),d("10-10"),address);
        invoice(d("10-03"),d("10-10"),300,null);
        credits=new DayCreditRepository(db);
    }
    void invoice(LocalDate start,LocalDate end,int amount,String reference){
        db.update("INSERT INTO subscription_schema.subscription_invoice(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,cycle_start,cycle_end,amount,currency,status,provider_reference,paid_at) VALUES (?,?,?,?,?,?,?,?,'INR','PAID',?,now())",UUID.randomUUID(),subscription,plan,customer,chef,start,end,amount,reference);
    }
    DayCreditService dayCredits(boolean enabled){
        return new DayCreditService(credits,new SubscriptionBillingRepository(db),new OccurrenceRepository(db),enabled,Clock.fixed(now,ZoneOffset.UTC));
    }
    void decline(boolean enabled,LocalDate date){
        UUID order=UUID.randomUUID(),meal=UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_occurrence(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,delivery_address_id,service_date,service_at,schedule_version,status,meal_slot_code,order_id) VALUES (?,?,?,?,?,?,?,CAST(? AS timestamptz),1,'ORDER_CREATED','LUNCH',?)",
            meal,subscription,plan,customer,chef,address,date,date+"T07:00:00Z",order);
        var service=new OccurrenceOrderService(new OccurrenceOrderProperties(),new OccurrenceOrderRepository(db),new ObjectMapper(),dayCredits(enabled));
        tx.executeWithoutResult(s->service.orderDeclined(meal,order));
    }
    void pausedOn(String instant){
        db.update("UPDATE subscription_schema.customer_subscription SET status='PAUSED' WHERE id=?",subscription);
        db.update("INSERT INTO subscription_schema.subscription_status_history(subscription_id,old_status,new_status,reason,created_at) VALUES (?,'ACTIVE','PAUSED','Travelling',CAST(? AS timestamptz))",subscription,instant);
    }
    List<String> endCredits(){return db.queryForList("SELECT provider_reference||' '||cycle_start||'..'||cycle_end||' '||amount FROM subscription_schema.subscription_invoice WHERE provider_reference IS NOT NULL ORDER BY cycle_start",String.class);}
    List<DayCredit> choices(){return credits.listForCustomer(subscription,now.minusSeconds(86400*30));}
    LocalDate nextBilling(){return db.queryForObject("SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id=?",LocalDate.class,subscription);}

    @Test void switchOffKeepsAddingDeclinedDaysAtTheEnd() {
        decline(false,d("10-08"));

        assertEquals(List.of("DECLINE_CREDIT 2026-10-10..2026-10-13 0.00"),endCredits());
        assertEquals(d("10-13"),nextBilling());
        assertEquals(List.of(),choices());
    }

    @Test void switchOnOffersAChoiceForAPaidDeclinedDay() {
        decline(true,d("10-08"));

        assertEquals(List.of(),endCredits());
        assertEquals(d("10-10"),nextBilling());
        List<DayCredit> offered=choices();
        assertEquals(1,offered.size());
        DayCredit credit=offered.get(0);
        assertEquals(List.of("DECLINE",d("10-08"),d("10-08"),"LUNCH","PENDING_CHOICE"),
            List.of(credit.kind(),credit.firstDate(),credit.lastDate(),credit.mealSlotCode(),credit.status()));
        assertNull(credit.days());
        assertEquals(now.plusSeconds(48*3600),credit.choiceDeadline());
    }

    @Test void switchOnExtendsAFreeDeclinedDayAtOnce() {
        // 10-12 is an extra day already added for free.
        invoice(d("10-10"),d("10-13"),0,"DECLINE_CREDIT");
        db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date=? WHERE id=?",d("10-13"),subscription);

        decline(true,d("10-12"));

        assertEquals(List.of("DECLINE_CREDIT 2026-10-10..2026-10-13 0.00","DECLINE_CREDIT 2026-10-13..2026-10-14 0.00"),endCredits());
        assertEquals(d("10-14"),nextBilling());
        assertEquals(List.of(),choices());
    }

    @Test void switchOnResumeOffersAPauseChoice() {
        pausedOn("2026-10-06T04:00:00Z");

        tx.executeWithoutResult(s->dayCredits(true).creditPausedDays(subscription,d("10-09")));

        assertEquals(List.of(),endCredits());
        assertEquals(d("10-10"),nextBilling());
        List<DayCredit> offered=choices();
        assertEquals(1,offered.size());
        DayCredit credit=offered.get(0);
        assertEquals(List.of("PAUSE",d("10-06"),d("10-08"),3,"PENDING_CHOICE"),
            List.of(credit.kind(),credit.firstDate(),credit.lastDate(),credit.days(),credit.status()));
        assertNull(credit.mealSlotCode());
    }

    @Test void switchOffResumeCarriesPausedDaysAsToday() {
        pausedOn("2026-10-06T04:00:00Z");

        tx.executeWithoutResult(s->dayCredits(false).creditPausedDays(subscription,d("10-09")));

        assertEquals(List.of("PAUSE_CREDIT 2026-10-10..2026-10-13 0.00"),endCredits());
        assertEquals(d("10-13"),nextBilling());
        assertEquals(List.of(),choices());
    }

    // Paused on 10-06, resumed for 10-08, then paused again on 10-06 (before the restart) and resumed for 10-10:
    // 10-06 to 10-09 had no meals, 4 paid days in all, and 10-06/10-07 were already credited by the first resume.
    void pauseResumePauseAgain(boolean enabled){
        pausedOn("2026-10-06T04:00:00Z");
        tx.executeWithoutResult(s->dayCredits(enabled).creditPausedDays(subscription,d("10-08")));
        pausedOn("2026-10-06T08:00:00Z");
        tx.executeWithoutResult(s->dayCredits(enabled).creditPausedDays(subscription,d("10-10")));
    }

    @Test void pausingAgainBeforeTheRestartOffersOnlyTheNewDays() {
        pauseResumePauseAgain(true);

        assertEquals(List.of(),endCredits(),"no days are added at the end while the choices are open");
        assertEquals(List.of(List.of(d("10-08"),d("10-09"),2),List.of(d("10-06"),d("10-07"),2)),
            choices().stream().map(c->List.<Object>of(c.firstDate(),c.lastDate(),c.days())).toList());
    }

    @Test void pausingAgainBeforeTheRestartIsNotCreditedTwice() {
        pauseResumePauseAgain(false);

        // 2 + 2 paid days, laid out once at the end.
        assertEquals(List.of("PAUSE_CREDIT 2026-10-10..2026-10-14 0.00"),endCredits());
        assertEquals(d("10-14"),nextBilling());
    }

    // Customer choices and the 48-hour deadline.
    CurrentUser owner(){return new CurrentUser(customer,"firebase-customer","+919999999999",List.of("CUSTOMER"));}
    UUID pendingDecline(){decline(true,d("10-08"));return choices().get(0).id();}
    UUID pendingPause(){
        pausedOn("2026-10-06T04:00:00Z");
        tx.executeWithoutResult(s->dayCredits(true).creditPausedDays(subscription,d("10-09")));
        db.update("UPDATE subscription_schema.customer_subscription SET status='ACTIVE' WHERE id=?",subscription);
        return choices().get(0).id();
    }
    DayCreditResponse choose(boolean enabled,UUID credit,String choice){return tx.execute(s->dayCredits(enabled).choose(subscription,credit,choice,owner()));}
    DayCredit stored(UUID credit){return credits.lockForSubscription(credit,subscription).orElseThrow();}
    String refused(Runnable action){return assertThrows(ApiException.class,action::run).getCode();}

    @Test void customerExtendsADeclineChoice() {
        UUID credit=pendingDecline();

        DayCreditResponse response=choose(true,credit,"EXTEND");

        assertEquals("EXTENDED",response.status());
        assertEquals(List.of("EXTENDED","CUSTOMER"),List.of(stored(credit).status(),stored(credit).chosenBy()));
        assertEquals(List.of("DECLINE_CREDIT 2026-10-10..2026-10-13 0.00"),endCredits());
        assertEquals(d("10-13"),nextBilling());
    }

    @Test void customerExtendsAPauseChoice() {
        UUID credit=pendingPause();

        assertEquals("EXTENDED",choose(true,credit,"EXTEND").status());

        assertEquals(List.of("PAUSE_CREDIT 2026-10-10..2026-10-13 0.00"),endCredits());
        assertEquals(d("10-13"),nextBilling());
    }

    @Test void customerRequestsARefund() {
        UUID credit=pendingDecline();

        DayCreditResponse response=choose(true,credit,"REFUND");

        assertEquals("REFUND_REQUESTED",response.status());
        assertNull(response.refundAmount());
        assertEquals("INR",response.currency());
        assertEquals(List.of("REFUND_REQUESTED","CUSTOMER"),List.of(stored(credit).status(),stored(credit).chosenBy()));
        assertEquals(List.of(),endCredits());
    }

    @Test void sameChoiceTwiceReturnsTheSameOutcome() {
        UUID credit=pendingDecline();
        choose(true,credit,"EXTEND");

        assertEquals("EXTENDED",choose(true,credit,"EXTEND").status());

        assertEquals(1,endCredits().size(),"the day is added once");
    }

    @Test void secondChoiceAfterSettlingIsRefused() {
        UUID credit=pendingDecline();
        choose(true,credit,"REFUND");

        assertEquals("DAY_CREDIT_ALREADY_SETTLED",refused(()->choose(true,credit,"EXTEND")));
        assertEquals(List.of(),endCredits());
        assertFalse(credits.settle(credit,"EXTENDED","SYSTEM"),"a settled choice is never settled again");
    }

    @Test void cancelledPlanCanOnlyRequestRefund() {
        UUID credit=pendingDecline();
        db.update("UPDATE subscription_schema.customer_subscription SET status='CANCELLED' WHERE id=?",subscription);

        assertFalse(dayCredits(true).forCustomer(subscription).get(0).extendAvailable());
        assertEquals("EXTEND_NOT_AVAILABLE",refused(()->choose(true,credit,"EXTEND")));
        assertEquals("PENDING_CHOICE",stored(credit).status());
        // At the deadline the system can only save a refund request.
        assertEquals(1,dayCredits(true).settleOverdue(now.plusSeconds(49*3600)));
        assertEquals(List.of("REFUND_REQUESTED","SYSTEM"),List.of(stored(credit).status(),stored(credit).chosenBy()));
        assertEquals(List.of(),endCredits());
    }

    @Test void refundRefusedWhileSwitchIsOff() {
        UUID credit=pendingDecline();

        assertEquals("REFUNDS_NOT_AVAILABLE",refused(()->choose(false,credit,"REFUND")));
        assertEquals("PENDING_CHOICE",stored(credit).status());
    }

    @Test void anotherCustomersChoiceIsNotFound() {
        UUID credit=pendingDecline();
        CurrentUser stranger=new CurrentUser(UUID.randomUUID(),"firebase-other","+918888888888",List.of("CUSTOMER"));

        assertEquals("DAY_CREDIT_NOT_FOUND",refused(()->tx.execute(s->dayCredits(true).choose(subscription,credit,"REFUND",stranger))));
        assertEquals("PENDING_CHOICE",stored(credit).status());
    }

    @Test void overdueChoiceIsExtendedBySystem() {
        UUID credit=pendingDecline();

        assertEquals(0,dayCredits(true).settleOverdue(now.plusSeconds(47*3600)));
        assertEquals(1,dayCredits(true).settleOverdue(now.plusSeconds(49*3600)));

        assertEquals(List.of("EXTENDED","SYSTEM"),List.of(stored(credit).status(),stored(credit).chosenBy()));
        assertEquals(List.of("DECLINE_CREDIT 2026-10-10..2026-10-13 0.00"),endCredits());
    }

    @Test void pendingChoicesStillSettleWhenSwitchIsTurnedOff() {
        UUID credit=pendingPause();

        assertEquals(1,dayCredits(false).settleOverdue(now.plusSeconds(49*3600)));

        assertEquals("EXTENDED",stored(credit).status());
        assertEquals(List.of("PAUSE_CREDIT 2026-10-10..2026-10-13 0.00"),endCredits());
    }

    @Test void customerSeesPendingAndRecentChoices() {
        UUID credit=pendingDecline();

        List<DayCreditResponse> shown=dayCredits(true).forCustomer(subscription);

        assertEquals(List.of(credit),shown.stream().map(DayCreditResponse::id).toList());
        assertTrue(shown.get(0).extendAvailable());
        assertEquals(now.plusSeconds(48*3600),shown.get(0).choiceDeadline());
    }
}
