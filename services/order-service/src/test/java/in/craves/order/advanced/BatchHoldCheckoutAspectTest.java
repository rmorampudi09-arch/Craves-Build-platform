package in.craves.order.advanced;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;

class BatchHoldCheckoutAspectTest {
    @SuppressWarnings("unchecked")
    private final ObjectProvider<BatchHoldCheckout> off = mock(ObjectProvider.class);
    private final BatchHoldCheckoutAspect aspect = new BatchHoldCheckoutAspect(off, mock(PlatformTransactionManager.class));

    @Test
    void checkoutsWithoutBatchHoldsRunUnchanged() throws Throwable {
        var call = mock(ProceedingJoinPoint.class);
        when(call.getArgs()).thenReturn(new Object[] {null, new CheckoutRequest(null, "note")});
        when(call.proceed()).thenReturn("unchanged");
        assertEquals("unchanged", aspect.checkout(call));
    }

    @Test
    void batchHoldsWhileSwitchedOffAreRefusedNeverIgnored() throws Throwable {
        var call = mock(ProceedingJoinPoint.class);
        var holds = new ObjectMapper().readTree("[]");
        when(call.getArgs()).thenReturn(new Object[] {null, new CheckoutRequest(null, "note", null, holds)});
        var refused = assertThrows(OrderApiException.class, () -> aspect.checkout(call));
        assertEquals(HttpStatus.CONFLICT, refused.status());
        assertEquals("BATCH_HOLDS_NOT_ENABLED", refused.code());
        verify(call, never()).proceed();
    }
}
