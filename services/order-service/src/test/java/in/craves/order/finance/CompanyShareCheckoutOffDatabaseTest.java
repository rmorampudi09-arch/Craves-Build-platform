package in.craves.order.finance;

import in.craves.order.advanced.CompanyShareCheckoutAspect;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** M24d: while the runtime is off, a checkout with a company charge is refused and nothing is written; one without runs as before. */
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class CompanyShareCheckoutOffDatabaseTest extends FinancialCheckoutDatabaseTest {
 @Override void registerAdditionalOwners(){context.registerBean(CompanyShareCheckoutAspect.class);}
 @Test void companyChargeWhileOffIsRefusedNeverIgnored()throws Exception{
  var request=new CheckoutRequest(address,"x",null,null,null,null,json.readTree("{}"));
  assertEquals("COMPANY_SHARE_NOT_ENABLED",assertThrows(OrderApiException.class,()->orders.checkout(actor,request)).code());
  assertEquals(0,count("checkout"));assertEquals(1,count("cart_item"));
 }
 @Test void checkoutWithoutACompanyChargeRunsAsBefore(){assertNotNull(checkout());assertEquals(1,count("checkout"));}
}
