package in.craves.order.finance;

import in.craves.order.advanced.PromotionCheckoutAspect;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** M24a: while the runtime is off, a checkout with a promotion is refused and nothing is written; one without runs as before. */
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class PromotionCheckoutOffDatabaseTest extends FinancialCheckoutDatabaseTest {
 @Override void registerAdditionalOwners(){context.registerBean(PromotionCheckoutAspect.class);}
 @Test void promotionWhileOffIsRefusedNeverIgnored()throws Exception{
  var request=new CheckoutRequest(address,"x",null,null,json.readTree("{\"code\":\"SAVE50\"}"));
  assertEquals("PROMOTIONS_NOT_ENABLED",assertThrows(OrderApiException.class,()->orders.checkout(actor,request)).code());
  assertEquals(0,count("checkout"));assertEquals(1,count("cart_item"));
 }
}
