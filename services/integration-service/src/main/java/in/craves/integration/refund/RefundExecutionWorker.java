package in.craves.integration.refund;

import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.config.RazorpayProviderProperties;
import in.craves.integration.refund.CashfreeRefundClient.RefundProviderConfigurationException;
import in.craves.integration.refund.RefundModels.ProviderRefundResult;
import in.craves.integration.refund.RefundModels.RefundWorkItem;
import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class RefundExecutionWorker {
    private static final Logger LOGGER=LoggerFactory.getLogger(RefundExecutionWorker.class);
    private final RefundWorkflowProperties properties;
    private final PaymentRoutingProperties routing;
    private final RazorpayProviderProperties razorpay;
    private final RefundRepository repository;
    private final RazorpayRefundClient client;

    public RefundExecutionWorker(RefundWorkflowProperties properties,PaymentProviderProperties ignored,
        PaymentRoutingProperties routing,RazorpayProviderProperties razorpay,RefundRepository repository,
        CashfreeRefundClient legacy,RazorpayRefundClient client) {
        this.properties=properties;this.routing=routing;this.razorpay=razorpay;this.repository=repository;this.client=client;
    }
    @PostConstruct void validateProductionActivation() {
        if(routing.razorpay()&&razorpay.production()) {
            if(properties.isProviderExecutionEnabled()&&!properties.isProductionProviderExecutionApproved())
                throw new IllegalStateException("Production refund execution approval is required");
            if(properties.isReconciliationEnabled()&&!properties.isProductionReconciliationApproved())
                throw new IllegalStateException("Production refund reconciliation approval is required");
        }
    }
    @Scheduled(fixedDelayString="${craves.refund.worker-fixed-delay-ms:30000}")
    public void process() {
        // Historical providers are not silently routed through current merchant credentials.
        if(!routing.razorpay()||!routing.razorpayEnabled())return;
        boolean create=properties.isProviderExecutionEnabled()&&razorpay.paymentExecutionAllowed();
        boolean reconcile=properties.isReconciliationEnabled();
        if(razorpay.production()) {
            create&=properties.isProductionProviderExecutionApproved();
            reconcile&=properties.isProductionReconciliationApproved();
        }
        if(!create&&!reconcile)return;
        // Existing unknown financial exposure blocks new creation even when a legacy runtime flag is still true.
        if(create&&repository.hasUnknownHistoricalExposure(razorpay.environment()))create=false;
        final boolean creationAllowed=create,reconciliationAllowed=reconcile;
        for(var item:repository.claimBatch(create,reconcile,properties.validatedWorkerBatchSize(),
            properties.validatedMaxProviderAttempts(),properties.validatedStaleLockSeconds(),UUID.randomUUID(),
            routing.provider(),razorpay.environment()))processOne(item,creationAllowed,reconciliationAllowed);
    }
    void processOne(RefundWorkItem item,boolean create,boolean reconcile) {
        boolean preparing=false,prepared=false;
        try {
            if(!"RAZORPAY".equals(item.provider()))throw new RefundProviderConfigurationException("PROVIDER_SCOPE_BLOCKED");
            ProviderRefundResult result;
            switch(item.workKind()) {
                case "CREATE" -> {
                    if(!create || repository.hasUnknownHistoricalExposure(razorpay.environment())) {
                        Instant now=Instant.now();
                        repository.deferUnsentClaim(item,now.plusSeconds(properties.validatedRetryBaseDelaySeconds()),now);
                        return;
                    }
                    String body=client.prepareRequest(item);
                    preparing=true;
                    var dispatch=repository.prepareDispatch(item,body);
                    prepared=true;result=client.createRefund(item,dispatch.body(),dispatch.sha256());
                }
                case "GET" -> {
                    if(!reconcile)throw new RefundProviderConfigurationException("RECONCILIATION_DISABLED");
                    result=client.getRefund(item);
                }
                case "LOOKUP" -> {
                    if(!reconcile)throw new RefundProviderConfigurationException("RECONCILIATION_DISABLED");
                    result=client.findExistingRefund(item);
                }
                default -> throw new RefundProviderConfigurationException("UNCLASSIFIED_REFUND_CLAIM");
            }
            applyResult(item,result);
        } catch(RuntimeException exception) {
            if(preparing&&!prepared) {
                // No HTTP call has happened. An ambiguous DB commit must not be described as an unknown transfer.
                // The exact-count CAS leaves an already-committed intent untouched for ordinary stale-claim recovery.
                Instant now=Instant.now();
                repository.deferUnsentClaim(item,now.plusSeconds(properties.validatedRetryBaseDelaySeconds()),now);
                LOGGER.warn("Refund dispatch preparation deferred refundId={}",item.refundId());
                return;
            }
            String kind="UNKNOWN_OUTCOME";
            boolean safeRetry=prepared&&!(exception instanceof RazorpayRefundClient.RefundEvidenceException)
                &&!(exception instanceof RefundProviderConfigurationException);
            if(exception instanceof RazorpayRefundClient.RefundEvidenceException) {
                kind=switch(exception.getMessage()) {
                    case "LOOKUP_NO_MATCH" -> "LOOKUP_NO_MATCH";
                    case "LOOKUP_AMBIGUOUS" -> "LOOKUP_AMBIGUOUS";
                    default -> "INVALID_PROVIDER_EVIDENCE";
                };
            } else if(exception instanceof RefundProviderConfigurationException)kind="CONFIGURATION_BLOCKED";
            else if(exception instanceof RazorpayRefundClient.RefundHttpException http
                &&http.status()>=400&&http.status()<500&&!java.util.Set.of(408,409,429).contains(http.status())) {
                kind=prepared?"CREATE_REJECTED":"UNKNOWN_OUTCOME";safeRetry=false;
            }
            if((prepared&&item.attemptCount()+1>=properties.validatedMaxProviderAttempts())
                ||(!"CREATE".equals(item.workKind())&&item.consecutiveReconciliationFailures()+1>=properties.validatedMaxProviderAttempts())) {
                kind="RECONCILIATION_LIMIT";safeRetry=false;
            }
            Instant now=Instant.now();
            repository.markUnknown(item,now.plusSeconds(retryDelay(item)),kind,safeRetry,now);
            // Never log provider exception causes, HTTP response bodies, headers or credentials.
            LOGGER.warn("Refund requires retry/reconciliation refundId={} reason={}",item.refundId(),kind);
        }
    }
    private void applyResult(RefundWorkItem item,ProviderRefundResult result) {
        Instant now=Instant.now();String status=result.providerStatus();
        String normalized=switch(status) {
            case "SUCCESS" -> "REFUNDED";case "PENDING","ONHOLD" -> "REFUND_PENDING";
            case "FAILED","CANCELLED" -> "REFUND_FAILED";
            default -> throw new RazorpayRefundClient.RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");
        };
        Instant next=now.plus(5,ChronoUnit.MINUTES);
        repository.applyProviderResult(item,result,status,normalized,next,now);
    }
    private long retryDelay(RefundWorkItem item) {
        int attempts=Math.max(item.attemptCount(),item.reconciliationAttemptCount());
        long factor=1L<<Math.min(20,Math.max(0,attempts-1));
        return Math.min(3600L,Math.min(3600,properties.validatedRetryBaseDelaySeconds())*factor);
    }
}
