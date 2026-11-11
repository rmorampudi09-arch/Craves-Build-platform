package in.craves.order.finance;

import in.craves.order.advanced.PromotionCheckout;
import in.craves.order.advanced.PromotionCheckoutAspect;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.lang.reflect.Constructor;
import java.math.BigDecimal;
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

/** M24a slice 2: re-runs the checkout safety contract with the promotion aspect, then the reserve, confirm and release paths on PostgreSQL. */
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class PromotionCheckoutDatabaseTest extends FinancialCheckoutDatabaseTest {
 MockRestServiceServer server;PromotionCheckout promotions;final UUID redemption=UUID.randomUUID(),promotion=UUID.randomUUID();
 @Override void registerAdditionalOwners(){
  var builder=RestClient.builder().baseUrl("http://adv");server=MockRestServiceServer.bindTo(builder).build();var client=builder.build();
  try{Constructor<PromotionCheckout> c=PromotionCheckout.class.getDeclaredConstructor(RestClient.class,RestClient.class,String.class,org.springframework.jdbc.core.JdbcTemplate.class,com.fasterxml.jackson.databind.ObjectMapper.class,org.springframework.transaction.support.TransactionTemplate.class);
   c.setAccessible(true);promotions=c.newInstance(client,client,"s3cret",jdbc,json,tx);}catch(Exception e){throw new IllegalStateException(e);}
  context.getEnvironment().getPropertySources().addFirst(new org.springframework.core.env.MapPropertySource("promotion-test",Map.of("CRAVES_ADVANCED_CHECKOUT_PROMOTIONS_ENABLED","true")));
  context.registerBean(PromotionCheckout.class,()->promotions);context.registerBean(PromotionCheckoutAspect.class);
  var web=new MockHttpServletRequest();web.addHeader("Authorization","Bearer customer-token");RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(web));
 }
 @AfterEach void clearRequest(){RequestContextHolder.resetRequestAttributes();}
 String redemptionJson(long subtotal){return "{\"id\":\""+redemption+"\",\"promotionId\":\""+promotion+"\",\"personId\":\""+customer+"\",\"discountPaise\":5000,\"subtotalPaise\":"+subtotal+",\"status\":\"RESERVED\"}";}
 void expectReserve(String fundedBy,int limit){
  server.expect(requestTo("http://adv/api/v1/advanced/promotions/redemptions")).andExpect(method(HttpMethod.POST)).andExpect(header("Authorization","Bearer customer-token"))
   .andExpect(jsonPath("$.code").value("SAVE50")).andExpect(jsonPath("$.items[0].menuItemId").value(menu.toString())).andExpect(jsonPath("$.items[0].quantity").value(1))
   .andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON).body(redemptionJson(36900)));
  server.expect(requestTo("http://adv/internal/v1/promotions/redemptions/"+redemption+"/checkout-terms?personId="+customer)).andExpect(header("X-Craves-Internal-Secret","s3cret"))
   .andRespond(withSuccess("{\"id\":\""+redemption+"\",\"promotionId\":\""+promotion+"\",\"discountPaise\":5000,\"status\":\"RESERVED\",\"fundedBy\":\""+fundedBy+"\",\"perPersonLimit\":"+limit+"}",MediaType.APPLICATION_JSON));
 }
 void expectFinish(String action,String status){server.expect(requestTo("http://adv/internal/v1/promotions/redemptions/"+redemption+"/"+action)).andExpect(method(HttpMethod.POST)).andExpect(jsonPath("$.personId").value(customer.toString()))
  .andRespond(withSuccess("{\"id\":\""+redemption+"\",\"status\":\""+status+"\"}",MediaType.APPLICATION_JSON));}
 CheckoutResponse checkoutWithPromotion()throws Exception{return orders.checkout(actor,new CheckoutRequest(address,"Promotion test",null,null,json.readTree("{\"code\":\"SAVE50\"}")));}
 String state(){return jdbc.queryForObject("SELECT state FROM order_schema.promotion_checkout_benefit",String.class);}

 @Test void reservedPromotionIsRecordedWithGrossUnchangedAndNetForFinance()throws Exception{
  expectReserve("CRAVES",1);var value=checkoutWithPromotion();server.verify();
  assertEquals(new BigDecimal("433.47"),value.grandTotal());assertEquals(1,count("promotion_checkout_benefit"));
  var read=PromotionCheckout.read(jdbc,json,value.id());assertEquals("RESERVED",read.path("state").asText());assertEquals("43347",read.path("grossPaise").asText());assertEquals("5000",read.path("discountPaise").asText());assertEquals("38347",read.path("netPaise").asText());
  assertEquals("NONE",PromotionCheckout.read(jdbc,json,UUID.randomUUID()).path("state").asText());
 }
 @Test void kitchenFundedOfferRollsBackCheckoutAndReleasesTheReservation()throws Exception{
  expectReserve("KITCHEN",1);expectFinish("release","RELEASED");
  assertEquals("PROMOTION_NOT_SUPPORTED",assertThrows(OrderApiException.class,this::checkoutWithPromotion).code());server.verify();
  assertEquals(0,count("checkout"));assertEquals(0,count("customer_order"));assertEquals(0,count("order_financial_snapshot"));assertEquals(1,count("cart_item"));
 }
 @Test void refusedOfferKeepsTheCart()throws Exception{
  server.expect(requestTo("http://adv/api/v1/advanced/promotions/redemptions")).andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY).contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"NO_OFFER_APPLIES\"}"));
  assertEquals("NO_OFFER_APPLIES",assertThrows(OrderApiException.class,this::checkoutWithPromotion).code());assertEquals(0,count("checkout"));assertEquals(1,count("cart_item"));
 }
 @Test void personLimitIsCountedFromThisServicesOwnCheckouts()throws Exception{
  expectReserve("CRAVES",1);checkoutWithPromotion();server.reset();
  orders.addCartItem(actor,new in.craves.order.web.ApiDtos.AddCartItemRequest(menu,1));expectReserve("CRAVES",1);expectFinish("release","RELEASED");
  assertEquals("PROMO_PERSON_LIMIT",assertThrows(OrderApiException.class,this::checkoutWithPromotion).code());server.verify();assertEquals(1,count("checkout"));
 }
 @Test void aCheckoutLeftUnpaidPastTheWindowStopsCountingButALatePaymentStillConfirms()throws Exception{
  expectReserve("CRAVES",1);var first=checkoutWithPromotion();server.reset();
  jdbc.execute("ALTER TABLE order_schema.promotion_checkout_benefit DISABLE TRIGGER promotion_checkout_benefit_guard");
  jdbc.update("UPDATE order_schema.promotion_checkout_benefit SET created_at=now()-interval '31 minutes'");
  jdbc.execute("ALTER TABLE order_schema.promotion_checkout_benefit ENABLE TRIGGER promotion_checkout_benefit_guard");
  orders.addCartItem(actor,new in.craves.order.web.ApiDtos.AddCartItemRequest(menu,1));
  var other=UUID.randomUUID();
  server.expect(requestTo("http://adv/api/v1/advanced/promotions/redemptions")).andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON).body(redemptionJson(36900).replace(redemption.toString(),other.toString())));
  server.expect(requestTo("http://adv/internal/v1/promotions/redemptions/"+other+"/checkout-terms?personId="+customer)).andRespond(withSuccess("{\"id\":\""+other+"\",\"promotionId\":\""+promotion+"\",\"discountPaise\":5000,\"fundedBy\":\"CRAVES\",\"perPersonLimit\":1}",MediaType.APPLICATION_JSON));
  checkoutWithPromotion();server.verify();server.reset();assertEquals(2,count("promotion_checkout_benefit"));
  // The first one is paid late: the worker's sweep confirms it even though the paid hook never ran.
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",first.id());expectFinish("confirm","CONFIRMED");
  assertTrue(promotions.runOne());server.verify();
  assertEquals("CONFIRMED",jdbc.queryForObject("SELECT state FROM order_schema.promotion_checkout_benefit WHERE checkout_id=?",String.class,first.id()));
 }
 @Test void aRollbackAfterTheReservationGivesItBack()throws Exception{
  expectReserve("CRAVES",1);expectFinish("release","RELEASED");
  tx.executeWithoutResult(s->{try{checkoutWithPromotion();}catch(Exception e){throw new IllegalStateException(e);}s.setRollbackOnly();});
  server.verify();assertEquals(0,count("checkout"));assertEquals(0,count("promotion_checkout_benefit"));
 }
 @Test void ourOwnSecretRefusedIsRetriedNotSentToReview()throws Exception{
  expectReserve("CRAVES",2);var value=checkoutWithPromotion();server.reset();
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",value.id());
  server.expect(requestTo("http://adv/internal/v1/promotions/redemptions/"+redemption+"/confirm")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
  assertTrue(promotions.runOne());server.verify();assertEquals("CONFIRMING",state());
 }
 @Test void priceDifferenceRefusesTheOffer()throws Exception{
  server.expect(requestTo("http://adv/api/v1/advanced/promotions/redemptions")).andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON).body(redemptionJson(30000)));
  server.expect(requestTo("http://adv/internal/v1/promotions/redemptions/"+redemption+"/checkout-terms?personId="+customer)).andRespond(withSuccess("{\"id\":\""+redemption+"\",\"promotionId\":\""+promotion+"\",\"discountPaise\":5000,\"fundedBy\":\"CRAVES\",\"perPersonLimit\":3}",MediaType.APPLICATION_JSON));
  expectFinish("release","RELEASED");
  assertEquals("PROMOTION_PRICE_CHANGED",assertThrows(OrderApiException.class,this::checkoutWithPromotion).code());server.verify();assertEquals(0,count("checkout"));
 }
 @Test void referralBenefitsTogetherAreRefused()throws Exception{
  var request=new CheckoutRequest(address,"x",json.readTree("{\"walletPaise\":\"100\",\"inviteeDiscount\":false}"),null,json.readTree("{}"));
  assertEquals("PROMOTION_WITH_REFERRAL",assertThrows(OrderApiException.class,()->orders.checkout(actor,request)).code());assertEquals(0,count("checkout"));
 }
 @Test void paidCheckoutIsConfirmedOnceAndAnUnexpectedAnswerGoesToReview()throws Exception{
  expectReserve("CRAVES",2);var value=checkoutWithPromotion();server.reset();
  var mark=PromotionCheckout.class.getDeclaredMethod("markPaid",org.springframework.jdbc.core.JdbcTemplate.class,UUID.class);mark.setAccessible(true);
  mark.invoke(null,jdbc,value.id());assertEquals("RESERVED",state()); // not paid yet: nothing to confirm
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",value.id());mark.invoke(null,jdbc,value.id());assertEquals("CONFIRMING",state());
  server.expect(requestTo("http://adv/internal/v1/promotions/redemptions/"+redemption+"/confirm")).andExpect(jsonPath("$.orderId").value(value.id().toString()))
   .andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"REDEMPTION_EXPIRED\"}"));
  assertTrue(promotions.runOne());server.verify();assertEquals("REVIEW",state());
  assertEquals("REDEMPTION_EXPIRED",jdbc.queryForObject("SELECT last_code FROM order_schema.promotion_checkout_benefit",String.class));assertFalse(promotions.runOne());
 }
 @Test void confirmSucceedsAndServerErrorsRetryLater()throws Exception{
  expectReserve("CRAVES",2);var value=checkoutWithPromotion();server.reset();
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",value.id());
  jdbc.update("UPDATE order_schema.promotion_checkout_benefit SET state='CONFIRMING'");
  server.expect(requestTo("http://adv/internal/v1/promotions/redemptions/"+redemption+"/confirm")).andRespond(withServerError());
  assertTrue(promotions.runOne());assertEquals("CONFIRMING",state());server.verify();server.reset();
  jdbc.update("UPDATE order_schema.promotion_checkout_benefit SET next_attempt_at=now()");expectFinish("confirm","CONFIRMED");
  assertTrue(promotions.runOne());server.verify();assertEquals("CONFIRMED",state());
 }
 @Test void checkoutCancelledBeforePaymentReleasesTheReservation()throws Exception{
  expectReserve("CRAVES",2);var value=checkoutWithPromotion();server.reset();
  jdbc.update("UPDATE order_schema.checkout SET status='CANCELLED' WHERE id=?",value.id());expectFinish("release","RELEASED");
  assertTrue(promotions.runOne());server.verify();assertEquals("RELEASED",state());
  assertThrows(Exception.class,()->jdbc.update("UPDATE order_schema.promotion_checkout_benefit SET state='RESERVED'"));
  assertThrows(Exception.class,()->jdbc.update("DELETE FROM order_schema.promotion_checkout_benefit"));
 }
 CheckoutResponse paidAndConfirmed()throws Exception{
  expectReserve("CRAVES",1);var value=checkoutWithPromotion();server.reset();
  jdbc.update("UPDATE order_schema.checkout SET status='PAID' WHERE id=?",value.id());
  jdbc.update("UPDATE order_schema.promotion_checkout_benefit SET state='CONFIRMED'");return value;
 }
 @Test void paidCheckoutCancelledBeforeFulfilmentReleasesTheConfirmedRedemptionForThatCheckout()throws Exception{
  var value=paidAndConfirmed();
  jdbc.update("UPDATE order_schema.customer_order SET status='REFUNDED' WHERE checkout_id=?",value.id());
  server.expect(requestTo("http://adv/internal/v1/promotions/redemptions/"+redemption+"/release")).andExpect(header("X-Craves-Internal-Secret","s3cret"))
   .andExpect(jsonPath("$.personId").value(customer.toString())).andExpect(jsonPath("$.orderId").value(value.id().toString()))
   .andRespond(withSuccess("{\"id\":\""+redemption+"\",\"status\":\"RELEASED\"}",MediaType.APPLICATION_JSON));
  assertTrue(promotions.runOne());server.verify();assertEquals("RELEASED",state());
  // Released, so it no longer counts against the person's limit of 1.
  orders.addCartItem(actor,new in.craves.order.web.ApiDtos.AddCartItemRequest(menu,1));var other=UUID.randomUUID();
  server.reset();server.expect(requestTo("http://adv/api/v1/advanced/promotions/redemptions")).andRespond(withStatus(HttpStatus.CREATED).contentType(MediaType.APPLICATION_JSON).body(redemptionJson(36900).replace(redemption.toString(),other.toString())));
  server.expect(requestTo("http://adv/internal/v1/promotions/redemptions/"+other+"/checkout-terms?personId="+customer)).andRespond(withSuccess("{\"id\":\""+other+"\",\"promotionId\":\""+promotion+"\",\"discountPaise\":5000,\"fundedBy\":\"CRAVES\",\"perPersonLimit\":1}",MediaType.APPLICATION_JSON));
  checkoutWithPromotion();server.verify();assertEquals(2,count("promotion_checkout_benefit"));
 }
 @Test void aConfirmationOlderThanThirtyDaysIsNotLookedAt()throws Exception{
  var value=paidAndConfirmed();
  jdbc.update("UPDATE order_schema.promotion_checkout_benefit SET updated_at=now()-interval '31 days'");
  jdbc.update("UPDATE order_schema.customer_order SET status='CHEF_REJECTED' WHERE checkout_id=?",value.id());
  assertFalse(promotions.runOne());assertEquals("CONFIRMED",state());
 }
 @Test void aChefOrderThatReachedPickupKeepsThePromotionUsed()throws Exception{
  var value=paidAndConfirmed();
  UUID order=jdbc.queryForObject("SELECT id FROM order_schema.customer_order WHERE checkout_id=? LIMIT 1",UUID.class,value.id());
  jdbc.update("INSERT INTO order_schema.order_status_history(id,order_id,old_status,new_status) VALUES (gen_random_uuid(),?,'CHEF_ACCEPTED','READY_FOR_PICKUP')",order);
  jdbc.update("UPDATE order_schema.customer_order SET status='REFUNDED' WHERE checkout_id=?",value.id());
  assertFalse(promotions.runOne());assertEquals("CONFIRMED",state());
 }
 @Test void aChefOrderStillCookingOrAcceptedThenCancelledKeepsThePromotionUsed()throws Exception{
  var value=paidAndConfirmed();
  assertFalse(promotions.runOne());assertEquals("CONFIRMED",state());
  var fresh=promotions.getClass().getDeclaredField("nextCancelledSweep");fresh.setAccessible(true);
  jdbc.update("UPDATE order_schema.customer_order SET status='CANCELLED', ready_at=now() WHERE checkout_id=?",value.id());fresh.setLong(promotions,System.nanoTime());
  assertFalse(promotions.runOne());assertEquals("CONFIRMED",state());
 }
}
