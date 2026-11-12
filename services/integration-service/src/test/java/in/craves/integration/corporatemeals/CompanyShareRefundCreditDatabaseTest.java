package in.craves.integration.corporatemeals;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import in.craves.integration.config.OrderClientProperties;
import in.craves.integration.promotions.PromotionRefundService;
import in.craves.integration.referrals.ReferralDatabase;
import in.craves.integration.refund.*;
import in.craves.integration.refund.RefundModels.*;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class CompanyShareRefundCreditDatabaseTest {
 ReferralDatabase r;ObjectMapper json=new ObjectMapper().findAndRegisterModules();UUID checkout,buyer,charge,first,second;RefundRequestService source;CompanyShareRefundCreditService credits;
 HttpServer server;String base;AtomicInteger status=new AtomicInteger(200),calls=new AtomicInteger();AtomicReference<String> answer=new AtomicReference<>(),lastBody=new AtomicReference<>(),orderState=new AtomicReference<>("CONFIRMED");
 @BeforeEach void setup()throws Exception{r=new ReferralDatabase();checkout=UUID.randomUUID();buyer=UUID.randomUUID();charge=UUID.randomUUID();
  first=UUID.fromString("00000000-0000-4000-8000-"+String.format("%012d",new Random().nextInt(1000000)));second=UUID.fromString("ffffffff-0000-4000-8000-"+String.format("%012d",new Random().nextInt(1000000)));
  var q=json.createObjectNode().put("checkoutId",checkout.toString()).put("total","1000.00");var s=q.putArray("snapshots");s.addObject().put("chefOrderId",first.toString()).put("customerTotal","333.33");s.addObject().put("chefOrderId",second.toString()).put("customerTotal","666.67");
  r.db.update("INSERT INTO payment_schema.finance_checkout_quote(checkout_id,customer_identity_id,request_hash,response) VALUES (?,?,?,?::jsonb)",checkout,buyer,"a".repeat(64),q.toString());
  r.db.update("INSERT INTO payment_schema.company_share_checkout_funding(checkout_id,buyer_id,charge_id,company_id,gross_paise,company_share_paise,person_paise) VALUES (?,?,?,?,100000,40000,60000)",checkout,buyer,charge,UUID.randomUUID());
  r.db.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,provider,amount,currency,status,provider_status,provider_order_id,provider_payment_id,checkout_key_id,request_payload,response_payload) VALUES (?,?,?,?,'RAZORPAY',600,'INR','PAID','captured','order_TestOnly','pay_TestOnly','rzp_live_TestOnly','{}','{}')",UUID.randomUUID(),checkout,buyer,"CRV_test_"+checkout);
  source=new RefundRequestService(r.db,new RefundEventValidator());source.setPromotionRefunds(new PromotionRefundService(r.db,json));
  server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",exchange->{String path=exchange.getRequestURI().getPath();String body;int code=200;
   if(path.endsWith("/company-share")){assertEquals("TEST_ONLY_INTERNAL_KEY",exchange.getRequestHeaders().getFirst("X-Craves-Internal-Secret"));body=json.createObjectNode().put("state",orderState.get()).put("chargeId",charge.toString()).toString();}
   else{calls.incrementAndGet();assertEquals("/internal/v1/corporate-meals/charges/"+charge+"/credit",path);assertEquals("POST",exchange.getRequestMethod());assertEquals("TEST_ONLY_ADVANCED_SECRET",exchange.getRequestHeaders().getFirst("X-Craves-Internal-Secret"));
    lastBody.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));body=answer.get()==null?json.readTree(lastBody.get()).toString():answer.get();code=status.get();}
   byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(code,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
  base="http://127.0.0.1:"+server.getAddress().getPort();credits=new CompanyShareRefundCreditService(r.db,r.manager,RestClient.builder(),base,"TEST_ONLY_ADVANCED_SECRET");}
 @AfterEach void close(){if(server!=null)server.stop(0);}
 UUID refund(UUID order,String amount)throws Exception{var e=new EventEnvelope<>(UUID.randomUUID(),"REFUND_REQUESTED","1.0",Instant.now(),checkout,UUID.randomUUID(),"order-service",order.toString(),new RefundRequestedData(checkout,order,buyer,new BigDecimal(amount),"INR","CHEF_DECLINED",Instant.now()));
  String raw=json.writeValueAsString(e);assertEquals(Boolean.TRUE,r.tx.execute(s->source.accept(e,raw)));return r.db.queryForObject("SELECT id FROM payment_schema.refund WHERE chef_sub_order_id=?",UUID.class,order);}
 Map<String,Object> row(UUID refund){return r.db.queryForMap("SELECT * FROM payment_schema.company_share_refund_credit WHERE refund_id=?",refund);}
 void due(){r.db.update("UPDATE payment_schema.company_share_refund_credit SET next_attempt_at=now()-interval '1 second'");}
 @Test void successfulRefundRecordsTheCompanysPartInTheSameTransaction()throws Exception{UUID id=refund(second,"666.67");
  r.db.update("UPDATE payment_schema.refund SET status='PENDING',provider_refund_id='rfnd_TestOnly' WHERE id=?",id);
  var repository=new RefundRepository(r.db,new RefundStatusEventFactory(json));repository.setCompanyShareCredits(credits);
  var item=r.tx.execute(s->repository.claimBatch(false,true,20,8,300,UUID.randomUUID(),"RAZORPAY","PRODUCTION")).getFirst();
  assertTrue(Boolean.TRUE.equals(r.tx.execute(s->repository.applyProviderResult(item,new ProviderRefundResult("SUCCESS","rfnd_TestOnly","{\"status\":\"processed\"}"),"SUCCESS","REFUNDED",Instant.now(),Instant.now()))));
  // share 400.00 split 333.33:666.67 -> 133.33 / 266.67 (remainder last); a full refund of second credits 266.67
  assertEquals(26667L,((Number)row(id).get("amount_paise")).longValue());assertEquals("PENDING",row(id).get("state"));}
 @Test void pendingResultRecordsNothing()throws Exception{UUID id=refund(first,"333.33");r.db.update("UPDATE payment_schema.refund SET status='PENDING',provider_refund_id='rfnd_TestOnly' WHERE id=?",id);
  var repository=new RefundRepository(r.db,new RefundStatusEventFactory(json));repository.setCompanyShareCredits(credits);
  var item=r.tx.execute(s->repository.claimBatch(false,true,20,8,300,UUID.randomUUID(),"RAZORPAY","PRODUCTION")).getFirst();
  assertTrue(Boolean.TRUE.equals(r.tx.execute(s->repository.applyProviderResult(item,new ProviderRefundResult("PENDING","rfnd_TestOnly","{}"),"PENDING","REFUND_PENDING",Instant.now(),Instant.now()))));
  assertEquals(0,r.count("company_share_refund_credit"));}
 @Test void partialRefundCreditsTheRoundedDownShareAndTheWorkerSendsItOnce()throws Exception{UUID id=refund(second,"100.00");credits.enqueue(id);credits.enqueue(id);
  // second's share 266.67 of 666.67: 100.00 * 26667 / 66667 = 40.0006 -> 40.00
  assertEquals(4000L,((Number)row(id).get("amount_paise")).longValue());assertEquals(1,r.count("company_share_refund_credit"));
  assertTrue(credits.runOne());assertFalse(credits.runOne());assertEquals(1,calls.get());assertEquals("CREDITED",row(id).get("state"));assertEquals(4000L,((Number)row(id).get("credited_paise")).longValue());
  var sent=json.readTree(lastBody.get());assertEquals(buyer.toString(),sent.path("personId").asText());assertEquals(checkout.toString(),sent.path("orderId").asText());assertEquals(id.toString(),sent.path("refundId").asText());assertEquals(4000,sent.path("amountPaise").asLong());}
 @Test void allCreditsOfAFullyRefundedCheckoutNeverExceedTheShare()throws Exception{UUID a=refund(first,"333.33"),b=refund(second,"666.67");credits.enqueue(a);credits.enqueue(b);
  assertEquals(40000L,r.db.queryForObject("SELECT sum(amount_paise) FROM payment_schema.company_share_refund_credit",Long.class));}
 @Test void nothingOwedIsRecordedAndNotRetried()throws Exception{UUID id=refund(first,"333.33");credits.enqueue(id);answer.set("{\"amountPaise\":0,\"remainingSharePaise\":0}");
  assertTrue(credits.runOne());assertEquals("NOTHING_OWED",row(id).get("state"));due();assertFalse(credits.runOne());}
 @Test void conflictGoesToReviewButOutagesAndAuthErrorsRetryWithBackoff()throws Exception{UUID id=refund(first,"333.33");credits.enqueue(id);
  status.set(503);answer.set("{}");assertTrue(credits.runOne());assertEquals("PENDING",row(id).get("state"));assertFalse(credits.runOne());
  assertTrue(r.db.queryForObject("SELECT next_attempt_at>now()+interval '30 seconds' FROM payment_schema.company_share_refund_credit",Boolean.class));
  due();status.set(401);assertTrue(credits.runOne());assertEquals("PENDING",row(id).get("state"));
  due();status.set(409);answer.set("{\"code\":\"CREDIT_EXCEEDS_SHARE\"}");assertTrue(credits.runOne());assertEquals("REVIEW",row(id).get("state"));assertTrue(row(id).get("last_error").toString().contains("CREDIT_EXCEEDS_SHARE"));
  due();assertFalse(credits.runOne());assertEquals(3,calls.get());}
 @Test void notConfirmedYetIsRetriedBeforeReview()throws Exception{UUID id=refund(first,"333.33");credits.enqueue(id);status.set(409);answer.set("{\"code\":\"CHARGE_NOT_CONFIRMED\"}");
  assertTrue(credits.runOne());assertEquals("PENDING",row(id).get("state"));
  r.db.update("UPDATE payment_schema.company_share_refund_credit SET attempt_count=9");due();assertTrue(credits.runOne());assertEquals("REVIEW",row(id).get("state"));}
 @Test void staleLeaseCannotOverwriteANewerAttempt()throws Exception{UUID id=refund(first,"333.33");credits.enqueue(id);status.set(503);answer.set("{}");assertTrue(credits.runOne());
  r.db.update("UPDATE payment_schema.company_share_refund_credit SET state='PENDING',attempt_count=5,last_error='newer'");
  status.set(200);answer.set(null);due();assertTrue(credits.runOne());assertEquals("CREDITED",row(id).get("state"));assertEquals(6,((Number)row(id).get("attempt_count")).intValue());}
 @Test void databaseErrorWhileRecordingNeverLosesTheRefundsSuccess()throws Exception{UUID id=refund(second,"666.67");
  r.db.execute("ALTER TABLE payment_schema.company_share_refund_credit ADD CONSTRAINT test_only_refuse CHECK (false) NOT VALID");
  r.db.update("UPDATE payment_schema.refund SET status='PENDING',provider_refund_id='rfnd_TestOnly' WHERE id=?",id);
  var repository=new RefundRepository(r.db,new RefundStatusEventFactory(json));repository.setCompanyShareCredits(credits);
  var item=r.tx.execute(s->repository.claimBatch(false,true,20,8,300,UUID.randomUUID(),"RAZORPAY","PRODUCTION")).getFirst();
  assertTrue(Boolean.TRUE.equals(r.tx.execute(s->repository.applyProviderResult(item,new ProviderRefundResult("SUCCESS","rfnd_TestOnly","{\"status\":\"processed\"}"),"SUCCESS","REFUNDED",Instant.now(),Instant.now()))));
  assertEquals("SUCCESS",r.db.queryForObject("SELECT status FROM payment_schema.refund WHERE id=?",String.class,id));assertEquals(1,r.count("refund_status_outbox"));assertEquals(0,r.count("company_share_refund_credit"));}
 @Test void unexpectedAmountGoesToReview()throws Exception{UUID id=refund(first,"333.33");credits.enqueue(id);answer.set("{\"amountPaise\":1}");assertTrue(credits.runOne());assertEquals("REVIEW",row(id).get("state"));}
 @Test void unconfiguredAdvancedServiceSendsNothing()throws Exception{UUID id=refund(first,"333.33");credits.enqueue(id);var off=new CompanyShareRefundCreditService(r.db,r.manager,RestClient.builder(),"","");assertFalse(off.runOne());assertEquals(0,calls.get());assertEquals("PENDING",row(id).get("state"));}
 @Test void checkoutWithoutACompanyShareRecordsNothing()throws Exception{UUID id=refund(first,"333.33");r.db.update("UPDATE payment_schema.refund SET checkout_id=NULL WHERE id=?",id);credits.enqueue(id);credits.enqueue(UUID.randomUUID());assertEquals(0,r.count("company_share_refund_credit"));}
 @Test void inconsistentRefundGoesToReviewWithoutBlockingTheRefund()throws Exception{UUID id=refund(first,"333.33");r.db.update("UPDATE payment_schema.refund SET request_event_payload=jsonb_set(request_event_payload,'{data,refundAmount}','\"333.34\"') WHERE id=?",id);
  credits.enqueue(id);assertEquals("REVIEW",row(id).get("state"));assertEquals(0L,((Number)row(id).get("amount_paise")).longValue());}
 @Test void captureConfirmationIsReadFromOrderServiceOnceAndRemembered(){var funding=new CompanyShareCheckoutFundingService(r.db,new OrderClientProperties(base,base,"TEST_ONLY_INTERNAL_KEY"),RestClient.builder(),false,"","",Clock.systemUTC());
  orderState.set("REVIEW");assertFalse(funding.confirmedForCheckout(checkout));assertEquals(0,r.count("company_share_checkout_confirmation"));
  orderState.set("CONFIRMED");assertTrue(funding.confirmedForCheckout(checkout));assertEquals(1,r.count("company_share_checkout_confirmation"));
  server.stop(0);server=null;assertTrue(funding.confirmedForCheckout(checkout));assertFalse(funding.confirmedForCheckout(UUID.randomUUID()));}
 @Test void captureConfirmationForAnotherChargeIsIgnored(){var funding=new CompanyShareCheckoutFundingService(r.db,new OrderClientProperties(base,base,"TEST_ONLY_INTERNAL_KEY"),RestClient.builder(),false,"","",Clock.systemUTC());
  r.db.update("DELETE FROM payment_schema.company_share_refund_credit");charge=UUID.randomUUID();assertFalse(funding.confirmedForCheckout(checkout));}
}
