package in.craves.order.finance;
import in.craves.order.config.DomainEventOutboxProperties;
import in.craves.order.event.OrderCancelledEventFactory;
import in.craves.order.outbox.OrderCancelledEventWriter;
import in.craves.order.outbox.OrderDomainOutboxRepository;
import in.craves.order.referrals.*;
import in.craves.order.referrals.transport.ReferralSourceClient;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.MapPropertySource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ReferralBenefitsOwnerDatabaseTest extends ReferralCheckoutIntegrationDatabaseTest {
 final DomainEventOutboxProperties outboxProperties=new DomainEventOutboxProperties();
 @Override void registerAdditionalOwners(){super.registerAdditionalOwners();context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("benefits-test",Map.of("CRAVES_REFERRAL_CHECKOUT_BENEFITS_ENABLED","true")));context.registerBean(ReferralCheckoutBenefits.class);context.registerBean(ReferralCheckoutBenefitsAspect.class);
  context.registerBean(DomainEventOutboxProperties.class,()->outboxProperties);context.registerBean(OrderCancelledEventFactory.class);context.registerBean(OrderDomainOutboxRepository.class);context.registerBean(OrderCancelledEventWriter.class);}
 ReferralCheckoutBenefits service(){return context.getBean(ReferralCheckoutBenefits.class);}
 void replies()throws Exception{doAnswer(call->{var envelope=json.readTree((byte[])call.getArgument(1));var p=envelope.path("payload");boolean reserve=envelope.path("operationType").asText().equals("checkout.reserve");var value=json.createObjectNode().put("checkoutId",p.path("checkoutId").asText()).put("buyerUserId",p.path("buyerUserId").asText()).put("grossPaise","43347").put("walletPaise","1000").put("discountPaise","0").put("gatewayPaise","42347").put("status",reserve?"RESERVED":"CONSUMED");return new ReferralSourceClient.Reply(200,json.writeValueAsBytes(value));}).when(referral).send(eq(ReferralSourceClient.Endpoint.OPERATIONS),any());}
 @Test void optedInCheckoutPersistsIntentWithUnchangedGrossAndTax()throws Exception{replies();var value=orders.checkout(actor,new CheckoutRequest(address,"test",json.createObjectNode().put("walletPaise","1000").put("inviteeDiscount",false)));assertTrue(value.referralBenefitsRequested());assertTrue(orders.getCheckout(actor,value.id()).referralBenefitsRequested());assertEquals(new BigDecimal("433.47"),value.grandTotal());assertEquals(1,count("referral_checkout_benefit"));assertTrue(service().runOne());assertEquals("RESERVED",service().read(actor,value.id()).path("state").asText());assertEquals("42347",service().read(actor,value.id()).path("funding").path("gatewayPaise").asText());}
 @Test void consumeWaitsForCoreReceiptAndDuplicateCallbackHasNoSecondEffect()throws Exception{replies();var value=orders.checkout(actor,new CheckoutRequest(address,"test",json.createObjectNode().put("walletPaise","1000").put("inviteeDiscount",false)));service().runOne();assertFalse(service().requestConsumption(value.id()));assertTrue(service().runOne());assertTrue(service().requestConsumption(value.id()));assertFalse(service().runOne());assertEquals("CONSUMED",service().read(actor,value.id()).path("state").asText());}
 @Test void discountedCheckoutBelowMinimumRollsBackCheckoutCartAndSources(){assertThrows(Exception.class,()->orders.checkout(actor,new CheckoutRequest(address,"test",json.createObjectNode().put("walletPaise","0").put("inviteeDiscount",true))));assertEquals(0,count("checkout"));assertEquals(1,count("cart_item"));assertEquals(0,count("referral_source_outbox"));}
 @Test void uncertainReservationKeepsOriginalOperationForRetry()throws Exception{replies();var value=orders.checkout(actor,new CheckoutRequest(address,"test",json.createObjectNode().put("walletPaise","1000").put("inviteeDiscount",false)));doThrow(new java.io.IOException("test timeout")).when(referral).send(eq(ReferralSourceClient.Endpoint.OPERATIONS),any());assertTrue(service().runOne());String original=jdbc.queryForObject("SELECT reserve_envelope::text FROM order_schema.referral_checkout_benefit",String.class);replies();jdbc.execute("UPDATE order_schema.referral_checkout_benefit SET next_attempt_at=now()");assertTrue(service().runOne());assertEquals(original,jdbc.queryForObject("SELECT reserve_envelope::text FROM order_schema.referral_checkout_benefit",String.class));assertEquals("RESERVED",service().read(actor,value.id()).path("state").asText());}
 @Test void anotherCustomerCannotReadTheBenefitPlan(){var value=checkout();var stranger=new in.craves.order.security.CravesPrincipal(java.util.UUID.randomUUID(),"",java.util.Set.of("CUSTOMER"));assertThrows(Exception.class,()->service().read(stranger,value.id()));}
 @Test void confirmedUnpaidCancellationReleasesBothAndRecordsOrderHistory()throws Exception{replies();var value=orders.checkout(actor,new CheckoutRequest(address,"test",json.createObjectNode().put("walletPaise","1000").put("inviteeDiscount",false)));service().runOne();assertFalse(service().requestRelease(value.id()));doAnswer(call->{var p=json.readTree((byte[])call.getArgument(1)).path("payload");return new ReferralSourceClient.Reply(200,json.writeValueAsBytes(json.createObjectNode().put("checkoutId",p.path("checkoutId").asText()).put("walletPaise","1000").put("discountPaise","0").put("status","RELEASED")));}).when(referral).send(eq(ReferralSourceClient.Endpoint.OPERATIONS),any());assertTrue(service().runOne());assertTrue(service().requestRelease(value.id()));assertEquals("CANCELLED",jdbc.queryForObject("SELECT status FROM order_schema.checkout",String.class));assertEquals("CANCELLED",jdbc.queryForObject("SELECT status FROM order_schema.customer_order",String.class));assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM order_schema.order_status_history WHERE new_status='CANCELLED'",Integer.class));}

 /** A checkout with reserved funding whose release the core is about to confirm: the next runOne() cancels its unpaid orders. */
 in.craves.order.web.ApiDtos.CheckoutResponse releaseConfirmed()throws Exception{
  replies();var value=orders.checkout(actor,new CheckoutRequest(address,"test",json.createObjectNode().put("walletPaise","1000").put("inviteeDiscount",false)));service().runOne();assertFalse(service().requestRelease(value.id()));
  doAnswer(call->{var p=json.readTree((byte[])call.getArgument(1)).path("payload");return new ReferralSourceClient.Reply(200,json.writeValueAsBytes(json.createObjectNode().put("checkoutId",p.path("checkoutId").asText()).put("walletPaise","1000").put("discountPaise","0").put("status","RELEASED")));}).when(referral).send(eq(ReferralSourceClient.Endpoint.OPERATIONS),any());
  return value;
 }
 @Test void unpaidCancellationWritesNoOrderCancelledWithTheDefaultAllowList()throws Exception{
  releaseConfirmed();assertTrue(service().runOne());
  assertEquals("CANCELLED",jdbc.queryForObject("SELECT status FROM order_schema.customer_order",String.class));assertEquals(0,count("domain_event_outbox"));
 }
 @Test void unpaidCancellationWritesOneOrderCancelledInItsOwnTransactionWhileTheEventIsPublished()throws Exception{
  outboxProperties.setEnabledEventTypes(Set.of("CHEF_ACCEPTED_ORDER","ORDER_CANCELLED"));var value=releaseConfirmed();var order=value.orders().getFirst().id();
  // The event cannot be stored: the cancel rolls back with it and the release stays queued.
  jdbc.execute("ALTER TABLE order_schema.domain_event_outbox ADD CONSTRAINT test_no_order_cancelled CHECK (event_type <> 'ORDER_CANCELLED')");
  assertTrue(service().runOne());
  assertEquals("PAYMENT_PENDING",jdbc.queryForObject("SELECT status FROM order_schema.customer_order",String.class));assertEquals("PAYMENT_PENDING",jdbc.queryForObject("SELECT status FROM order_schema.checkout",String.class));
  assertEquals("RELEASING",jdbc.queryForObject("SELECT state FROM order_schema.referral_checkout_benefit",String.class));assertEquals(0,count("domain_event_outbox"));
  // Once it can be stored, the retry cancels the order and writes the event together.
  jdbc.execute("ALTER TABLE order_schema.domain_event_outbox DROP CONSTRAINT test_no_order_cancelled");jdbc.execute("UPDATE order_schema.referral_checkout_benefit SET next_attempt_at=now()");
  assertTrue(service().runOne());
  assertEquals("CANCELLED",jdbc.queryForObject("SELECT status FROM order_schema.customer_order",String.class));
  var event=json.readTree(jdbc.queryForObject("SELECT payload_json::text FROM order_schema.domain_event_outbox WHERE aggregate_id=? AND event_type='ORDER_CANCELLED'",String.class,order));
  assertEquals(order.toString(),event.path("subject").asText());var data=event.path("data");assertEquals(4,data.size());
  assertEquals(value.id().toString(),data.path("checkoutId").asText());assertEquals(order.toString(),data.path("chefSubOrderId").asText());assertEquals("CUSTOMER_CANCELLED_BEFORE_PAYMENT",data.path("reason").asText());
  assertEquals(jdbc.queryForObject("SELECT updated_at FROM order_schema.customer_order WHERE id=?",java.sql.Timestamp.class,order).toInstant(),java.time.Instant.parse(data.path("cancelledAt").asText()));
  // A repeated release request finds it done and writes nothing more.
  assertTrue(service().requestRelease(value.id()));assertFalse(service().runOne());assertEquals(1,count("domain_event_outbox"));
 }

 @Test void operatorRetryKeepsOriginalOperationAndAppendsAudit()throws Exception{replies();var value=orders.checkout(actor,new CheckoutRequest(address,"test",json.createObjectNode().put("walletPaise","1000").put("inviteeDiscount",false)));String before=jdbc.queryForObject("SELECT reserve_envelope::text FROM order_schema.referral_checkout_benefit",String.class);jdbc.execute("UPDATE order_schema.referral_checkout_benefit SET state='REVIEW',attempts=40");var admin=new in.craves.order.security.CravesPrincipal(java.util.UUID.randomUUID(),null,java.util.Set.of("PAYMENTS_ADMIN"));service().retry(admin,value.id(),"Test dependency repaired","TEST_ONLY_REPAIR");assertTrue(service().runOne());assertEquals(before,jdbc.queryForObject("SELECT reserve_envelope::text FROM order_schema.referral_checkout_benefit",String.class));assertEquals(1,count("referral_benefit_recovery_audit"));assertThrows(Exception.class,()->jdbc.execute("DELETE FROM order_schema.referral_benefit_recovery_audit"));}
 @Test void disablingBenefitWorkerCannotSilentlyFulfilAnUnfundedCheckout()throws Throwable{replies();var value=orders.checkout(actor,new CheckoutRequest(address,"test",json.createObjectNode().put("walletPaise","1000").put("inviteeDiscount",false)));org.springframework.beans.factory.ObjectProvider<ReferralCheckoutBenefits> disabled=mock(org.springframework.beans.factory.ObjectProvider.class);var aspect=new ReferralCheckoutBenefitsAspect(disabled,context.getBean(org.springframework.transaction.PlatformTransactionManager.class),jdbc);var call=mock(org.aspectj.lang.ProceedingJoinPoint.class);when(call.getArgs()).thenReturn(new Object[]{value.id(),null,"test"});assertThrows(Exception.class,()->aspect.paid(call));verify(call,never()).proceed();}

}
