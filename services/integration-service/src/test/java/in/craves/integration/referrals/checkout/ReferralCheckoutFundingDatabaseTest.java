package in.craves.integration.referrals.checkout;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import in.craves.integration.config.*;
import in.craves.integration.payment.RazorpayPaymentClient;
import in.craves.integration.ledger.LedgerPostingService;
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
class ReferralCheckoutFundingDatabaseTest {
 ReferralDatabase r;ObjectMapper json=new ObjectMapper().findAndRegisterModules();UUID checkout,buyer,order;ObjectNode funding;HttpServer server;RazorpayPaymentClient provider;ReferralCheckoutFundingService service;PaymentService payments;AtomicInteger callbackStatus=new AtomicInteger(200),callbacks=new AtomicInteger();
 @BeforeEach void setup() throws Exception {r=new ReferralDatabase();checkout=UUID.randomUUID();buyer=UUID.randomUUID();order=UUID.randomUUID();provider=mock(RazorpayPaymentClient.class);funding=json.createObjectNode().put("checkoutId",checkout.toString()).put("buyerUserId",buyer.toString()).put("grossPaise","100000").put("walletPaise","30000").put("discountPaise","25000").put("gatewayPaise","45000").put("status","RESERVED");
 r.db.update("INSERT INTO payment_schema.finance_checkout_quote(checkout_id,customer_identity_id,request_hash,response) VALUES (?,?,?,?::jsonb)",checkout,buyer,"a".repeat(64),"{\"total\":\"1000.00\"}");r.db.update("INSERT INTO payment_schema.finance_issued_snapshot(id,checkout_id,chef_order_id,chef_identity_id,snapshot_hash,payload) VALUES (?,?,?,?,?,?::jsonb)",UUID.randomUUID(),checkout,order,UUID.randomUUID(),"b".repeat(64),"{\"customerTotal\":\"1000.00\",\"customerFood\":\"800.00\"}");
 server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",exchange->{String path=exchange.getRequestURI().getPath();ObjectNode response;int status=200;
 if(path.endsWith("referral-paid")){callbacks.incrementAndGet();assertEquals("TEST_ONLY_INTERNAL_KEY",exchange.getRequestHeaders().getFirst("X-Craves-Internal-Secret"));status=callbackStatus.get();response=json.createObjectNode().put("state","CONSUMED");response.set("funding",funding);}
 else if(path.endsWith("referral-benefits")){assertEquals("Bearer TEST_ONLY_CUSTOMER",exchange.getRequestHeaders().getFirst("Authorization"));response=json.createObjectNode().put("state","RESERVED");response.set("funding",funding);}
 else response=json.createObjectNode().put("id",checkout.toString()).put("customerIdentityId",buyer.toString()).put("status","PAYMENT_PENDING").put("currency","INR").put("grandTotal","1000.00").put("referralBenefitsRequested",true);
 byte[] bytes=response.toString().getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();});server.start();String base="http://127.0.0.1:"+server.getAddress().getPort();var config=new OrderClientProperties(base,base,"TEST_ONLY_INTERNAL_KEY");service=new ReferralCheckoutFundingService(r.db,json,provider,new LedgerPostingService(r.db,json,true),r.manager,config,RestClient.builder());var cashfree=mock(PaymentProviderProperties.class);when(cashfree.baseUrl()).thenReturn(base);payments=new PaymentService(r.db,json,cashfree,new PaymentRoutingProperties("RAZORPAY",false,true),provider,mock(SubscriptionPaymentService.class),config,RestClient.builder());payments.setReferralFunding(service);
 when(provider.createOrder(anyString(),any(),anyString(),any())).thenAnswer(i->new RazorpayPaymentClient.CreatedOrder("order_TestOnly","created","rzp_test_synthetic",Map.of("receipt",i.getArgument(0)),json.createObjectNode().put("id","order_TestOnly")));
 }
 @AfterEach void close(){if(server!=null)server.stop(0);}
 CreatePaymentOrderResponse create(){return r.tx.execute(s->payments.createPaymentOrder("Bearer TEST_ONLY_CUSTOMER",new CreatePaymentOrderRequest(checkout,null,null,null,null)));}
 void paid(UUID payment){r.db.update("UPDATE payment_schema.payment_order SET status='PAID',provider_status='captured',provider_payment_id='pay_TestOnly' WHERE id=?",payment);}
 @Test void actualPaymentServiceCollectsOnlyNetAndPreservesOriginalQuote(){var result=create();assertEquals(new BigDecimal("450.00"),result.amount());verify(provider).createOrder(anyString(),eq(new BigDecimal("450.00")),eq("INR"),any());assertEquals("1000.00",r.db.queryForObject("SELECT response->>'total' FROM payment_schema.finance_checkout_quote",String.class));assertEquals(result.paymentOrderId(),create().paymentOrderId());verify(provider,times(1)).createOrder(anyString(),any(),anyString(),any());}
 @Test void uncertainProviderCreateIsNeverRepeated(){when(provider.createOrder(anyString(),any(),anyString(),any())).thenThrow(new IllegalStateException("timeout"));assertThrows(Exception.class,this::create);assertEquals("UNKNOWN",r.db.queryForObject("SELECT create_state FROM payment_schema.referral_checkout_funding",String.class));assertThrows(Exception.class,this::create);verify(provider,times(1)).createOrder(anyString(),any(),anyString(),any());assertEquals(0,r.count("payment_order"));}
 @Test void lostOuterPaymentTransactionRecoversSavedProviderReceipt(){assertThrows(Exception.class,()->r.tx.execute(s->{payments.createPaymentOrder("Bearer TEST_ONLY_CUSTOMER",new CreatePaymentOrderRequest(checkout,null,null,null,null));throw new IllegalStateException("commit lost");}));assertEquals(0,r.count("payment_order"));var result=create();assertEquals(new BigDecimal("450.00"),result.amount());verify(provider,times(1)).createOrder(anyString(),any(),anyString(),any());}
 @Test void capturedNetAndConsumedWalletPostOneBalancedGrossFundingJournal(){var result=create();paid(result.paymentOrderId());assertTrue(service.runOne());assertFalse(service.runOne());assertEquals(1,r.count("referral_funding_capture"));assertEquals(1,r.count("ledger_transaction"));assertEquals("1000.00",r.db.queryForObject("SELECT credit_amount::text FROM payment_schema.ledger_line WHERE account_code='CUSTOMER_FUNDS'",String.class));assertEquals("450.00",r.db.queryForObject("SELECT debit_amount::text FROM payment_schema.ledger_line WHERE account_code='GATEWAY_CLEARING'",String.class));assertEquals(0,r.db.queryForObject("SELECT count(*) FROM payment_schema.ledger_line WHERE chef_identity_id IS NOT NULL",Integer.class));}
 @Test void zeroExternalTenderNeverCallsProviderOrInventsProviderIdentity(){funding.put("walletPaise","75000").put("gatewayPaise","0");var result=create();assertEquals("REFERRAL_WALLET",result.provider());assertNull(result.providerOrderId());assertEquals(PaymentOrderStatus.PAYMENT_PENDING,result.status());verify(provider,never()).createOrder(anyString(),any(),anyString(),any());assertTrue(service.runOne());assertEquals("PAID",r.db.queryForObject("SELECT status FROM payment_schema.payment_order",String.class));assertEquals(0,r.db.queryForObject("SELECT count(*) FROM payment_schema.ledger_line WHERE account_code='GATEWAY_CLEARING'",Integer.class));assertNull(r.db.queryForObject("SELECT provider_payment_id FROM payment_schema.referral_funding_capture",String.class));}
 @Test void orderConsumptionOutageLeavesPaidCollectionDurableAndNoFundingJournal(){var result=create();paid(result.paymentOrderId());callbackStatus.set(409);assertTrue(service.runOne());assertEquals(0,r.count("ledger_transaction"));assertEquals("PAID",r.db.queryForObject("SELECT status FROM payment_schema.payment_order",String.class));callbackStatus.set(200);r.db.execute("UPDATE payment_schema.referral_checkout_funding SET next_attempt_at=now()");assertTrue(service.runOne());assertEquals(1,r.count("ledger_transaction"));}
 @Test void changedOwnerPlanCannotChangeFrozenMoney(){create();funding.put("walletPaise","20000").put("gatewayPaise","55000");assertThrows(Exception.class,this::create);assertEquals(45000,r.db.queryForObject("SELECT gateway_paise FROM payment_schema.referral_checkout_funding",Integer.class));}
 @Test void missingFundingRuntimeRejectsOptedInCheckoutBeforeProvider(){payments.setReferralFunding(null);assertThrows(Exception.class,this::create);verifyNoInteractions(provider);assertEquals(0,r.count("payment_order"));}
 @Test void uncapturedProviderMoneyNeverCallsOrderOrCreditsFunds(){create();assertFalse(service.runOne());assertEquals(0,callbacks.get());assertEquals(0,r.count("ledger_transaction"));}
}
