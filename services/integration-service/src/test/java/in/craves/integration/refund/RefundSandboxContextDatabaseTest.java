package in.craves.integration.refund;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/** Disposable database only; all provider receipts below are synthetic fixtures. */
@EnabledIfEnvironmentVariable(named="REFUND_TEST_JDBC_URL",matches=".+")
class RefundSandboxContextDatabaseTest {
    private final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
    private JdbcTemplate jdbc;
    private RefundRepository repository;
    private UUID payment,refund,checkout,customer,chefOrder;

    @BeforeEach void database() {
        String url=System.getenv("REFUND_TEST_JDBC_URL");
        assertEquals("true",System.getenv("CRAVES_REFUND_DISPOSABLE_DATABASE"));
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/craves_refund_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("REFUND_TEST_DB_USER"),System.getenv("REFUND_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds);
        assertEquals("craves_refund_test",jdbc.queryForObject("SELECT current_database()",String.class));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema")
            .locations("classpath:db/migration").load().migrate();
        repository=new RefundRepository(jdbc,new RefundStatusEventFactory(json));
        payment=UUID.randomUUID();refund=UUID.randomUUID();checkout=UUID.randomUUID();
        customer=UUID.randomUUID();chefOrder=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,
              cashfree_order_id,cashfree_cf_order_id,amount,currency,status,provider,provider_order_id,provider_payment_id)
            VALUES (?,?,?,'SANDBOX_CONTEXT_FIXTURE','sandbox_order','991',440,'INR','PAID','CASHFREE','sandbox_order','991')
            """,payment,checkout,customer);
        jdbc.update("""
            INSERT INTO payment_schema.payment_attempt(id,payment_order_id,provider,cf_payment_id,provider_payment_id,
              payment_status,payment_amount,payment_currency)
            VALUES (?,?,'CASHFREE','880','880','SUCCESS',440,'INR')
            """,UUID.randomUUID(),payment);
        jdbc.update("""
            INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,reason,checkout_id,
              chef_sub_order_id,customer_identity_id,provider,cashfree_order_id,provider_order_id,provider_payment_id,
              provider_refund_id,idempotency_key,request_event_id,attempt_count,provider_payload)
            VALUES (?,?,'sandbox_refund',220,'INR','PENDING','CHEF_DECLINED',?,?,?,'CASHFREE','sandbox_order','sandbox_order',
              NULL,'700',?,?,8,'{}')
            """,refund,payment,checkout,chefOrder,customer,UUID.randomUUID(),UUID.randomUUID());
    }

    private ObjectNode refundProof() {
        return json.createObjectNode().put("entity","refund").put("order_id","sandbox_order")
            .put("refund_id","sandbox_refund").put("cf_payment_id","880").put("cf_refund_id","700")
            .put("refund_amount",220).put("refund_currency","INR").put("refund_status","PENDING");
    }
    private ObjectNode orderProof() {
        return json.createObjectNode().put("order_id","sandbox_order").put("cf_order_id","991")
            .put("order_amount",440).put("order_currency","INR").put("order_status","PAID");
    }
    private String context() {
        return jdbc.queryForObject("SELECT payment_schema.refund_source_context(?)::text",String.class,refund);
    }
    private void review(String kind,ObjectNode evidence) { review(kind,evidence,context()); }
    private void review(String kind,ObjectNode evidence,String source) {
        jdbc.update("""
            INSERT INTO payment_schema.refund_sandbox_context_review(id,refund_id,source_context,source_sha256,
              proof_kind,verified_payment_id,provider_origin,credential_reference,evidence,evidence_sha256,observed_at,reason)
            VALUES (?,?,?::jsonb,encode(sha256(convert_to((?::jsonb)::text,'UTF8')),'hex'),?,'880',
              'https://sandbox.cashfree.com','craves-integration-cashfree-sandbox-client-id',?::jsonb,
              encode(sha256(convert_to((?::jsonb)::text,'UTF8')),'hex'),clock_timestamp(),
              'Isolated synthetic sandbox provenance test; not a financial outcome')
            """,UUID.randomUUID(),refund,source,source,kind,evidence.toString(),evidence.toString());
    }
    private boolean classified() {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT payment_schema.refund_verified_cashfree_sandbox(?)",Boolean.class,refund));
    }
    private RefundProductionReadinessService.ReadinessResponse readiness() {
        var flags=new RefundWorkflowProperties();flags.setConsumerEnabled(true);flags.setStatusPublisherEnabled(true);
        flags.setConnectionString("NONSECRET_TEST_BUS_CONFIGURATION");flags.setProviderExecutionEnabled(true);
        flags.setReconciliationEnabled(true);flags.setProductionProviderExecutionApproved(true);
        flags.setProductionReconciliationApproved(true);
        return new RefundProductionReadinessService(flags,mock(PaymentProviderProperties.class),
            new PaymentRoutingProperties("RAZORPAY",false,true),RefundTestData.properties(true),jdbc).status();
    }

    @Test void migrationNeverClassifiesUnknownCashfreeAutomatically() {
        assertFalse(classified());assertTrue(repository.hasUnknownHistoricalExposure("PRODUCTION"));
        assertFalse(readiness().providerExecutionEligible());
    }
    @Test void verifiedSandboxIsSeparatedWithoutChangingPaymentsOutcomesOrHolds() {
        String before=context();review("SANDBOX_REFUND",refundProof());
        assertTrue(classified());assertFalse(repository.hasUnknownHistoricalExposure("PRODUCTION"));
        assertTrue(repository.hasUnknownHistoricalExposure("SANDBOX"));
        assertEquals(before,context());assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM payment_schema.refund WHERE id=?",String.class,refund));
        var status=readiness();assertTrue(status.providerExecutionEligible());assertEquals(1,status.historicalTestRefundCount());
        assertEquals(1,status.providerCounts().getFirst().unresolved());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.refund_status_outbox",Integer.class));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_chef_payout_control",Integer.class));
    }
    @Test void staleSourceNeverReceivesAReview() {
        String before=context();jdbc.update("UPDATE payment_schema.refund SET amount=221 WHERE id=?",refund);
        assertThrows(RuntimeException.class,()->review("SANDBOX_REFUND",refundProof(),before));assertFalse(classified());
    }
    @Test void sourceChangesInvalidatePreviouslyReviewedContext() {
        review("SANDBOX_REFUND",refundProof());
        jdbc.update("UPDATE payment_schema.payment_order SET provider_payment_id='changed' WHERE id=?",payment);
        assertFalse(classified());assertTrue(repository.hasUnknownHistoricalExposure("PRODUCTION"));
        assertFalse(readiness().providerExecutionEligible());
    }
    @ParameterizedTest @ValueSource(strings={"order_id","refund_id","cf_payment_id","cf_refund_id","refund_currency","entity"})
    void mismatchedProviderFieldsAreRejected(String field) {
        var proof=refundProof().put(field,"different");
        assertThrows(RuntimeException.class,()->review("SANDBOX_REFUND",proof));assertFalse(classified());
    }
    @Test void wrongAmountIsRejected() {
        assertThrows(RuntimeException.class,()->review("SANDBOX_REFUND",refundProof().put("refund_amount",221)));assertFalse(classified());
    }
    @Test void missingEvidenceCannotPassNullSqlChecks() {
        assertThrows(RuntimeException.class,()->review("SANDBOX_REFUND",json.createObjectNode()));assertFalse(classified());
    }
    @Test void explicitLiveBindingCanNeverBeClassifiedSandbox() {
        jdbc.update("UPDATE payment_schema.payment_order SET checkout_key_id='rzp_live_FIXTURE' WHERE id=?",payment);
        assertThrows(RuntimeException.class,()->review("SANDBOX_REFUND",refundProof()));assertFalse(classified());
    }
    @Test void missingSuccessfulPaymentCannotBeClassified() {
        jdbc.update("UPDATE payment_schema.payment_attempt SET payment_status='FAILED' WHERE payment_order_id=?",payment);
        assertThrows(RuntimeException.class,()->review("SANDBOX_REFUND",refundProof()));assertFalse(classified());
    }
    @Test void secondDistinctSuccessfulPaymentRequiresReview() {
        jdbc.update("""
            INSERT INTO payment_schema.payment_attempt(id,payment_order_id,provider,cf_payment_id,provider_payment_id,
              payment_status,payment_amount,payment_currency) VALUES (?,?,'CASHFREE','881','881','SUCCESS',440,'INR')
            """,UUID.randomUUID(),payment);
        assertThrows(RuntimeException.class,()->review("SANDBOX_REFUND",refundProof()));assertFalse(classified());
    }
    @Test void newUnreviewedRefundStillBlocksProduction() {
        review("SANDBOX_REFUND",refundProof());
        jdbc.update("""
            INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,provider)
            VALUES (?,?,'unreviewed',1,'INR','PENDING','CASHFREE')
            """,UUID.randomUUID(),payment);
        assertTrue(repository.hasUnknownHistoricalExposure("PRODUCTION"));assertFalse(readiness().providerExecutionEligible());
    }
    @Test void appendOnlyEvidenceCannotBeUpdatedDeletedTruncatedOrOverwritten() {
        review("SANDBOX_REFUND",refundProof());
        assertThrows(RuntimeException.class,()->jdbc.execute("UPDATE payment_schema.refund_sandbox_context_review SET reason='changed review reason text'"));
        assertThrows(RuntimeException.class,()->jdbc.execute("DELETE FROM payment_schema.refund_sandbox_context_review"));
        assertThrows(RuntimeException.class,()->jdbc.execute("TRUNCATE payment_schema.refund_sandbox_context_review"));
        assertThrows(RuntimeException.class,()->review("SANDBOX_REFUND",refundProof()));assertTrue(classified());
    }
    @Test void sandboxUnknownOutcomeIsNotConvertedIntoFailedOrSuccessfulRefund() {
        // Separate original fixture, before any immutable provider refund ID is bound.
        UUID unknown=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,reason,checkout_id,
              chef_sub_order_id,customer_identity_id,provider,cashfree_order_id,provider_order_id,provider_payment_id,
              idempotency_key,request_event_id,attempt_count,provider_payload)
            VALUES (?,?,'unknown_sandbox',220,'INR','DEAD_LETTER','CHEF_DECLINED',?,?,?,'CASHFREE',
              'sandbox_order','sandbox_order','991',?,?,8,'{}')
            """,unknown,payment,checkout,UUID.randomUUID(),customer,UUID.randomUUID(),UUID.randomUUID());
        review("SANDBOX_REFUND",refundProof());refund=unknown;
        review("SANDBOX_ORDER_REFUND_UNKNOWN",orderProof());
        assertTrue(classified());assertFalse(repository.hasUnknownHistoricalExposure("PRODUCTION"));
        assertEquals("DEAD_LETTER",jdbc.queryForObject("SELECT status FROM payment_schema.refund WHERE id=?",String.class,refund));
        assertNull(jdbc.queryForObject("SELECT provider_refund_id FROM payment_schema.refund WHERE id=?",String.class,refund));
        assertEquals(8,jdbc.queryForObject("SELECT attempt_count FROM payment_schema.refund WHERE id=?",Integer.class,refund));
        assertEquals(1,readiness().refundDeadLetterCount());assertEquals(0,readiness().unknownOutcomeCount());
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.refund_status_outbox",Integer.class));
    }
}
