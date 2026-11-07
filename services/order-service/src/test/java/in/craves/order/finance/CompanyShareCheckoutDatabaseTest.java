package in.craves.order.finance;

import in.craves.order.advanced.CompanyShareCheckout;
import in.craves.order.advanced.CompanyShareCheckoutAspect;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.lang.reflect.Constructor;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

/** M24d slice 2: re-runs the checkout safety contract with the company-share aspect, then the reserve, confirm and release paths on PostgreSQL. */
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class CompanyShareCheckoutDatabaseTest extends FinancialCheckoutDatabaseTest {
 MockRestServiceServer server;CompanyShareCheckout shares;final UUID charge=UUID.randomUUID(),company=UUID.randomUUID();
 @Override void registerAdditionalOwners(){
  var builder=RestClient.builder().baseUrl("http://adv");server=MockRestServiceServer.bindTo(builder).build();var client=builder.build();
  try{Constructor<CompanyShareCheckout> c=CompanyShareCheckout.class.getDeclaredConstructor(RestClient.class,RestClient.class,String.class,org.springframework.jdbc.core.JdbcTemplate.class,com.fasterxml.jackson.databind.ObjectMapper.class,org.springframework.transaction.support.TransactionTemplate.class);
   c.setAccessible(true);shares=c.newInstance(client,client,"s3cret",jdbc,json,tx);}catch(Exception e){throw new IllegalStateException(e);}
  context.getEnvironment().getPropertySources().addFirst(new org.springframework.core.env.MapPropertySource("company-test",Map.of("CRAVES_ADVANCED_CHECKOUT_COMPANY_SHARE_ENABLED","true")));
  context.registerBean(CompanyShareCheckout.class,()->shares);context.registerBean(CompanyShareCheckoutAspect.class);
  var web=new MockHttpServletRequest();web.addHeader("Authorization","Bearer customer-token");RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(web));
 }
 @AfterEach void clearRequest(){RequestContextHolder.resetRequestAttributes();}
 String chargeJson(UUID id,long subtotal,long share,String status,Instant expires){return "{\"id\":\""+id+"\",\"companyId\":\""+company+"\",\"kind\":\"MEAL\",\"headcount\":null,\"subtotalPaise\":"+subtotal
  +",\"companySharePaise\":"+share+",\"memberSharePaise\":"+(subtotal-share)+",\"status\":\""+status+"\",\"orderId\":null,\"expiresAt\":\""+expires+"\"}";}
 void expectReserve(UUID id,long subtotal,long share,Instant expires){
  server.expect(requestTo("http://adv/api/v1/advanced/corporate-meals/charges")).andExpect(method(HttpMethod.POST)).andExpect(header("Authorization","Bearer customer-token"))
   .andExpect(jsonPath("$.kind").value("MEAL")).andExpect(jsonPath("$.items[0].menuItemId").value(menu.toString())).andExpect(jsonPath("$.items[0].quantity").value(1))
   .andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON).body(chargeJson(id,subtotal,share,"RESERVED",expires)));
  server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+id+"/checkout-terms?personId="+customer)).andExpect(header("X-Craves-Internal-Secret","s3cret"))
   .andRespond(withSuccess(chargeJson(id,subtotal,share,"RESERVED",expires),MediaType.APPLICATION_JSON));
 }
 void expectReserve(){expectReserve(charge,36900,20000,Instant.now().plusSeconds(600));}
 void expectFinish(String action,String status){server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+charge+"/"+action)).andExpect(method(HttpMethod.POST))
  .andExpect(header("X-Craves-Internal-Secret","s3cret")).andExpect(jsonPath("$.personId").value(customer.toString()))
  .andRespond(withSuccess("{\"id\":\""+charge+"\",\"status\":\""+status+"\"}",MediaType.APPLICATION_JSON));}
 CheckoutResponse checkoutWithCompany(String body)throws Exception{return orders.checkout(actor,new CheckoutRequest(address,"Company test",null,null,null,null,json.readTree(body)));}
 CheckoutResponse checkoutWithCompany()throws Exception{return checkoutWithCompany("{}");}
 String state(){return jdbc.queryForObject("SELECT state FROM order_schema.company_share_checkout_benefit",String.class);}

 @Test void reservedShareIsFrozenWithGrossUnchangedAndThePersonsPartForFinance()throws Exception{
  expectReserve();var value=checkoutWithCompany();server.verify();
  assertEquals(1,count("company_share_checkout_benefit"));
  var read=CompanyShareCheckout.read(jdbc,json,value.id());assertEquals("RESERVED",read.path("state").asText());assertEquals("43347",read.path("grossPaise").asText());
  assertEquals("20000",read.path("companySharePaise").asText());assertEquals("23347",read.path("personPaise").asText());assertEquals(company.toString(),read.path("companyId").asText());
  assertEquals("NONE",CompanyShareCheckout.read(jdbc,json,UUID.randomUUID()).path("state").asText());
 }
 @Test void refusedChargeKeepsTheCart()throws Exception{
  server.expect(requestTo("http://adv/api/v1/advanced/corporate-meals/charges")).andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"COMPANY_BUDGET_REACHED\"}"));
  assertEquals("COMPANY_BUDGET_REACHED",assertThrows(OrderApiException.class,this::checkoutWithCompany).code());assertEquals(0,count("checkout"));assertEquals(1,count("cart_item"));
 }
 @Test void priceDifferenceRefusesAndReleasesTheReservation()throws Exception{
  expectReserve(charge,30000,10000,Instant.now().plusSeconds(600));expectFinish("release","RELEASED");
  assertEquals("COMPANY_SHARE_PRICE_CHANGED",assertThrows(OrderApiException.class,this::checkoutWithCompany).code());server.verify();
  assertEquals(0,count("checkout"));assertEquals(0,count("order_financial_snapshot"));assertEquals(1,count("cart_item"));
 }
 @Test void aLapsedReservationIsNotUsed()throws Exception{
  expectReserve(charge,36900,20000,Instant.now().minusSeconds(1));expectFinish("release","RELEASED");
  assertEquals("COMPANY_SHARE_UNAVAILABLE",assertThrows(OrderApiException.class,this::checkoutWithCompany).code());server.verify();assertEquals(0,count("checkout"));
 }
 @Test void aShareAboveTheFoodIsRefused()throws Exception{
  expectReserve(charge,36900,36901,Instant.now().plusSeconds(600));expectFinish("release","RELEASED");
  assertEquals("COMPANY_SHARE_AMOUNT_INVALID",assertThrows(OrderApiException.class,this::checkoutWithCompany).code());server.verify();assertEquals(0,count("checkout"));
 }
 @Test void termsThatDoNotMatchTheReservationAreRefused()throws Exception{
  server.expect(requestTo("http://adv/api/v1/advanced/corporate-meals/charges")).andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON).body(chargeJson(charge,36900,20000,"RESERVED",Instant.now().plusSeconds(600))));
  server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+charge+"/checkout-terms?personId="+customer)).andRespond(withSuccess(chargeJson(charge,36900,25000,"RESERVED",Instant.now().plusSeconds(600)),MediaType.APPLICATION_JSON));
  expectFinish("release","RELEASED");
  assertEquals("COMPANY_SHARE_CONTEXT_MISMATCH",assertThrows(OrderApiException.class,this::checkoutWithCompany).code());server.verify();assertEquals(0,count("checkout"));
 }
 @Test void anotherPersonsChargeIsRefused()throws Exception{
  server.expect(requestTo("http://adv/api/v1/advanced/corporate-meals/charges")).andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON).body(chargeJson(charge,36900,20000,"RESERVED",Instant.now().plusSeconds(600))));
  server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+charge+"/checkout-terms?personId="+customer)).andRespond(withStatus(HttpStatus.NOT_FOUND));
  server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+charge+"/release")).andRespond(withStatus(HttpStatus.NOT_FOUND));
  assertEquals("COMPANY_SHARE_UNAVAILABLE",assertThrows(OrderApiException.class,this::checkoutWithCompany).code());server.verify();assertEquals(0,count("checkout"));
 }
 @Test void teamMealPassesKindAndHeadcountAndBadShapesAreRefused()throws Exception{
  server.expect(requestTo("http://adv/api/v1/advanced/corporate-meals/charges")).andExpect(jsonPath("$.kind").value("TEAM_MEAL")).andExpect(jsonPath("$.headcount").value(5))
   .andRespond(withStatus(HttpStatus.FORBIDDEN));
  assertEquals("COMPANY_SHARE_UNAVAILABLE",assertThrows(OrderApiException.class,()->checkoutWithCompany("{\"kind\":\"TEAM_MEAL\",\"headcount\":5}")).code());server.verify();
  for(String bad:new String[]{"[]","{\"kind\":\"BRUNCH\"}","{\"headcount\":5}","{\"kind\":\"TEAM_MEAL\",\"headcount\":1}","{\"kind\":\"MEAL\",\"x\":1}","{\"kind\":\"TEAM_MEAL\",\"headcount\":2.5}"})
   assertEquals("INVALID_COMPANY_CHARGE",assertThrows(OrderApiException.class,()->checkoutWithCompany(bad)).code(),bad);
  assertEquals(0,count("checkout"));
 }
 @Test void benefitsAndOptionsTogetherAreRefused()throws Exception{
  var withPromotion=new CheckoutRequest(address,"x",null,null,json.readTree("{}"),null,json.readTree("{}"));
  assertEquals("COMPANY_SHARE_WITH_BENEFIT",assertThrows(OrderApiException.class,()->orders.checkout(actor,withPromotion)).code());
  var withReferral=new CheckoutRequest(address,"x",json.readTree("{\"walletPaise\":\"100\",\"inviteeDiscount\":false}"),null,null,null,json.readTree("{}"));
  assertEquals("COMPANY_SHARE_WITH_BENEFIT",assertThrows(OrderApiException.class,()->orders.checkout(actor,withReferral)).code());
  var withOptions=new CheckoutRequest(address,"x",null,null,null,json.readTree("{\""+menu+"\":[\""+UUID.randomUUID()+"\"]}"),json.readTree("{}"));
  assertEquals("COMPANY_SHARE_WITH_OPTIONS",assertThrows(OrderApiException.class,()->orders.checkout(actor,withOptions)).code());
  assertEquals(0,count("checkout"));
 }
 @Test void aRollbackAfterTheReservationGivesItBack()throws Exception{
  expectReserve();expectFinish("release","RELEASED");
  tx.executeWithoutResult(s->{try{checkoutWithCompany();}catch(Exception e){throw new IllegalStateException(e);}s.setRollbackOnly();});
  server.verify();assertEquals(0,count("checkout"));assertEquals(0,count("company_share_checkout_benefit"));
 }
 @Test void paidCheckoutIsConfirmedWithTheCheckoutAndALateRefusalGoesToReview()throws Exception{
  expectReserve();var value=checkoutWithCompany();server.reset();
  var mark=CompanyShareCheckout.class.getDeclaredMethod("markPaid",org.springframework.jdbc.core.JdbcTemplate.class,UUID.class);mark.setAccessible(true);
  mark.invoke(null,jdbc,value.id());assertEquals("RESERVED",state());
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",value.id());mark.invoke(null,jdbc,value.id());assertEquals("CONFIRMING",state());
  server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+charge+"/confirm")).andExpect(jsonPath("$.orderId").value(value.id().toString()))
   .andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"CHARGE_EXPIRED\"}"));
  assertTrue(shares.runOne());server.verify();assertEquals("REVIEW",state());
  assertEquals("CHARGE_EXPIRED",jdbc.queryForObject("SELECT last_code FROM order_schema.company_share_checkout_benefit",String.class));assertFalse(shares.runOne());
 }
 @Test void aLostPaidHookIsConfirmedByTheSweepAndServerErrorsRetry()throws Exception{
  expectReserve();var value=checkoutWithCompany();server.reset();
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",value.id());
  server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+charge+"/confirm")).andRespond(withServerError());
  assertTrue(shares.runOne());assertEquals("CONFIRMING",state());server.verify();server.reset();
  jdbc.update("UPDATE order_schema.company_share_checkout_benefit SET next_attempt_at=now()");expectFinish("confirm","CONFIRMED");
  assertTrue(shares.runOne());server.verify();assertEquals("CONFIRMED",state());
 }
 @Test void ourOwnSecretRefusedIsRetriedNotSentToReview()throws Exception{
  expectReserve();var value=checkoutWithCompany();server.reset();
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",value.id());
  server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+charge+"/confirm")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
  assertTrue(shares.runOne());server.verify();assertEquals("CONFIRMING",state());
 }
 @Test void checkoutCancelledBeforePaymentReleasesNamingTheCheckout()throws Exception{
  expectReserve();var value=checkoutWithCompany();server.reset();
  jdbc.update("UPDATE order_schema.checkout SET status='CANCELLED' WHERE id=?",value.id());
  server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+charge+"/release")).andExpect(jsonPath("$.orderId").value(value.id().toString()))
   .andRespond(withSuccess("{\"id\":\""+charge+"\",\"status\":\"RELEASED\"}",MediaType.APPLICATION_JSON));
  assertTrue(shares.runOne());server.verify();assertEquals("RELEASED",state());
  assertThrows(Exception.class,()->jdbc.update("UPDATE order_schema.company_share_checkout_benefit SET state='RESERVED'"));
  assertThrows(Exception.class,()->jdbc.update("DELETE FROM order_schema.company_share_checkout_benefit"));
  assertThrows(Exception.class,()->jdbc.update("UPDATE order_schema.company_share_checkout_benefit SET share_paise=1"));
 }
 @Test void paidCheckoutCancelledBeforeAnyChefAcceptedReleasesTheConfirmedShare()throws Exception{
  expectReserve();var value=checkoutWithCompany();server.reset();
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",value.id());
  jdbc.update("UPDATE order_schema.company_share_checkout_benefit SET state='CONFIRMED'");
  jdbc.update("UPDATE order_schema.customer_order SET status='CHEF_REJECTED' WHERE checkout_id=?",value.id());
  server.expect(requestTo("http://adv/internal/v1/corporate-meals/charges/"+charge+"/release")).andExpect(jsonPath("$.orderId").value(value.id().toString()))
   .andRespond(withSuccess("{\"id\":\""+charge+"\",\"status\":\"VOIDED\"}",MediaType.APPLICATION_JSON));
  assertTrue(shares.runOne());server.verify();assertEquals("REVIEW",state()); // staff voided it meanwhile: not ours to decide
 }
 @Test void anAcceptedChefOrderKeepsTheShareUsed()throws Exception{
  expectReserve();var value=checkoutWithCompany();server.reset();
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",value.id());
  jdbc.update("UPDATE order_schema.company_share_checkout_benefit SET state='CONFIRMED'");
  jdbc.update("UPDATE order_schema.customer_order SET status='CANCELLED', ready_at=now() WHERE checkout_id=?",value.id());
  assertFalse(shares.runOne());assertEquals("CONFIRMED",state());
 }
}
