package in.craves.order.finance;

import in.craves.order.advanced.MenuOptionCheckoutAspect;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** M24c: while the runtime is off, a checkout with options is refused and nothing is written; one without runs as before. */
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class MenuOptionCheckoutOffDatabaseTest extends FinancialCheckoutDatabaseTest {
 @Override void registerAdditionalOwners(){context.registerBean(MenuOptionCheckoutAspect.class);}
 @Test void optionsWhileOffAreRefusedNeverIgnored()throws Exception{
  var request=new CheckoutRequest(address,"x",null,null,null,json.readTree("{\""+menu+"\":[]}"));
  assertEquals("MENU_OPTIONS_NOT_ENABLED",assertThrows(OrderApiException.class,()->orders.checkout(actor,request)).code());
  assertEquals(0,count("checkout"));assertEquals(1,count("cart_item"));
 }
}
