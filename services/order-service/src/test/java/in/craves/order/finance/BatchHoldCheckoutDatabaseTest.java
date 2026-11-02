package in.craves.order.finance;
import in.craves.order.advanced.BatchHoldCheckout;
import in.craves.order.advanced.BatchHoldCheckoutAspect;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** M24b: re-runs the existing checkout safety contract with the batch-hold aspect outermost; a hold that cannot be confirmed rolls everything back. */
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class BatchHoldCheckoutDatabaseTest extends FinancialCheckoutDatabaseTest {
 BatchHoldCheckout holds;final UUID hold=UUID.randomUUID();
 @Override void registerAdditionalOwners(){holds=mock(BatchHoldCheckout.class);context.getEnvironment().getPropertySources().addFirst(new org.springframework.core.env.MapPropertySource("batch-hold-test",Map.of("CRAVES_ADVANCED_CHECKOUT_BATCH_HOLDS_ENABLED","true")));context.registerBean(BatchHoldCheckout.class,()->holds);context.registerBean(BatchHoldCheckoutAspect.class);}
 CheckoutResponse checkoutWithHold()throws Exception{return orders.checkout(actor,new CheckoutRequest(address,"Batch hold test",null,json.readTree("[{\"holdId\":\""+hold+"\",\"menuItemId\":\""+menu+"\"}]")));}
 @Test void confirmedHoldKeepsTheBoundCheckout()throws Exception{
  var value=checkoutWithHold();assertEquals(new BigDecimal("433.47"),value.grandTotal());assertEquals(1,count("checkout"));assertEquals(0,count("cart_item"));
  verify(holds).confirm(argThat(c->c.id().equals(value.id()) && c.orders().getFirst().items().getFirst().menuItemId().equals(menu)),eq(Map.of(menu,hold)),isNull());
 }
 @Test void refusedHoldRollsBackCheckoutSnapshotsAndKeepsCart()throws Exception{
  doThrow(OrderApiException.conflict("BATCH_HOLD_HOLD_EXPIRED","expired")).when(holds).confirm(any(),any(),any());
  assertEquals("BATCH_HOLD_HOLD_EXPIRED",assertThrows(OrderApiException.class,this::checkoutWithHold).code());
  assertEquals(0,count("checkout"));assertEquals(0,count("customer_order"));assertEquals(0,count("order_financial_snapshot"));assertEquals(0,count("finance_source_outbox"));assertEquals(1,count("cart_item"));
 }
 @Test void checkoutWithoutHoldsNeverCallsTheAdvancedService(){checkout();verifyNoInteractions(holds);}
}
