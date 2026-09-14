package in.craves.integration.refund;

import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.config.RazorpayProviderProperties;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class RefundProductionReadinessService {
    private final RefundWorkflowProperties refund;
    private final PaymentRoutingProperties routing;
    private final RazorpayProviderProperties razorpay;
    private final JdbcTemplate jdbc;
    public RefundProductionReadinessService(RefundWorkflowProperties refund,PaymentProviderProperties legacy,
        PaymentRoutingProperties routing,RazorpayProviderProperties razorpay,JdbcTemplate jdbc) {
        this.refund=refund;this.routing=routing;this.razorpay=razorpay;this.jdbc=jdbc;
    }
    public ReadinessResponse status() {
        long executable=count("SELECT count(*) FROM payment_schema.refund WHERE provider='RAZORPAY' AND provider_refund_id IS NULL AND NOT recovery_required AND ((status='REQUESTED' AND attempt_count=0) OR (status='RETRY' AND dispatch_protocol='RAZORPAY_REFUND_IDEMPOTENCY_V1'))");
        long reconcilable=count("SELECT count(*) FROM payment_schema.refund WHERE status IN ('PENDING','ONHOLD','RETRY','PROCESSING','DEAD_LETTER') AND (NULLIF(btrim(provider_refund_id),'') IS NOT NULL OR attempt_count>0) AND consecutive_reconciliation_failures<?",refund.validatedMaxProviderAttempts());
        long exhausted=count("SELECT count(*) FROM payment_schema.refund WHERE status IN ('PENDING','ONHOLD','RETRY','PROCESSING','DEAD_LETTER') AND consecutive_reconciliation_failures>=?",refund.validatedMaxProviderAttempts());
        long processing=count("SELECT count(*) FROM payment_schema.refund WHERE status='PROCESSING'");
        long dead=count("SELECT count(*) FROM payment_schema.refund WHERE status='DEAD_LETTER'");
        long unknown=count("""
            SELECT count(*) FROM payment_schema.refund r LEFT JOIN payment_schema.payment_order p ON p.id=r.payment_order_id
            WHERE (r.recovery_required OR (r.attempt_count>0 AND NULLIF(btrim(r.provider_refund_id),'') IS NULL AND r.dispatch_protocol IS NULL))
              AND NOT (?='PRODUCTION' AND r.provider='RAZORPAY' AND p.provider=r.provider AND coalesce(left(p.checkout_key_id,9),'')='rzp_test_')
            """,razorpay.environment());
        long historicalTest=count("SELECT count(*) FROM payment_schema.refund r JOIN payment_schema.payment_order p ON p.id=r.payment_order_id WHERE r.provider='RAZORPAY' AND p.provider=r.provider AND left(p.checkout_key_id,9)='rzp_test_'");
        long actionableDead=count("""
            SELECT count(*) FROM payment_schema.refund r LEFT JOIN payment_schema.payment_order p ON p.id=r.payment_order_id
            WHERE r.status='DEAD_LETTER' AND NOT (?='PRODUCTION' AND r.provider='RAZORPAY' AND p.provider=r.provider
              AND coalesce(left(p.checkout_key_id,9),'')='rzp_test_')
            """,razorpay.environment());
        long modeMismatch=count("""
            SELECT count(*) FROM payment_schema.refund r LEFT JOIN payment_schema.payment_order p ON p.id=r.payment_order_id
            WHERE r.status NOT IN ('SUCCESS','FAILED','CANCELLED')
              AND NOT (?='PRODUCTION' AND r.provider='RAZORPAY' AND p.provider=r.provider AND coalesce(left(p.checkout_key_id,9),'')='rzp_test_') AND
              (r.provider<>'RAZORPAY' OR p.id IS NULL OR p.provider IS DISTINCT FROM r.provider
               OR p.provider_payment_id IS DISTINCT FROM r.provider_payment_id OR p.provider_order_id IS DISTINCT FROM r.provider_order_id
               OR p.checkout_id IS DISTINCT FROM r.checkout_id OR p.customer_identity_id IS DISTINCT FROM r.customer_identity_id
               OR p.currency IS DISTINCT FROM r.currency OR r.amount>p.amount
               OR coalesce(left(p.checkout_key_id,9),'')<>?)
            """,razorpay.environment(),razorpay.production()?"rzp_live_":"rzp_test_");
        long statusPending=count("SELECT count(*) FROM payment_schema.refund_status_outbox WHERE status IN ('PENDING','FAILED','PROCESSING')");
        long statusDead=count("SELECT count(*) FROM payment_schema.refund_status_outbox WHERE status='DEAD_LETTER'");
        long inboxFailed=count("SELECT count(*) FROM payment_schema.refund_request_inbox WHERE processing_status IN ('FAILED','REJECTED')");
        List<ProviderCount> providers=jdbc.query("""
            SELECT CASE WHEN provider IN ('RAZORPAY','CASHFREE') THEN provider ELSE 'OTHER' END AS provider,
              count(*) AS rows,count(*) FILTER(WHERE status NOT IN ('SUCCESS','FAILED','CANCELLED')) AS unresolved,
              count(*) FILTER(WHERE attempt_count>0 AND NULLIF(btrim(provider_refund_id),'') IS NULL) AS attempted_missing_id
            FROM payment_schema.refund GROUP BY 1 ORDER BY 1
            """,(r,n)->new ProviderCount(r.getString("provider"),r.getLong("rows"),r.getLong("unresolved"),r.getLong("attempted_missing_id")));
        List<String> blockers=new ArrayList<>();
        if(!routing.razorpay()||!routing.razorpayEnabled())blockers.add("ACTIVE_REFUND_PROVIDER_NOT_SUPPORTED");
        if(!razorpay.production())blockers.add("RAZORPAY_ENVIRONMENT_NOT_PRODUCTION");
        boolean providerReady=razorpay.productionActivationApproved()&&StringUtils.hasText(razorpay.keyId())
            &&razorpay.keyId().startsWith("rzp_live_")&&StringUtils.hasText(razorpay.keySecret());
        if(!providerReady)blockers.add("RAZORPAY_PRODUCTION_NOT_READY");
        if(!refund.isConsumerEnabled())blockers.add("REFUND_REQUEST_CONSUMER_DISABLED");
        if(!refund.isStatusPublisherEnabled())blockers.add("REFUND_STATUS_PUBLISHER_DISABLED");
        if(!StringUtils.hasText(refund.getFullyQualifiedNamespace())&&!StringUtils.hasText(refund.getConnectionString()))
            blockers.add("SERVICE_BUS_NOT_CONFIGURED");
        if(statusDead>0)blockers.add("REFUND_STATUS_OUTBOX_DEAD_LETTER_NOT_EMPTY");
        if(inboxFailed>0)blockers.add("REFUND_REQUEST_INBOX_FAILURES_PRESENT");
        boolean downstream=blockers.isEmpty();
        boolean reconciliation=downstream&&refund.isProductionReconciliationApproved()&&refund.isReconciliationEnabled();
        if(unknown>0)blockers.add("UNKNOWN_REFUND_OUTCOMES_REQUIRE_RECOVERY");
        if(exhausted>0)blockers.add("REFUND_RECONCILIATION_FAILURE_BUDGET_EXHAUSTED");
        if(modeMismatch>0)blockers.add("HISTORICAL_PROVIDER_MODE_OR_PAYMENT_LINK_REQUIRES_REVIEW");
        if(actionableDead>0)blockers.add("HISTORICAL_REFUND_DEAD_LETTERS_REQUIRE_REVIEW");
        boolean eligible=blockers.isEmpty()&&razorpay.paymentExecutionAllowed();
        boolean execution=eligible
            &&refund.isProductionProviderExecutionApproved()&&refund.isProviderExecutionEnabled();
        return new ReadinessResponse(routing.provider(),razorpay.environment(),RazorpayRefundClient.PROTOCOL,
            downstream,eligible,execution,reconciliation,refund.isConsumerEnabled(),refund.isStatusPublisherEnabled(),
            refund.isProductionProviderExecutionApproved(),refund.isProductionReconciliationApproved(),
            executable,reconcilable,processing,dead,statusPending,statusDead,inboxFailed,unknown,modeMismatch,historicalTest,exhausted,providers,List.copyOf(blockers));
    }
    private long count(String sql,Object... args){Long value=jdbc.queryForObject(sql,Long.class,args);return value==null?0:value;}
    public record ProviderCount(String provider,long rows,long unresolved,long attemptedMissingId) {}
    public record ReadinessResponse(String paymentProvider,String paymentEnvironment,String dispatchProtocol,
        boolean downstreamReady,boolean providerExecutionEligible,boolean providerExecutionReady,boolean reconciliationReady,
        boolean consumerEnabled,boolean statusPublisherEnabled,boolean productionProviderExecutionApproved,
        boolean productionReconciliationApproved,long executableRefundCount,long reconcilableRefundCount,
        long processingRefundCount,long refundDeadLetterCount,long statusOutboxPendingCount,
        long statusOutboxDeadLetterCount,long requestInboxFailureCount,long unknownOutcomeCount,
        long historicalModeMismatchCount,long historicalTestRefundCount,long reconciliationExhaustedCount,
        List<ProviderCount> providerCounts,List<String> blockers) {}
}
