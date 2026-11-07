package in.craves.integration.promotions;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.referrals.ReferralDatabase;
import in.craves.integration.refund.*;
import in.craves.integration.refund.RefundModels.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class PromotionRefundDatabaseTest {
 ReferralDatabase r;ObjectMapper json=new ObjectMapper().findAndRegisterModules();UUID checkout,buyer,first,second;PromotionRefundService promotions;RefundRequestService source;
 @BeforeEach void setup()throws Exception{r=new ReferralDatabase();checkout=UUID.randomUUID();buyer=UUID.randomUUID();
  // ids chosen so "first" sorts before "second": the remainder lands on "second"
  first=UUID.fromString("00000000-0000-4000-8000-"+String.format("%012d",new Random().nextInt(1000000)));second=UUID.fromString("ffffffff-0000-4000-8000-"+String.format("%012d",new Random().nextInt(1000000)));
  quote("333.33","666.67");promotions=new PromotionRefundService(r.db,json);source=new RefundRequestService(r.db,new RefundEventValidator());source.setPromotionRefunds(promotions);}
 void quote(String a,String b){var q=json.createObjectNode().put("checkoutId",checkout.toString()).put("total","1000.00");var s=q.putArray("snapshots");s.addObject().put("chefOrderId",first.toString()).put("customerTotal",a);s.addObject().put("chefOrderId",second.toString()).put("customerTotal",b);
  r.db.update("INSERT INTO payment_schema.finance_checkout_quote(checkout_id,customer_identity_id,request_hash,response) VALUES (?,?,?,?::jsonb)",checkout,buyer,"a".repeat(64),q.toString());}
 void frozenAndPaid(long discount){r.db.update("INSERT INTO payment_schema.promotion_checkout_funding(checkout_id,buyer_id,redemption_id,promotion_id,gross_paise,discount_paise,net_paise) VALUES (?,?,?,?,100000,?,?)",checkout,buyer,UUID.randomUUID(),UUID.randomUUID(),discount,100000-discount);
  r.db.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,provider,amount,currency,status,provider_status,provider_order_id,provider_payment_id,request_payload,response_payload) VALUES (?,?,?,?,'RAZORPAY',?,'INR','PAID','captured','order_TestOnly','pay_TestOnly','{}','{}')",UUID.randomUUID(),checkout,buyer,"CRV_test_"+checkout,BigDecimal.valueOf(100000-discount,2));}
 EventEnvelope<RefundRequestedData> event(UUID order,String amount){return new EventEnvelope<>(UUID.randomUUID(),"REFUND_REQUESTED","1.0",Instant.now(),checkout,UUID.randomUUID(),"order-service",order.toString(),new RefundRequestedData(checkout,order,buyer,new BigDecimal(amount),"INR","CHEF_DECLINED",Instant.now()));}
 boolean accept(EventEnvelope<RefundRequestedData> e)throws Exception{String raw=json.writeValueAsString(e);return r.tx.execute(s->source.accept(e,raw));}
 BigDecimal refunded(UUID order){return r.db.queryForObject("SELECT amount FROM payment_schema.refund WHERE chef_sub_order_id=?",BigDecimal.class,order);}
 @Test void fullRefundsOfEveryChefOrderReturnExactlyWhatWasCollected()throws Exception{frozenAndPaid(15001);assertTrue(accept(event(first,"333.33")));assertTrue(accept(event(second,"666.67")));
  // discount 150.01 shared 333.33:666.67 -> 50.00 / 100.01 (remainder last); cash 283.33 + 566.66 = 849.99 = net
  assertEquals(new BigDecimal("283.33"),refunded(first));assertEquals(new BigDecimal("566.66"),refunded(second));
  assertEquals(new BigDecimal("849.99"),r.db.queryForObject("SELECT sum(amount) FROM payment_schema.refund",BigDecimal.class));}
 @Test void partialRefundRoundsDownAndNeverExceedsTheLinesCash()throws Exception{frozenAndPaid(15000);assertTrue(accept(event(second,"100.00")));
  // second's share 100.01 of 666.67 -> net 566.66; 100.00 * 566.66 / 666.67 = 84.998... -> 84.99
  assertEquals(new BigDecimal("84.99"),refunded(second));}
 @Test void statusEventsKeepTheRequestedAmountForOrderService()throws Exception{frozenAndPaid(15000);accept(event(first,"333.33"));var payload=json.createObjectNode();payload.putObject("data").put("status","SUCCESS").put("refundAmount","283.33");
  var original=new RefundStatusEventFactory.SerializedRefundStatusEvent(UUID.randomUUID(),"REFUND_STATUS_CHANGED","1.0",Instant.now(),checkout,UUID.randomUUID(),first,payload.toString(),"TEST_ONLY_EVENT");
  assertEquals(new BigDecimal("333.33"),json.readTree(promotions.customerEvent(original).payloadJson()).path("data").path("refundAmount").decimalValue());}
 @Test void checkoutWithoutPromotionIsUntouched()throws Exception{r.db.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,provider,amount,currency,status,provider_status,provider_order_id,provider_payment_id,request_payload,response_payload) VALUES (?,?,?,?,'RAZORPAY',1000,'INR','PAID','captured','order_TestOnly','pay_TestOnly','{}','{}')",UUID.randomUUID(),checkout,buyer,"CRV_plain_"+checkout);
  assertTrue(accept(event(first,"333.33")));assertEquals(new BigDecimal("333.33"),refunded(first));var payload=json.createObjectNode();payload.putObject("data").put("refundAmount","333.33");
  var e=new RefundStatusEventFactory.SerializedRefundStatusEvent(UUID.randomUUID(),"REFUND_STATUS_CHANGED","1.0",Instant.now(),checkout,UUID.randomUUID(),first,payload.toString(),"K");assertSame(e,promotions.customerEvent(e));}
 @Test void refundAboveTheLineOrForAnotherCustomerRollsBack()throws Exception{frozenAndPaid(15000);assertThrows(RefundRequestService.RefundNonRetryableException.class,()->accept(event(first,"333.34")));
  var stranger=new EventEnvelope<>(UUID.randomUUID(),"REFUND_REQUESTED","1.0",Instant.now(),checkout,UUID.randomUUID(),"order-service",first.toString(),new RefundRequestedData(checkout,first,UUID.randomUUID(),new BigDecimal("333.33"),"INR","CHEF_DECLINED",Instant.now()));
  assertThrows(RefundRequestService.RefundNonRetryableException.class,()->accept(stranger));assertEquals(0,r.count("refund"));assertEquals(0,r.count("refund_request_inbox"));}
 @Test void quoteThatDoesNotAddUpToTheFrozenGrossIsRefused()throws Exception{checkout=UUID.randomUUID();quote("300.00","666.67");frozenAndPaid(15000);assertThrows(RefundRequestService.RefundNonRetryableException.class,()->accept(event(first,"300.00")));assertEquals(0,r.count("refund"));}
 void companyShareFrozenAndPaid(long share){r.db.update("INSERT INTO payment_schema.company_share_checkout_funding(checkout_id,buyer_id,charge_id,company_id,gross_paise,company_share_paise,person_paise) VALUES (?,?,?,?,100000,?,?)",checkout,buyer,UUID.randomUUID(),UUID.randomUUID(),share,100000-share);
  r.db.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,provider,amount,currency,status,provider_status,provider_order_id,provider_payment_id,request_payload,response_payload) VALUES (?,?,?,?,'RAZORPAY',?,'INR','PAID','captured','order_TestOnly','pay_TestOnly','{}','{}')",UUID.randomUUID(),checkout,buyer,"CRV_test_"+checkout,BigDecimal.valueOf(100000-share,2));}
 @Test void companyShareRefundsReturnOnlyWhatThePersonPaid()throws Exception{companyShareFrozenAndPaid(40000);assertTrue(accept(event(first,"333.33")));assertTrue(accept(event(second,"666.67")));
  // share 400.00 split 333.33:666.67 -> 133.33 / 266.67; person paid 200.00 + 400.00 = 600.00 and gets exactly that back
  assertEquals(new BigDecimal("200.00"),refunded(first));assertEquals(new BigDecimal("400.00"),refunded(second));
  var payload=json.createObjectNode();payload.putObject("data").put("status","SUCCESS").put("refundAmount","200.00");
  var original=new RefundStatusEventFactory.SerializedRefundStatusEvent(UUID.randomUUID(),"REFUND_STATUS_CHANGED","1.0",Instant.now(),checkout,UUID.randomUUID(),first,payload.toString(),"TEST_ONLY_EVENT");
  assertEquals(new BigDecimal("333.33"),json.readTree(promotions.customerEvent(original).payloadJson()).path("data").path("refundAmount").decimalValue());}
 @Test void promotionAndCompanyShareTogetherAreRefused()throws Exception{frozenAndPaid(15000);r.db.update("INSERT INTO payment_schema.company_share_checkout_funding(checkout_id,buyer_id,charge_id,company_id,gross_paise,company_share_paise,person_paise) VALUES (?,?,?,?,100000,40000,60000)",checkout,buyer,UUID.randomUUID(),UUID.randomUUID());
  assertThrows(RefundRequestService.RefundNonRetryableException.class,()->accept(event(first,"333.33")));assertEquals(0,r.count("refund"));}
 @Test void sharesSplitExactlyWithRemainderOnTheLast(){var w=new LinkedHashMap<UUID,Long>();w.put(second,2L);w.put(first,1L);var s=PromotionRefundService.shares(10,w);assertEquals(3L,s.get(first));assertEquals(7L,s.get(second));assertEquals(List.of(first,second),new ArrayList<>(s.keySet()));}
}
