package in.craves.subscription.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.repository.SubscriptionRepository;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="SUBSCRIPTION_TEST_JDBC_URL",matches=".+")
@ResourceLock("disposable-subscription-migration-schema")
class SubscriptionPaymentRecoveryDatabaseTest {
    JdbcTemplate db;TransactionTemplate tx;SubscriptionPaymentStatusService service;CapacityService capacity;
    UUID plan=UUID.randomUUID(),subscription=UUID.randomUUID(),customer=UUID.randomUUID(),chef=UUID.randomUUID(),invoice=UUID.randomUUID();
    LocalDate today=LocalDate.now(ZoneId.of("Asia/Kolkata"));ObjectMapper json=new ObjectMapper();
    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url=System.getenv("SUBSCRIPTION_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("SUBSCRIPTION_TEST_DB_USER"),System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        assertEquals("subscription_schema_test",db.queryForObject("SELECT current_database()",String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(ds).defaultSchema("public").table("subscription_service_flyway_schema_history").locations("classpath:db/migration").load().migrate();
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount) VALUES (?,?,?,'TEST plan','MONTHLY',300)",plan,"TEST-"+plan,chef);
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date) VALUES (?,?,?,?,'PENDING_PAYMENT',?)",subscription,customer,plan,chef,today);
        invoice(invoice,today,today.plusMonths(1),"PAYMENT_PENDING");
        capacity=mock(CapacityService.class);service=new SubscriptionPaymentStatusService(db,json,capacity,new SubscriptionRepository(db));
    }
    void invoice(UUID id,LocalDate start,LocalDate end,String state) {
        db.update("INSERT INTO subscription_schema.subscription_invoice(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,cycle_start,cycle_end,amount,currency,status) VALUES (?,?,?,?,?,?,?,300,'INR',?)",id,subscription,plan,customer,chef,start,end,state);
    }
    void state(String status){db.update("UPDATE subscription_schema.customer_subscription SET status=? WHERE id=?",status,subscription);}
    String state(){return db.queryForObject("SELECT status FROM subscription_schema.customer_subscription WHERE id=?",String.class,subscription);}
    String event(UUID id,String status) {
        var body=json.createObjectNode().put("eventId",UUID.randomUUID().toString()).put("eventType","SUBSCRIPTION_PAYMENT_STATUS_CHANGED").put("eventVersion","v1")
            .put("correlationId",id.toString()).put("causationId",subscription.toString()).put("subject",id.toString());
        body.putObject("data").put("invoiceId",id.toString()).put("subscriptionId",subscription.toString()).put("paymentIntentId",UUID.randomUUID().toString())
            .put("status",status).put("providerStatus",status.equals("PAID")?"captured":"failed").put("providerPaymentId","pay_TEST").put("amount","300.00").put("currency","INR");
        return body.toString();
    }
    boolean accept(String event){return tx.execute(s->service.accept(event));}
    @Test void initialPaymentActivatesOnceAndIdenticalTransportReplayHasNoEffect() {
        String event=event(invoice,"PAID");assertTrue(accept(event));assertEquals("ACTIVE",state());assertFalse(accept(event));
        verify(capacity,times(1)).commitForActivation(any());
    }
    @Test void laterDuplicatePaidEventCannotReacquirePausedOrCancelledCapacity() {
        accept(event(invoice,"PAID"));clearInvocations(capacity);
        for(String status:java.util.List.of("PAUSED","CANCELLED","EXPIRED")) {
            state(status);assertFalse(accept(event(invoice,"PAID")));assertEquals(status,state());
        }
        verifyNoInteractions(capacity);
    }
    @Test void newPaymentAfterClosureIsPreservedForRecoveryWithoutActivation() {
        state("CANCELLED");assertTrue(accept(event(invoice,"PAID")));assertEquals("CANCELLED",state());verifyNoInteractions(capacity);
        assertEquals("PAID",db.queryForObject("SELECT status FROM subscription_schema.subscription_invoice WHERE id=?",String.class,invoice));
        assertEquals("PAYMENT_RECEIVED_AFTER_SUBSCRIPTION_CLOSED",db.queryForObject("SELECT failure_code FROM subscription_schema.subscription_invoice WHERE id=?",String.class,invoice));
        assertEquals(1,db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_payment_status_inbox WHERE processing_status='FAILED'",Integer.class));
    }
    @Test void newPaymentWhilePausedDoesNotStartDeliveriesOrReserveCapacity() {
        state("PAUSED");assertTrue(accept(event(invoice,"PAID")));assertEquals("PAUSED",state());verifyNoInteractions(capacity);
    }
    @Test void oldFailedCycleCannotInvalidateTheCurrentPaidCycle() {
        accept(event(invoice,"PAID"));clearInvocations(capacity);UUID old=UUID.randomUUID();invoice(old,today.minusMonths(1),today,"PAYMENT_PENDING");
        accept(event(old,"FAILED"));assertEquals("ACTIVE",state());verifyNoInteractions(capacity);
    }
    @Test void nextCycleFailureDoesNotRemoveCurrentPaidMeals() {
        accept(event(invoice,"PAID"));clearInvocations(capacity);UUID next=UUID.randomUUID();invoice(next,today.plusMonths(1),today.plusMonths(2),"PAYMENT_PENDING");
        accept(event(next,"FAILED"));assertEquals("ACTIVE",state());verifyNoInteractions(capacity);
    }
    @Test void initialFailedPaymentStillReleasesEnrollmentHold() {
        accept(event(invoice,"FAILED"));assertEquals("PAYMENT_FAILED",state());verify(capacity).releaseForPauseOrTerminal(any(),eq(today),anyString());
    }
    @Test void failureAfterSuccessCannotRegressInvoiceOrPlan() {
        accept(event(invoice,"PAID"));clearInvocations(capacity);assertFalse(accept(event(invoice,"FAILED")));assertEquals("ACTIVE",state());verifyNoInteractions(capacity);
    }
}
