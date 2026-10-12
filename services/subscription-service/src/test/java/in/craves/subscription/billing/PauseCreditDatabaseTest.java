package in.craves.subscription.billing;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
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
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/** Resume carries paused paid days forward and voids unpaid cycles that started during the pause. */
@EnabledIfEnvironmentVariable(named="SUBSCRIPTION_TEST_JDBC_URL",matches=".+")
@ResourceLock("disposable-subscription-migration-schema")
class PauseCreditDatabaseTest {
    JdbcTemplate db;TransactionTemplate tx;SubscriptionBillingRepository repository;
    UUID plan=UUID.randomUUID(),subscription=UUID.randomUUID(),customer=UUID.randomUUID(),chef=UUID.randomUUID();
    UUID paid=UUID.randomUUID(),open=UUID.randomUUID();
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
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date,next_billing_date) VALUES (?,?,?,?,'ACTIVE',?,?)",subscription,customer,plan,chef,d("10-05"),d("10-19"));
        invoice(paid,d("10-05"),d("10-12"),"PAID");
        invoice(open,d("10-12"),d("10-19"),"PAYMENT_REQUESTED");
        // Paused at 09:30 IST on 7 October.
        db.update("INSERT INTO subscription_schema.subscription_status_history(subscription_id,old_status,new_status,reason,created_at) VALUES (?,'ACTIVE','PAUSED','Travelling',CAST('2026-10-07T04:00:00Z' AS timestamptz))",subscription);
        repository=new SubscriptionBillingRepository(db);
    }
    void invoice(UUID id,LocalDate start,LocalDate end,String state) {
        db.update("INSERT INTO subscription_schema.subscription_invoice(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,cycle_start,cycle_end,amount,currency,status) VALUES (?,?,?,?,?,?,?,300,'INR',?)",id,subscription,plan,customer,chef,start,end,state);
    }
    PauseCredit resume(LocalDate on){return tx.execute(s->repository.applyPauseCredit(subscription,on));}
    Map<String,Object> invoiceRow(UUID id){return db.queryForMap("SELECT status,failure_code FROM subscription_schema.subscription_invoice WHERE id=?",id);}
    List<Map<String,Object>> creditRows(){return db.queryForList("SELECT amount,status,cycle_start,cycle_end,paid_at IS NOT NULL AS paid FROM subscription_schema.subscription_invoice WHERE provider_reference='PAUSE_CREDIT'");}
    LocalDate nextBilling(){return db.queryForObject("SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id=?",LocalDate.class,subscription);}

    @Test void voidsUnpaidCycleInsidePauseAndCarriesPaidDaysForward() throws Exception {
        assertEquals(new PauseCredit(d("10-25"),5,d("10-30")),resume(d("10-25")));

        assertEquals(Map.of("status","CANCELLED","failure_code","PAUSED_CYCLE_VOIDED"),invoiceRow(open));
        assertEquals(List.of("PAYMENT_REQUESTED>CANCELLED"),db.queryForList(
            "SELECT old_status||'>'||new_status FROM subscription_schema.subscription_invoice_history WHERE invoice_id=?",String.class,open));
        List<Map<String,Object>> credit=creditRows();
        assertEquals(1,credit.size());
        assertEquals(0,new BigDecimal("0").compareTo((BigDecimal)credit.get(0).get("amount")));
        assertEquals("PAID",credit.get(0).get("status"));
        assertEquals(java.sql.Date.valueOf(d("10-25")),credit.get(0).get("cycle_start"));
        assertEquals(java.sql.Date.valueOf(d("10-30")),credit.get(0).get("cycle_end"));
        assertEquals(true,credit.get(0).get("paid"));
        assertEquals(d("10-30"),nextBilling());
        assertEquals("PAID",invoiceRow(paid).get("status"));

        // Integration-service is told, so the voided bill can no longer be paid.
        List<Map<String,Object>> outbox=voidedOutbox();
        assertEquals(1,outbox.size());
        Map<String,Object> row=outbox.get(0);
        assertEquals("SUBSCRIPTION_INVOICE_VOIDED:"+open,row.get("event_key"));
        assertEquals(List.of(open,open,"v1","PENDING"),List.of(row.get("aggregate_id"),row.get("correlation_id"),row.get("event_version"),row.get("status")));
        var event=new com.fasterxml.jackson.databind.ObjectMapper().readTree((String)row.get("payload"));
        assertEquals(row.get("id").toString(),event.path("eventId").asText());
        assertEquals("SUBSCRIPTION_INVOICE_VOIDED",event.path("eventType").asText());
        assertEquals("v1",event.path("eventVersion").asText());
        assertDoesNotThrow(()->java.time.Instant.parse(event.path("occurredAt").asText()));
        assertEquals(List.of(open.toString(),subscription.toString(),open.toString()),
            List.of(event.path("correlationId").asText(),event.path("causationId").asText(),event.path("subject").asText()));
        assertEquals(Map.of("invoiceId",open.toString(),"subscriptionId",subscription.toString(),"reason","PAUSED_CYCLE_VOIDED"),
            new com.fasterxml.jackson.databind.ObjectMapper().convertValue(event.path("data"),Map.class));
    }
    List<Map<String,Object>> voidedOutbox(){return db.queryForList("SELECT id,event_key,aggregate_id,correlation_id,event_version,status,payload::text AS payload FROM subscription_schema.subscription_payment_outbox WHERE event_type='SUBSCRIPTION_INVOICE_VOIDED'");}

    void pausedAgainAt(String instant){db.update("INSERT INTO subscription_schema.subscription_status_history(subscription_id,old_status,new_status,reason,created_at) VALUES (?,'ACTIVE','PAUSED','Again',CAST(? AS timestamptz))",subscription,instant);}
    void credit(UUID id,LocalDate start,LocalDate end){db.update("INSERT INTO subscription_schema.subscription_invoice(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,cycle_start,cycle_end,amount,currency,status,provider_reference,paid_at) VALUES (?,?,?,?,?,?,?,0,'INR','PAID','PAUSE_CREDIT',now())",id,subscription,plan,customer,chef,start,end);}
    void mealSentToChef(LocalDate serviceDate){db.update("INSERT INTO subscription_schema.subscription_occurrence(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,delivery_address_id,service_date,service_at,schedule_version,status,meal_slot_code) VALUES (?,?,?,?,?,?,?,CAST(? AS timestamptz),1,'ORDER_CREATED','LUNCH')",UUID.randomUUID(),subscription,plan,customer,chef,UUID.randomUUID(),serviceDate,serviceDate+"T06:30:00Z");}

    @Test void secondPauseLaysTheUnstartedCreditOutAgainWithoutAGap() {
        UUID earlier=UUID.randomUUID();credit(earlier,d("10-19"),d("10-21"));
        db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date=? WHERE id=?",d("10-21"),subscription);
        pausedAgainAt("2026-10-10T04:00:00Z");

        // 2 paid days paused (10-10, 10-11) + the 2 unstarted credit days, laid out from the resume.
        assertEquals(new PauseCredit(d("10-15"),4,d("10-19")),resume(d("10-15")));

        assertEquals("PAUSED_CYCLE_VOIDED",invoiceRow(open).get("failure_code"));
        assertEquals(List.of(Map.of("id",earlier,"cycle_start",java.sql.Date.valueOf(d("10-15")),"cycle_end",java.sql.Date.valueOf(d("10-19")))),
            db.queryForList("SELECT id,cycle_start,cycle_end FROM subscription_schema.subscription_invoice WHERE provider_reference='PAUSE_CREDIT'"));
        assertEquals(d("10-19"),nextBilling());
    }

    @Test void unpaidGapInsideThePauseIsNotCredited() {
        db.update("UPDATE subscription_schema.subscription_invoice SET status='FAILED' WHERE id=?",open);
        invoice(UUID.randomUUID(),d("10-19"),d("10-26"),"PAID");
        db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date=? WHERE id=?",d("10-26"),subscription);
        pausedAgainAt("2026-10-14T04:00:00Z");

        assertEquals(new PauseCredit(d("10-26"),3,d("10-29")),resume(d("10-22")));
        assertEquals("PAUSED_CYCLE_VOIDED",invoiceRow(open).get("failure_code"));
        assertEquals(List.of("SUBSCRIPTION_INVOICE_VOIDED:"+open),voidedOutbox().stream().map(r->r.get("event_key")).toList());
    }

    @Test void refundFlagSurvivesALaterResume() {
        db.update("UPDATE subscription_schema.subscription_invoice SET status='CANCELLED',failure_code='PAYMENT_RECEIVED_FOR_VOIDED_CYCLE' WHERE id=?",open);

        assertEquals(new PauseCredit(d("10-25"),5,d("10-30")),resume(d("10-25")));

        assertEquals("PAYMENT_RECEIVED_FOR_VOIDED_CYCLE",invoiceRow(open).get("failure_code"));
        assertEquals(0,db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_invoice_history WHERE invoice_id=?",Integer.class,open));
        assertEquals(List.of(),voidedOutbox());
    }

    @Test void creditStartsAfterTheLastMealStillSentToTheChef() {
        // Paused on 10-07 but the 10-07 and 10-08 meals had already gone to the chef and were delivered.
        mealSentToChef(d("10-07"));mealSentToChef(d("10-08"));

        assertEquals(new PauseCredit(d("10-14"),3,d("10-17")),resume(d("10-14")));
    }

    @Test void adminStatusChangeFromAStaleStatusIsRejected() {
        var subscriptions=new in.craves.subscription.repository.SubscriptionRepository(db);
        // Someone else already resumed it: the admin screen still thinks it is PAUSED.
        var error=assertThrows(in.craves.subscription.exception.ApiException.class,
            ()->subscriptions.updateSubscriptionStatus(subscription,"PAUSED","ACTIVE","Customer asked by phone",UUID.randomUUID()));
        assertEquals("SUBSCRIPTION_STATE_CHANGED",error.getCode());
        assertEquals(0,db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_status_history WHERE subscription_id=? AND new_status='ACTIVE'",Integer.class,subscription));
    }

    @Test void keepsOpenInvoiceThatStartsAfterResume() {
        assertEquals(new PauseCredit(d("10-19"),2,d("10-21")),resume(d("10-09")));

        Map<String,Object> stillOpen=invoiceRow(open);
        assertEquals("PAYMENT_REQUESTED",stillOpen.get("status"));
        assertNull(stillOpen.get("failure_code"));
        assertEquals(List.of(),voidedOutbox());
        List<Map<String,Object>> credit=creditRows();
        assertEquals(1,credit.size());
        assertEquals(java.sql.Date.valueOf(d("10-19")),credit.get(0).get("cycle_start"));
        assertEquals(java.sql.Date.valueOf(d("10-21")),credit.get(0).get("cycle_end"));
        assertEquals(d("10-21"),nextBilling());
    }
}
