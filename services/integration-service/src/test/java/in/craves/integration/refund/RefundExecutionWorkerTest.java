package in.craves.integration.refund;

import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import in.craves.integration.refund.RefundModels.ProviderRefundResult;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class RefundExecutionWorkerTest {
    RefundWorkflowProperties flags;RefundRepository repository;RazorpayRefundClient client;RefundExecutionWorker worker;
    @BeforeEach void setup() {
        flags=new RefundWorkflowProperties();repository=mock(RefundRepository.class);client=mock(RazorpayRefundClient.class);
        worker=new RefundExecutionWorker(flags,mock(PaymentProviderProperties.class),new PaymentRoutingProperties("RAZORPAY",false,true),
            RefundTestData.properties(true),repository,mock(CashfreeRefundClient.class),client);
    }
    @Test void reconciliationOnlyMissingIdPerformsLookupNeverCreate() {
        var item=RefundTestData.item("LOOKUP","DEAD_LETTER",8,null);
        when(client.findExistingRefund(item)).thenReturn(new ProviderRefundResult("SUCCESS","rfnd_found","{}"));
        worker.processOne(item,false,true);
        verify(client).findExistingRefund(item);verify(client,never()).createRefund(any(),anyString(),anyString());
        verify(repository).applyProviderResult(eq(item),any(),eq("SUCCESS"),eq("REFUNDED"),any(),any());
    }
    @Test void createClaimCannotBypassExecutionFlag() {
        var item=RefundTestData.item("CREATE","REQUESTED",1,null);worker.processOne(item,false,true);
        verifyNoInteractions(client);verify(repository).deferUnsentClaim(eq(item),any(),any());
        verify(repository,never()).markUnknown(any(),any(),anyString(),anyBoolean(),any());
    }
    @Test void getClaimCannotBypassReconciliationFlag() {
        worker.processOne(RefundTestData.item("GET","PENDING",1,"rfnd_known"),true,false);verifyNoInteractions(client);
    }
    @Test void knownIdRetryRemainsGetOnly() {
        var item=RefundTestData.item("GET","RETRY",8,"rfnd_known");
        when(client.getRefund(item)).thenReturn(new ProviderRefundResult("PENDING","rfnd_known","{}"));
        worker.processOne(item,false,true);verify(client).getRefund(item);verify(client,never()).createRefund(any(),anyString(),anyString());
    }
    @Test void lostCreationRetriesOnlyAfterDurablePreparation() {
        var item=RefundTestData.item("CREATE","REQUESTED",1,null);
        when(client.prepareRequest(item)).thenReturn("BODY");
        when(repository.prepareDispatch(item,"BODY")).thenReturn(new RefundRepository.PreparedDispatch("BODY","HASH"));
        when(client.createRefund(item,"BODY","HASH")).thenThrow(new RuntimeException("transport-body-must-not-be-logged"));
        worker.processOne(item,true,true);
        var order=inOrder(repository,client);order.verify(client).prepareRequest(item);order.verify(repository).prepareDispatch(item,"BODY");
        order.verify(client).createRefund(item,"BODY","HASH");
        verify(repository).markUnknown(eq(item),any(),eq("UNKNOWN_OUTCOME"),eq(true),any());
        verify(repository,never()).applyProviderResult(any(),any(),anyString(),eq("REFUND_FAILED"),any(),any());
    }
    @Test void exhaustedUnknownCreationNeverPublishesFalseFailure() {
        var item=RefundTestData.item("CREATE","RETRY",8,null);
        when(client.prepareRequest(item)).thenReturn("BODY");when(repository.prepareDispatch(item,"BODY"))
            .thenReturn(new RefundRepository.PreparedDispatch("BODY","HASH"));
        when(client.createRefund(item,"BODY","HASH")).thenThrow(new RuntimeException("timeout"));
        worker.processOne(item,true,true);
        verify(repository).markUnknown(eq(item),any(),eq("RECONCILIATION_LIMIT"),eq(false),any());
        verify(repository,never()).applyProviderResult(any(),any(),anyString(),anyString(),any(),any());
    }
    @Test void historicalUnknownExposureForcesCreateOffEvenIfOldRuntimeFlagStillTrue() {
        flags.setProviderExecutionEnabled(true);flags.setProductionProviderExecutionApproved(true);
        flags.setReconciliationEnabled(true);flags.setProductionReconciliationApproved(true);
        when(repository.hasUnknownHistoricalExposure("PRODUCTION")).thenReturn(true);
        when(repository.claimBatch(anyBoolean(),anyBoolean(),anyInt(),anyInt(),anyInt(),any(UUID.class),anyString(),anyString())).thenReturn(List.of());
        worker.process();verify(repository).claimBatch(eq(false),eq(true),anyInt(),anyInt(),anyInt(),any(UUID.class),eq("RAZORPAY"),eq("PRODUCTION"));
        verifyNoInteractions(client);
    }
    @Test void falseDefaultsDoNotClaimOrCallProvider() {worker.process();verifyNoInteractions(repository,client);}
    @Test void malformedLegacyClaimIsHeldWithoutInferringCreate() {
        var item=RefundTestData.item("UNCLASSIFIED","PENDING",3,null);worker.processOne(item,true,true);
        verifyNoInteractions(client);verify(repository).markUnknown(eq(item),any(),eq("CONFIGURATION_BLOCKED"),eq(false),any());
    }
    @Test void stalePreparedClaimFailsBeforeAnyProviderPost() {
        var item=RefundTestData.item("CREATE","RETRY",1,null);
        when(client.prepareRequest(item)).thenReturn("BODY");
        when(repository.prepareDispatch(item,"BODY")).thenThrow(new RazorpayRefundClient.RefundEvidenceException("STALE_REFUND_CLAIM"));
        worker.processOne(item,true,true);
        verify(client,never()).createRefund(any(),anyString(),anyString());
        verify(repository,never()).applyProviderResult(any(),any(),anyString(),anyString(),any(),any());
    }
    @Test void earlierBatchUnknownStopsLaterCreationButRetainsGetReconciliation() {
        flags.setProviderExecutionEnabled(true);flags.setProductionProviderExecutionApproved(true);
        flags.setReconciliationEnabled(true);flags.setProductionReconciliationApproved(true);
        var first=RefundTestData.item("CREATE","REQUESTED",0,null);
        var second=RefundTestData.item("CREATE","REQUESTED",0,null);
        var get=RefundTestData.item("GET","PENDING",1,"rfnd_known");
        when(repository.hasUnknownHistoricalExposure("PRODUCTION")).thenReturn(false,false,true);
        when(repository.claimBatch(anyBoolean(),anyBoolean(),anyInt(),anyInt(),anyInt(),any(UUID.class),anyString(),anyString()))
            .thenReturn(List.of(first,second,get));
        when(client.prepareRequest(first)).thenReturn("BODY");
        when(repository.prepareDispatch(first,"BODY")).thenReturn(new RefundRepository.PreparedDispatch("BODY","HASH"));
        when(client.createRefund(first,"BODY","HASH")).thenThrow(new RazorpayRefundClient.RefundEvidenceException("INVALID_PROVIDER_EVIDENCE"));
        when(client.getRefund(get)).thenReturn(new ProviderRefundResult("PENDING","rfnd_known","{}"));
        worker.process();
        verify(client).createRefund(first,"BODY","HASH");
        verify(client,never()).prepareRequest(second);
        verify(repository).deferUnsentClaim(eq(second),any(),any());
        verify(client).getRefund(get);
    }
    @Test void successfulHistoricalPollsDoNotConsumeTheConsecutiveFailureBudget() {
        var item=RefundTestData.item("GET","PENDING",1,"rfnd_known",100,0);
        when(client.getRefund(item)).thenThrow(new RuntimeException("timeout"));
        worker.processOne(item,false,true);
        verify(repository).markUnknown(eq(item),any(),eq("UNKNOWN_OUTCOME"),eq(false),any());
    }
    @Test void eighthConsecutiveReconciliationFailureIsVisibleWithoutFalseFailureEvent() {
        var item=RefundTestData.item("GET","ONHOLD",1,"rfnd_known",100,7);
        when(client.getRefund(item)).thenThrow(new RuntimeException("timeout"));
        worker.processOne(item,false,true);
        verify(repository).markUnknown(eq(item),any(),eq("RECONCILIATION_LIMIT"),eq(false),any());
        verify(repository,never()).applyProviderResult(any(),any(),anyString(),anyString(),any(),any());
    }
}
