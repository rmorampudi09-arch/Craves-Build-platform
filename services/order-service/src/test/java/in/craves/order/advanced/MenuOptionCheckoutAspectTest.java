package in.craves.order.advanced;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import java.util.UUID;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.PlatformTransactionManager;

class MenuOptionCheckoutAspectTest {
    @SuppressWarnings("unchecked")
    @Test void withoutTheFinanceSourceOptionsAreRefusedBeforeAnythingRuns() throws Throwable {
        ObjectProvider<MenuOptionCheckout> services = mock(ObjectProvider.class);
        when(services.getIfAvailable()).thenReturn(mock(MenuOptionCheckout.class));
        var aspect = new MenuOptionCheckoutAspect(services, mock(ObjectProvider.class), mock(PlatformTransactionManager.class), mock(ObjectProvider.class));
        var call = mock(ProceedingJoinPoint.class);
        var picks = new ObjectMapper().readTree("{\"" + UUID.randomUUID() + "\":[]}");
        when(call.getArgs()).thenReturn(new Object[]{null, new CheckoutRequest(UUID.randomUUID(), null, null, null, null, picks)});
        assertThatThrownBy(() -> aspect.checkout(call)).isInstanceOfSatisfying(OrderApiException.class, e -> assertThat(e.code()).isEqualTo("MENU_OPTIONS_NOT_ENABLED"));
        verify(call, never()).proceed();
        when(call.getArgs()).thenReturn(new Object[]{null, new CheckoutRequest(UUID.randomUUID(), null)});
        aspect.checkout(call);
        verify(call).proceed();
    }
}
