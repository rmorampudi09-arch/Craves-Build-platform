package in.craves.subscription.address;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.subscription.billing.SubscriptionBillingProperties;
import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.billing.SubscriptionBillingService;
import in.craves.subscription.capacity.CapacityService;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.repository.SubscriptionRepository;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.service.SubscriptionService;
import in.craves.subscription.web.ApiDtos.CreateSubscriptionRequest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

@EnabledIfEnvironmentVariable(named = "SUBSCRIPTION_TEST_JDBC_URL", matches = ".+")
@ResourceLock("disposable-subscription-migration-schema")
class SubscriptionAddressGuardDatabaseTest {
    JdbcTemplate db;
    TransactionTemplate tx;
    SubscriptionService service;
    SubscriptionBillingService billing;
    SubscriptionBillingRepository billingRepository;
    SubscriptionDeliveryAddressClient addresses;
    CapacityService capacity;
    MockRestServiceServer server;
    UUID plan = UUID.randomUUID(), customer = SubscriptionDeliveryAddressClientTest.CUSTOMER, chef = UUID.randomUUID();
    UUID address = SubscriptionDeliveryAddressClientTest.ADDRESS;
    LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
    SubscriptionBillingProperties properties = new SubscriptionBillingProperties();

    @BeforeEach void setup() {
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        assertTrue("true".equals(System.getenv("GITHUB_ACTIONS")) || "True".equals(System.getenv("TF_BUILD"))
            || "YES_LOCAL_DISPOSABLE_SUBSCRIPTION_ONLY".equals(System.getenv("CRAVES_LOCAL_DISPOSABLE_PARITY")));
        String url = System.getenv("SUBSCRIPTION_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("SUBSCRIPTION_TEST_DB_USER"), System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        db = new JdbcTemplate(ds);
        tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        assertEquals("subscription_schema_test", db.queryForObject("SELECT current_database()", String.class));
        assertEquals("16", db.queryForObject("SELECT (current_setting('server_version_num')::int / 10000)::text", String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");
        db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(ds).defaultSchema("public").table("subscription_service_flyway_schema_history")
            .locations("classpath:db/migration").load().migrate();
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount,status) VALUES (?,?,?,'Synthetic CP03 plan','WEEKLY',300,'ACTIVE')", plan, "CP03-" + plan, chef);
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule(plan_id,recurrence_type,timezone,service_time,generation_lead_hours,status,created_by_identity_id,activated_at) VALUES (?,'WEEKLY','Asia/Kolkata','12:00',24,'ACTIVE',?,now())", plan, chef);
        db.update("INSERT INTO subscription_schema.subscription_plan_policy(id,plan_id,version,status,customer_pause_enabled,customer_resume_enabled,customer_cancel_enabled,customer_skip_enabled,created_by_identity_id,activated_at) VALUES (?,?,1,'ACTIVE',false,false,false,false,?,now())", UUID.randomUUID(), plan, chef);
        var builder = RestClient.builder().baseUrl("http://localhost");
        server = MockRestServiceServer.bindTo(builder).build();
        addresses = new SubscriptionDeliveryAddressClient(builder.build(), "synthetic-test-internal-secret");
        capacity = mock(CapacityService.class);
        when(capacity.isPlanBookable(any())).thenReturn(true);
        var repository = new SubscriptionRepository(db);
        service = new SubscriptionService(repository, capacity, addresses);
        var proxy = new org.springframework.aop.framework.ProxyFactory(new SubscriptionBillingRepository(db));
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new org.springframework.transaction.interceptor.TransactionInterceptor(
            new DataSourceTransactionManager(ds), new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource()));
        billingRepository = (SubscriptionBillingRepository) proxy.getProxy();
        billing = new SubscriptionBillingService(properties, billingRepository, new ObjectMapper(), addresses);
    }

    void addressFailure(String kind) {
        if (kind.equals("missing")) server.expect(anything()).andRespond(withStatus(HttpStatus.NOT_FOUND));
        else if (kind.equals("outage")) server.expect(anything()).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        else {
            var body = SubscriptionDeliveryAddressClientTest.validAddress();
            if (kind.equals("foreign")) body.put("identityId", UUID.randomUUID().toString());
            if (kind.equals("inactive")) body.put("active", false);
            if (kind.equals("incomplete")) body.put("addressLine1", "");
            server.expect(anything()).andRespond(withSuccess(body.toString(), MediaType.APPLICATION_JSON));
        }
    }
    void eligibleAddress(UUID addressId) {
        server.expect(requestTo("http://localhost/internal/v1/customer-addresses/" + addressId + "?identityId=" + customer))
            .andRespond(withSuccess(SubscriptionDeliveryAddressClientTest.validAddress().put("id", addressId.toString()).toString(), MediaType.APPLICATION_JSON));
    }
    CurrentUser user() { return new CurrentUser(customer, "synthetic", "+919999999999", List.of("CUSTOMER")); }
    int count(String table) { return db.queryForObject("SELECT count(*) FROM subscription_schema." + table, Integer.class); }
    UUID seedSubscription(UUID addressId, LocalDate date) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date,next_billing_date,delivery_address_id,enrollment_idempotency_key) VALUES (?,?,?,?,'PENDING_PAYMENT',?,?,?,?)",
            id, customer, plan, chef, date, date, addressId, "cp03-" + id);
        return id;
    }
    void noBillingArtifacts() {
        assertEquals(0, count("subscription_invoice"));
        assertEquals(0, count("subscription_invoice_history"));
        assertEquals(0, count("subscription_payment_outbox"));
    }

    @ParameterizedTest @ValueSource(strings = {"missing", "foreign", "inactive", "incomplete", "outage"})
    void invalidAddressCreatesNoEnrollmentHoldInvoiceOrOutbox(String kind) {
        addressFailure(kind);
        assertThrows(ApiException.class, () -> tx.execute(status -> service.createSubscription(
            new CreateSubscriptionRequest(plan, today.plusDays(1), address, null), "cp03-create", user())));
        assertEquals(0, count("customer_subscription"));
        assertEquals(0, count("subscription_status_history"));
        assertEquals(0, count("subscription_capacity_entitlement"));
        noBillingArtifacts();
        verify(capacity, never()).acquireEnrollmentHold(any());
        server.verify();
    }

    @Test void validEnrollmentStoresOnceAndAcquiresHoldAfterVerification() {
        eligibleAddress(address);
        var created = tx.execute(status -> service.createSubscription(new CreateSubscriptionRequest(plan, today.plusDays(1), address, null), "cp03-valid", user()));
        assertNotNull(created);
        assertEquals(1, count("customer_subscription"));
        assertEquals("PENDING_PAYMENT", created.status());
        verify(capacity).acquireEnrollmentHold(argThat(row -> row.id().equals(created.id())));
        noBillingArtifacts();
        server.verify();
    }

    @ParameterizedTest @ValueSource(strings = {"missing", "foreign", "inactive", "incomplete", "outage"})
    void failedBillingCheckPreservesDateAndCreatesNoInvoiceHistoryOrOutbox(String kind) {
        UUID subscription = seedSubscription(address, today);
        addressFailure(kind);
        var result = billing.generateDueInvoices();
        assertEquals(1, result.failed());
        assertEquals(0, result.created());
        noBillingArtifacts();
        assertEquals(today, db.queryForObject("SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id=?", LocalDate.class, subscription));
        assertNotNull(db.queryForObject("SELECT billing_lock_token FROM subscription_schema.customer_subscription WHERE id=?", UUID.class, subscription));
        assertEquals(0, billing.generateDueInvoices().claimed());
        server.verify();
    }

    @Test void invalidOlderAddressCannotStarveLaterValidInvoiceEvenAfterCooldownExpires() {
        properties.setBatchSize(1);
        UUID invalid = seedSubscription(address, today.minusDays(2));
        UUID validAddress = UUID.randomUUID();
        UUID valid = seedSubscription(validAddress, today.minusDays(1));
        addressFailure("inactive");
        assertEquals(1, billing.generateDueInvoices().failed());
        // Even once the invalid claim is stale, a never-attempted due row must get its turn.
        db.update("UPDATE subscription_schema.customer_subscription SET billing_locked_at=now()-interval '11 minutes' WHERE id=?", invalid);
        server.reset();
        eligibleAddress(validAddress);
        assertEquals(1, billing.generateDueInvoices().created());
        assertEquals(1, count("subscription_invoice"));
        assertEquals(valid, db.queryForObject("SELECT subscription_id FROM subscription_schema.subscription_invoice", UUID.class));
        assertEquals(1, count("subscription_invoice_history"));
        assertEquals(1, count("subscription_payment_outbox"));
        assertEquals(today.minusDays(2), db.queryForObject("SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id=?", LocalDate.class, invalid));
        server.verify();
        // Put valid next cycle outside the horizon, then prove repaired address retries its original cycle.
        db.update("UPDATE subscription_schema.customer_subscription SET next_billing_date=? WHERE id=?", today.plusDays(30), valid);
        server.reset();
        eligibleAddress(address);
        assertEquals(1, billing.generateDueInvoices().created());
        assertEquals(2, count("subscription_invoice"));
        assertEquals(today.minusDays(2), db.queryForObject("SELECT cycle_start FROM subscription_schema.subscription_invoice WHERE subscription_id=?", LocalDate.class, invalid));
        assertNull(db.queryForObject("SELECT billing_lock_token FROM subscription_schema.customer_subscription WHERE id=?", UUID.class, invalid));
        server.verify();
    }

    @Test void lostClaimRollsBackInvoiceHistoryAndOutboxThroughProductionTransactionAnnotations() {
        UUID id = seedSubscription(address, today);
        var claim = billingRepository.claimDue(7, 10, 1).getFirst();
        UUID replacement = UUID.randomUUID();
        db.update("UPDATE subscription_schema.customer_subscription SET billing_lock_token=? WHERE id=?", replacement, id);
        assertThrows(IllegalStateException.class, () -> billingRepository.createInvoiceAndOutbox(claim,
            today.plusWeeks(1), UUID.randomUUID(), UUID.randomUUID(), new ObjectMapper().createObjectNode()));
        noBillingArtifacts();
        assertEquals(today, db.queryForObject("SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id=?", LocalDate.class, id));
        assertEquals(replacement, db.queryForObject("SELECT billing_lock_token FROM subscription_schema.customer_subscription WHERE id=?", UUID.class, id));
    }

    @Test void deferCannotAlterAReplacementClaim() {
        UUID id = seedSubscription(address, today);
        var claim = billingRepository.claimDue(7, 10, 1).getFirst();
        UUID replacement = UUID.randomUUID();
        db.update("UPDATE subscription_schema.customer_subscription SET billing_lock_token=?, billing_locked_at='2000-01-01T00:00:00Z' WHERE id=?", replacement, id);
        billingRepository.deferAddressFailure(claim);
        assertEquals(replacement, db.queryForObject("SELECT billing_lock_token FROM subscription_schema.customer_subscription WHERE id=?", UUID.class, id));
        assertEquals(2000, db.queryForObject("SELECT extract(year from billing_locked_at)::int FROM subscription_schema.customer_subscription WHERE id=?", Integer.class, id));
        noBillingArtifacts();
    }
}
