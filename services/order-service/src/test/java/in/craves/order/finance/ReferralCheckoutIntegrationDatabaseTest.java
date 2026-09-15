package in.craves.order.finance;
import in.craves.order.referrals.*;
import in.craves.order.referrals.transport.*;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.MapPropertySource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Re-runs the existing checkout safety contract with the referral aspect installed. */
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ReferralCheckoutIntegrationDatabaseTest extends FinancialCheckoutDatabaseTest {
 ReferralSourceClient referral;
 @Override void registerAdditionalOwners(){
  referral=mock(ReferralSourceClient.class);
  try{doAnswer(call->{var req=json.readTree((byte[])call.getArgument(1));return new ReferralSourceClient.Reply(200,json.writeValueAsBytes(json.createObjectNode().put("requestId",req.path("requestId").asText()).put("eligible",true).put("policyRevision","2")));}).when(referral).send(eq(ReferralSourceClient.Endpoint.LOOKUP),any());}catch(Exception e){throw new IllegalStateException(e);}
  context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("referral-test",Map.of("CRAVES_REFERRAL_SOURCE_ENABLED","true")));
  context.registerBean(ReferralSourceClient.class,()->referral);context.registerBean(ReferralOutbox.class,()->new ReferralOutbox(jdbc,json,tx));
  context.registerBean(ReferralCheckoutBinding.class);context.registerBean(ReferralCheckoutTransactionAspect.class);
 }
 @Test void boundReferralPreservesExistingTaxesTotalAndCartSemantics(){
  var value=checkout();assertEquals(new BigDecimal("433.47"),value.grandTotal());assertEquals(1,count("referral_order_binding"));assertEquals(1,count("referral_source_outbox"));assertEquals(0,count("cart_item"));
  var body=jdbc.queryForObject("SELECT envelope FROM order_schema.referral_source_outbox",String.class);
  try{var p=json.readTree(body).path("payload");assertEquals("36900",p.path("foodSubtotalPaise").asText());assertEquals("43347",p.path("checkoutPayablePaise").asText());assertEquals(value.id().toString(),p.path("checkoutId").asText());}catch(Exception e){throw new AssertionError(e);}
 }
 @Test void readinessOutageRollsBackBothSourcesAndKeepsCart()throws Exception{
  doThrow(new java.io.IOException("synthetic timeout")).when(referral).send(any(),any());assertThrows(RuntimeException.class,this::checkout);
  assertEquals(0,count("checkout"));assertEquals(0,count("finance_source_outbox"));assertEquals(0,count("referral_source_outbox"));assertEquals(1,count("cart_item"));
 }
 @Test void unenrolledCustomerCheckoutContinuesWithNoReferralEffects()throws Exception{
  doAnswer(call->{var p=json.readTree((byte[])call.getArgument(1));return new ReferralSourceClient.Reply(200,json.writeValueAsBytes(json.createObjectNode().put("requestId",p.path("requestId").asText()).put("eligible",false).put("policyRevision","0")));}).when(referral).send(any(),any());
  assertEquals(new BigDecimal("433.47"),checkout().grandTotal());assertEquals(0,count("referral_order_binding"));assertEquals(0,count("referral_source_outbox"));assertEquals(1,count("finance_source_outbox"));
 }
 @Test void responseFromAnotherCheckoutCannotBindThisOrder()throws Exception{
  doReturn(new ReferralSourceClient.Reply(200,json.writeValueAsBytes(json.createObjectNode().put("requestId",UUID.randomUUID().toString()).put("eligible",true)))).when(referral).send(any(),any());
  assertThrows(RuntimeException.class,this::checkout);assertEquals(0,count("checkout"));assertEquals(1,count("cart_item"));
 }
 @Test void realDeliveryConsumerPublishesOneReferralDeliveryOnReplay()throws Exception{
  var value=checkout();jdbc.update("UPDATE order_schema.customer_order SET status='READY_FOR_PICKUP',accepted_at=now() WHERE id=?",value.orders().getFirst().id());
  var event=delivered(value);var body=json.writeValueAsString(event);var delivery=deliveryService();tx.execute(s->delivery.accept(event,body));tx.execute(s->delivery.accept(event,body));
  assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM order_schema.referral_source_outbox WHERE envelope::jsonb->>'eventType'='order.delivered'",Integer.class));
  assertEquals(0,count("referral_first_checkout")); // 369 INR is below the 800 INR threshold.
 }
}
