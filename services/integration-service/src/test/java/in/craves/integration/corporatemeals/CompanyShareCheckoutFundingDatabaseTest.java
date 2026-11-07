package in.craves.integration.corporatemeals;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import in.craves.integration.config.*;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.promotions.PromotionCheckoutFundingService;
import in.craves.integration.referrals.ReferralDatabase;
import in.craves.integration.service.PaymentService;
import in.craves.integration.subscription.SubscriptionPaymentService;
import in.craves.integration.web.PaymentDtos.*;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class CompanyShareCheckoutFundingDatabaseTest {
 static final Instant NOW=Instant.parse("2026-11-06T10:00:00Z");
 ReferralDatabase r;ObjectMapper json=new ObjectMapper().findAndRegisterModules();UUID checkout,buyer,charge,company;ObjectNode share,terms;HttpServer server;String base;RazorpayPaymentClient provider;CompanyShareCheckoutFundingService service;PaymentService payments;
 AtomicInteger shareReads=new AtomicInteger(),termsReads=new AtomicInteger(),termsStatus=new AtomicInteger(200);
 @BeforeEach void setup() throws Exception {r=new ReferralDatabase();checkout=UUID.randomUUID();buyer=UUID.randomUUID();charge=UUID.randomUUID();company=UUID.randomUUID();provider=mock(RazorpayPaymentClient.class);
 share=json.createObjectNode().put("state","RESERVED").put("chargeId",charge.toString()).put("companyId",company.toString()).put("grossPaise","100000").put("companySharePaise","40000").put("personPaise","60000");
 terms=json.createObjectNode().put("id",charge.toString()).put("companyId",company.toString()).put("companySharePaise",40000).put("status","RESERVED").putNull("orderId").put("expiresAt",NOW.plusSeconds(300).toString());
 r.db.update("INSERT INTO payment_schema.finance_checkout_quote(checkout_id,customer_identity_id,request_hash,response) VALUES (?,?,?,?::jsonb)",checkout,buyer,"a".repeat(64),"{\"total\":\"1000.00\"}");
 server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",exchange->{String path=exchange.getRequestURI().getPath();ObjectNode response;int status=200;
 if(path.endsWith("/company-share")){shareReads.incrementAndGet();assertEquals("/payments/checkout/"+checkout+"/company-share",path);assertEquals("TEST_ONLY_INTERNAL_KEY",exchange.getRequestHeaders().getFirst("X-Craves-Internal-Secret"));response=share;}
 else if(path.endsWith("/checkout-terms")){termsReads.incrementAndGet();assertEquals("/internal/v1/corporate-meals/charges/"+charge+"/checkout-terms",path);assertEquals("personId="+buyer,exchange.getRequestURI().getQuery());assertEquals("TEST_ONLY_ADVANCED_SECRET",exchange.getRequestHeaders().getFirst("X-Craves-Internal-Secret"));response=terms;status=termsStatus.get();}
 else if(path.endsWith("/promotion"))response=json.createObjectNode().put("state","NONE");
 else response=json.createObjectNode().put("id",checkout.toString()).put("customerIdentityId",buyer.toString()).put("status","PAYMENT_PENDING").put("currency","INR").put("grandTotal","1000.00");
 byte[] bytes=response.toString().getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
 base="http://127.0.0.1:"+server.getAddress().getPort();var config=new OrderClientProperties(base,base,"TEST_ONLY_INTERNAL_KEY");service=service(true,base);
 var cashfree=mock(PaymentProviderProperties.class);when(cashfree.baseUrl()).thenReturn(base);payments=new PaymentService(r.db,json,cashfree,new PaymentRoutingProperties("RAZORPAY",false,true),provider,mock(SubscriptionPaymentService.class),config,RestClient.builder());
 payments.setPromotionFunding(new PromotionCheckoutFundingService(r.db,config,RestClient.builder(),true));payments.setCompanyShareFunding(service);
 when(provider.createOrder(anyString(),any(),anyString(),any())).thenAnswer(i->new RazorpayPaymentClient.CreatedOrder("order_TestOnly","created","rzp_test_synthetic",Map.of("receipt",i.getArgument(0)),json.createObjectNode().put("id","order_TestOnly")));
 }
 CompanyShareCheckoutFundingService service(boolean enabled,String url){return new CompanyShareCheckoutFundingService(r.db,new OrderClientProperties(url,url,"TEST_ONLY_INTERNAL_KEY"),RestClient.builder(),enabled,url,"TEST_ONLY_ADVANCED_SECRET",Clock.fixed(NOW,ZoneOffset.UTC));}
 @AfterEach void close(){if(server!=null)server.stop(0);}
 CreatePaymentOrderResponse create(){return r.tx.execute(s->payments.createPaymentOrder("Bearer TEST_ONLY_CUSTOMER",new CreatePaymentOrderRequest(checkout,null,null,null,null)));}
 @Test void personPaysOnlyTheirPartAndTheQuoteStays(){var result=create();assertEquals(new BigDecimal("600.00"),result.amount());verify(provider).createOrder(anyString(),eq(new BigDecimal("600.00")),eq("INR"),any());
  assertEquals("1000.00",r.db.queryForObject("SELECT response->>'total' FROM payment_schema.finance_checkout_quote",String.class));assertEquals(40000L,r.db.queryForObject("SELECT company_share_paise FROM payment_schema.company_share_checkout_funding",Long.class));
  assertEquals(1,termsReads.get());assertEquals(0,r.count("promotion_checkout_funding"));}
 @Test void repeatedCreateKeepsTheFrozenOrderWithoutAskingAgain(){var first=create();share.put("state","REVIEW");terms.put("status","RELEASED");assertEquals(first.paymentOrderId(),create().paymentOrderId());verify(provider,times(1)).createOrder(anyString(),any(),anyString(),any());assertEquals(1,termsReads.get());}
 @Test void checkoutWithoutCompanyShareChargesTheFullAmountAndAsksM10Nothing(){share.removeAll().put("state","NONE");assertEquals(new BigDecimal("1000.00"),create().amount());assertEquals(0,r.count("company_share_checkout_funding"));assertEquals(0,termsReads.get());}
 @Test void switchedOffNeverAsksOrderService(){payments.setCompanyShareFunding(service(false,"http://127.0.0.1:1"));assertEquals(new BigDecimal("1000.00"),create().amount());assertEquals(0,shareReads.get());}
 @Test void frozenAmountIsKeptAfterFinanceIsSwitchedOff(){var first=create();payments.setCompanyShareFunding(service(false,"http://127.0.0.1:1"));var again=create();assertEquals(first.paymentOrderId(),again.paymentOrderId());assertEquals(new BigDecimal("600.00"),again.amount());}
 @Test void lapsedOrReleasedOrMissingChargeIsNeverCollectedPartly(){
  terms.put("expiresAt",NOW.toString());assertThrows(Exception.class,this::create);
  terms.put("expiresAt",NOW.plusSeconds(300).toString()).put("status","RELEASED").put("orderId",checkout.toString());assertThrows(Exception.class,this::create);
  terms.put("status","CONFIRMED").put("orderId",UUID.randomUUID().toString());assertThrows(Exception.class,this::create);
  terms.put("status","RESERVED").put("orderId",checkout.toString());assertThrows(Exception.class,this::create);
  terms.putNull("orderId");termsStatus.set(404);assertThrows(Exception.class,this::create);
  termsStatus.set(503);assertThrows(Exception.class,this::create);
  verifyNoInteractions(provider);assertEquals(0,r.count("payment_order"));assertEquals(0,r.count("company_share_checkout_funding"));}
 @Test void chargeConfirmedForThisCheckoutIsAccepted(){terms.put("status","CONFIRMED").put("orderId",checkout.toString()).put("expiresAt",NOW.minusSeconds(3600).toString());assertEquals(new BigDecimal("600.00"),create().amount());}
 @Test void m10ShareMustMatchTheFrozenOrderShare(){terms.put("companySharePaise",50000);assertThrows(Exception.class,this::create);terms.put("companySharePaise",40000).put("companyId",UUID.randomUUID().toString());assertThrows(Exception.class,this::create);verifyNoInteractions(provider);}
 @Test void unconfiguredAdvancedServiceRefusesInsteadOfChargingLess(){payments.setCompanyShareFunding(new CompanyShareCheckoutFundingService(r.db,new OrderClientProperties(base,base,"TEST_ONLY_INTERNAL_KEY"),RestClient.builder(),true,"","",Clock.fixed(NOW,ZoneOffset.UTC)));
  assertThrows(Exception.class,this::create);verifyNoInteractions(provider);assertEquals(0,r.count("payment_order"));}
 @Test void mismatchedOrWholeCheckoutShareIsRefused(){share.put("grossPaise","90000").put("personPaise","50000");assertThrows(Exception.class,this::create);
  share.put("grossPaise","100000").put("companySharePaise","100000").put("personPaise","0");terms.put("companySharePaise",100000);assertThrows(Exception.class,this::create);verifyNoInteractions(provider);assertEquals(0,r.count("company_share_checkout_funding"));}
 @Test void paymentAlreadyStartedWithoutTheShareIsNotRepriced(){r.db.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,provider,amount,currency,status,provider_status,request_payload,response_payload) VALUES (?,?,?,?,'CASHFREE',1000,'INR','PAYMENT_PENDING','ACTIVE','{}','{}')",UUID.randomUUID(),checkout,buyer,"CRV_test");
  assertThrows(Exception.class,()->service.prepare(checkout,buyer,new BigDecimal("1000.00"),"INR"));assertEquals(0,r.count("company_share_checkout_funding"));}
 @Test void frozenShareNeverMovesToAnotherProvider(){create();payments=new PaymentService(r.db,json,mock(PaymentProviderProperties.class),new PaymentRoutingProperties("CASHFREE",false,true),provider,mock(SubscriptionPaymentService.class),new OrderClientProperties("http://127.0.0.1:1","http://127.0.0.1:1","k"),RestClient.builder());payments.setCompanyShareFunding(service);
  assertThrows(Exception.class,this::create);assertEquals(1,r.count("payment_order"));}
 @Test void frozenFundingIsImmutable(){create();assertThrows(Exception.class,()->r.db.update("UPDATE payment_schema.company_share_checkout_funding SET person_paise=1,company_share_paise=99999"));assertThrows(Exception.class,()->r.db.update("DELETE FROM payment_schema.company_share_checkout_funding"));}
}
