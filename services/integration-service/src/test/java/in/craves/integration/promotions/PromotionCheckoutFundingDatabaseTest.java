package in.craves.integration.promotions;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import in.craves.integration.config.*;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.referrals.ReferralDatabase;
import in.craves.integration.service.PaymentService;
import in.craves.integration.subscription.SubscriptionPaymentService;
import in.craves.integration.web.PaymentDtos.*;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class PromotionCheckoutFundingDatabaseTest {
 ReferralDatabase r;ObjectMapper json=new ObjectMapper().findAndRegisterModules();UUID checkout,buyer;ObjectNode promotion;HttpServer server;RazorpayPaymentClient provider;PromotionCheckoutFundingService service;PaymentService payments;AtomicInteger promotionReads=new AtomicInteger(),promotionStatus=new AtomicInteger(200);
 @BeforeEach void setup() throws Exception {r=new ReferralDatabase();checkout=UUID.randomUUID();buyer=UUID.randomUUID();provider=mock(RazorpayPaymentClient.class);
 promotion=json.createObjectNode().put("state","RESERVED").put("redemptionId",UUID.randomUUID().toString()).put("promotionId",UUID.randomUUID().toString()).put("fundedBy","CRAVES").put("grossPaise","100000").put("discountPaise","15000").put("netPaise","85000");
 r.db.update("INSERT INTO payment_schema.finance_checkout_quote(checkout_id,customer_identity_id,request_hash,response) VALUES (?,?,?,?::jsonb)",checkout,buyer,"a".repeat(64),"{\"total\":\"1000.00\"}");
 server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",exchange->{String path=exchange.getRequestURI().getPath();ObjectNode response;int status=200;
 if(path.endsWith("/promotion")){promotionReads.incrementAndGet();assertEquals("/payments/checkout/"+checkout+"/promotion",path);assertEquals("TEST_ONLY_INTERNAL_KEY",exchange.getRequestHeaders().getFirst("X-Craves-Internal-Secret"));response=promotion;status=promotionStatus.get();}
 else response=json.createObjectNode().put("id",checkout.toString()).put("customerIdentityId",buyer.toString()).put("status","PAYMENT_PENDING").put("currency","INR").put("grandTotal","1000.00");
 byte[] bytes=response.toString().getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();
 String base="http://127.0.0.1:"+server.getAddress().getPort();var config=new OrderClientProperties(base,base,"TEST_ONLY_INTERNAL_KEY");service=new PromotionCheckoutFundingService(r.db,config,RestClient.builder(),true);
 var cashfree=mock(PaymentProviderProperties.class);when(cashfree.baseUrl()).thenReturn(base);payments=new PaymentService(r.db,json,cashfree,new PaymentRoutingProperties("RAZORPAY",false,true),provider,mock(SubscriptionPaymentService.class),config,RestClient.builder());payments.setPromotionFunding(service);
 when(provider.createOrder(anyString(),any(),anyString(),any())).thenAnswer(i->new RazorpayPaymentClient.CreatedOrder("order_TestOnly","created","rzp_test_synthetic",Map.of("receipt",i.getArgument(0)),json.createObjectNode().put("id","order_TestOnly")));
 }
 @AfterEach void close(){if(server!=null)server.stop(0);}
 CreatePaymentOrderResponse create(){return r.tx.execute(s->payments.createPaymentOrder("Bearer TEST_ONLY_CUSTOMER",new CreatePaymentOrderRequest(checkout,null,null,null,null)));}
 @Test void collectsOnlyNetAndKeepsTheOriginalQuote(){var result=create();assertEquals(new BigDecimal("850.00"),result.amount());verify(provider).createOrder(anyString(),eq(new BigDecimal("850.00")),eq("INR"),any());
  assertEquals("1000.00",r.db.queryForObject("SELECT response->>'total' FROM payment_schema.finance_checkout_quote",String.class));assertEquals(85000L,r.db.queryForObject("SELECT net_paise FROM payment_schema.promotion_checkout_funding",Long.class));
  assertEquals(new BigDecimal("850.00"),r.db.queryForObject("SELECT amount FROM payment_schema.payment_order",BigDecimal.class));}
 @Test void repeatedCreateReturnsTheSameOrderEvenAfterTheRedemptionMovesOn(){var first=create();promotion.put("state","REVIEW");assertEquals(first.paymentOrderId(),create().paymentOrderId());verify(provider,times(1)).createOrder(anyString(),any(),anyString(),any());}
 @Test void checkoutWithoutPromotionChargesTheFullAmountAndFreezesNothing(){promotion.removeAll().put("state","NONE");assertEquals(new BigDecimal("1000.00"),create().amount());assertEquals(0,r.count("promotion_checkout_funding"));}
 @Test void switchedOffNeverAsksOrderService(){payments.setPromotionFunding(new PromotionCheckoutFundingService(r.db,new OrderClientProperties("http://127.0.0.1:1","http://127.0.0.1:1","k"),RestClient.builder(),false));assertEquals(new BigDecimal("1000.00"),create().amount());assertEquals(0,promotionReads.get());}
 @Test void frozenAmountIsKeptAfterFinanceIsSwitchedOff(){var first=create();payments.setPromotionFunding(new PromotionCheckoutFundingService(r.db,new OrderClientProperties("http://127.0.0.1:1","http://127.0.0.1:1","k"),RestClient.builder(),false));var again=create();assertEquals(first.paymentOrderId(),again.paymentOrderId());assertEquals(new BigDecimal("850.00"),again.amount());}
 @Test void frozenPromotionNeverMovesToAnotherProviderAtGross(){var first=create();payments=new PaymentService(r.db,json,mock(PaymentProviderProperties.class),new PaymentRoutingProperties("CASHFREE",false,true),provider,mock(SubscriptionPaymentService.class),new OrderClientProperties("http://127.0.0.1:1","http://127.0.0.1:1","k"),RestClient.builder());payments.setPromotionFunding(service);
  assertThrows(Exception.class,this::create);assertEquals(1,r.count("payment_order"));assertEquals(first.paymentOrderId(),r.db.queryForObject("SELECT id FROM payment_schema.payment_order",UUID.class));}
 @Test void changedPromotionCannotChangeFrozenMoney(){service.prepare(checkout,buyer,new BigDecimal("1000.00"),"INR");promotion.put("discountPaise","20000").put("netPaise","80000");assertThrows(Exception.class,this::create);verifyNoInteractions(provider);assertEquals(15000L,r.db.queryForObject("SELECT discount_paise FROM payment_schema.promotion_checkout_funding",Long.class));}
 @Test void releasedOrUnreadablePromotionNeverChargesTheFullAmount(){promotion.put("state","RELEASED");assertThrows(Exception.class,this::create);promotion.put("state","RESERVED");promotionStatus.set(503);assertThrows(Exception.class,this::create);verifyNoInteractions(provider);assertEquals(0,r.count("payment_order"));}
 @Test void mismatchedOrKitchenFundedOrWholeCheckoutPromotionIsRefused(){promotion.put("grossPaise","90000").put("netPaise","75000");assertThrows(Exception.class,this::create);
  promotion.put("grossPaise","100000").put("netPaise","85000").put("fundedBy","KITCHEN");assertThrows(Exception.class,this::create);
  promotion.put("fundedBy","CRAVES").put("discountPaise","100000").put("netPaise","0");assertThrows(Exception.class,this::create);verifyNoInteractions(provider);assertEquals(0,r.count("promotion_checkout_funding"));}
 @Test void paymentAlreadyStartedWithoutThePromotionIsNotRepriced(){r.db.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,provider,amount,currency,status,provider_status,request_payload,response_payload) VALUES (?,?,?,?,'CASHFREE',1000,'INR','PAYMENT_PENDING','ACTIVE','{}','{}')",UUID.randomUUID(),checkout,buyer,"CRV_test");
  assertThrows(Exception.class,()->service.prepare(checkout,buyer,new BigDecimal("1000.00"),"INR"));assertEquals(0,r.count("promotion_checkout_funding"));}
 @Test void frozenFundingIsImmutable(){create();assertThrows(Exception.class,()->r.db.update("UPDATE payment_schema.promotion_checkout_funding SET net_paise=1,discount_paise=99999"));assertThrows(Exception.class,()->r.db.update("DELETE FROM payment_schema.promotion_checkout_funding"));}
}
