package in.craves.integration.refund;

import in.craves.integration.config.PaymentProviderProperties;
import in.craves.integration.config.PaymentRoutingProperties;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class RefundProductionReadinessServiceTest {
    RefundWorkflowProperties flags() {
        var f=new RefundWorkflowProperties();f.setConsumerEnabled(true);f.setStatusPublisherEnabled(true);
        f.setConnectionString("NONSECRET_TEST_BUS_CONFIGURATION");f.setProviderExecutionEnabled(true);
        f.setReconciliationEnabled(true);f.setProductionProviderExecutionApproved(true);f.setProductionReconciliationApproved(true);return f;
    }
    @Test void razorpayReadinessDoesNotRequireCashfreeActivation() {
        var jdbc=mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(0L);
        var service=new RefundProductionReadinessService(flags(),mock(PaymentProviderProperties.class),
            new PaymentRoutingProperties("RAZORPAY",false,true),RefundTestData.properties(true),jdbc);
        var result=service.status();assertEquals("RAZORPAY",result.paymentProvider());assertTrue(result.providerExecutionReady());
        assertEquals(RazorpayRefundClient.PROTOCOL,result.dispatchProtocol());
        assertTrue(result.blockers().stream().noneMatch(x->x.contains("CASHFREE")));
    }
    @Test void unknownHistoricalAttemptsBlockExecutionButLeaveGetReconciliationReady() {
        var jdbc=mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenAnswer(call->
            ((String)call.getArgument(0)).contains("WHERE (r.recovery_required")?18L:0L);
        var result=new RefundProductionReadinessService(flags(),mock(PaymentProviderProperties.class),
            new PaymentRoutingProperties("RAZORPAY",false,true),RefundTestData.properties(true),jdbc).status();
        assertEquals(18,result.unknownOutcomeCount());assertFalse(result.providerExecutionReady());assertTrue(result.reconciliationReady());
    }
    @Test void exhaustedConsecutiveFailuresAreExplicitAndBlockNewCreation() {
        var jdbc=mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenAnswer(call->
            ((String)call.getArgument(0)).contains("consecutive_reconciliation_failures>=")?1L:0L);
        var result=new RefundProductionReadinessService(flags(),mock(PaymentProviderProperties.class),
            new PaymentRoutingProperties("RAZORPAY",false,true),RefundTestData.properties(true),jdbc).status();
        assertEquals(1,result.reconciliationExhaustedCount());assertFalse(result.providerExecutionReady());
        assertTrue(result.blockers().contains("REFUND_RECONCILIATION_FAILURE_BUDGET_EXHAUSTED"));
    }
}
