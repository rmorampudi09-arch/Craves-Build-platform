package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.ChefPayoutService;
import in.craves.integration.payout.RazorpayXPayoutClient;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class OrderFinancialFinalizationDatabaseTest {
    JdbcTemplate jdbc;TransactionTemplate tx;FinancePolicyService policies;ChefTaxProfileService profiles;
    OrderFinancialQuoteService quotes;OrderFinancialFinalizationService finalizer;ChefPayoutService payouts;
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    final UUID customer=UUID.randomUUID(),chef=UUID.randomUUID(),checkout=UUID.randomUUID(),order=UUID.randomUUID();
    final CravesPrincipal admin=new CravesPrincipal(UUID.randomUUID(),"",Set.of("PAYMENTS_ADMIN"));
    final Instant pricedAt=Instant.now().minusSeconds(120).truncatedTo(ChronoUnit.MICROS);
    OrderFinancialQuoteService.Response quote;JsonNode snapshot;
    @BeforeEach void setup(){
        String url=System.getenv("LEDGER_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema").locations("classpath:db/migration").load().migrate();
        policies=new FinancePolicyService(jdbc,json,true,true,true);profiles=new ChefTaxProfileService(jdbc,json);
        activate("7");taxProfile(chef,"UNREGISTERED","800000.00");
        quotes=new OrderFinancialQuoteService(jdbc,json,policies,profiles);
        var provider=mock(RazorpayXPayoutClient.class);when(provider.ready()).thenReturn(true);
        var ledger=new LedgerPostingService(jdbc,json,true);payouts=new ChefPayoutService(jdbc,json,policies,ledger,provider);
        finalizer=new OrderFinancialFinalizationService(jdbc,json,ledger,payouts,true);
        quote=tx.execute(s->quotes.quote(request(List.of(input(order,chef)))));snapshot=quote.snapshots().getFirst();
    }
    void activate(String rate){
        var policy=new FinancePolicy(LocalDate.of(2026,9,14),true,true,true,48,0,60,rate,"5","18","18","18",FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0.00",false,"TEST_FINANCE_CLASSIFICATION");
        long revision=policies.current().revision();var draft=tx.execute(s->policies.draft(admin,new FinancePolicyService.DraftRequest(policy,"Test approved commercial terms")));
        tx.execute(s->policies.activate(admin,draft.id(),new FinancePolicyService.ActivateRequest(revision,draft.contentHash(),"Test source certification")));
    }
    void taxProfile(UUID owner,String status,String turnover){
        tx.execute(s->profiles.save(admin,owner,new ChefTaxProfileService.Profile("36","RESTAURANT_ECO_9_5",status,status.equals("REGISTERED")?"36ABCDE1234F1Z5":null,turnover,"2026-27",LocalDate.of(2026,9,14),"0","TEST_EXPLICIT_WITHHOLDING_REVIEW","TEST_RESTAURANT_CLASSIFICATION","TEST_7_PERCENT_PLUS_GST_TERMS"),"Test profile review"));
    }
    OrderFinancialQuoteService.OrderInput input(UUID id,UUID owner){return new OrderFinancialQuoteService.OrderInput(id,owner,UUID.randomUUID(),"36","36","39.00",List.of(new OrderFinancialQuoteService.Item(UUID.randomUUID(),1,"369.00","369.00")));}
    OrderFinancialQuoteService.Request request(List<OrderFinancialQuoteService.OrderInput> orders){return new OrderFinancialQuoteService.Request(checkout,customer,pricedAt,orders);}
    ObjectNode event(JsonNode snap,String kind){
        return json.createObjectNode().put("eventId",UUID.randomUUID().toString()).put("source","order-service").put("schemaVersion","1.0").put("kind",kind)
            .put("sourceVersion",kind.equals("BOUND")?1:2).put("snapshotId",snap.path("snapshotId").asText()).put("snapshotHash",snap.path("hash").asText())
            .put("chefOrderId",snap.path("chefOrderId").asText()).put("checkoutId",snap.path("checkoutId").asText()).put("orderTotal",snap.path("customerTotal").asText())
            .put("checkoutTotal",quote.total()).put("commercialStatus",kind.equals("DELIVERED")?"DELIVERED":kind.equals("CANCELLED")?"CANCELLED":"PAYMENT_PENDING")
            .put("deliveryStatus","DELIVERED").put("deliveryJobId",UUID.randomUUID().toString()).put("deliveredAt",pricedAt.plusSeconds(60).toString()).put("chefAcceptedAt",pricedAt.plusSeconds(10).toString());
    }
    OrderFinancialFinalizationService.Receipt accept(JsonNode event){return tx.execute(s->finalizer.accept(event));}
    UUID payment(String amount,String status,UUID owner){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,amount,currency,status,provider,provider_status,provider_payment_id) VALUES (?,?,?, ?,?,'INR',?,'RAZORPAY','captured',?)",id,checkout,owner,"test/"+id,new BigDecimal(amount),status,"pay_"+id.toString().replace("-",""));return id;}
    long count(String table){return jdbc.queryForObject("SELECT count(*) FROM payment_schema."+table,Long.class);}
    @Test void unregisteredSmallChefDoesNotLoseCustomerGstOrGstTcs(){
        assertEquals("433.47",quote.total());assertEquals("18.45",snapshot.path("foodGst").asText());assertEquals("25.83",snapshot.path("chefServiceFee").asText());
        assertEquals("4.65",snapshot.path("chefFeeGst").asText());assertEquals("338.52",snapshot.path("chefPayable").asText());
        assertEquals("0.00",snapshot.path("chefFoodGstDeduction").asText());assertEquals("0.00",snapshot.path("gstTcsDeduction").asText());
    }
    @Test void capturedUndeliveredTracksFundsButCreatesNoChefEarning(){
        payment(quote.total(),"PAID",customer);assertEquals("CAPTURED_AWAITING_DELIVERY",accept(event(snapshot,"BOUND")).result());
        assertEquals(1,count("finance_capture"));assertEquals(1,count("ledger_transaction"));assertEquals(0,count("finance_earning_projection"));assertEquals(0,count("finance_payable"));
    }
    @Test void deliveredPaidOrderPostsAndExposesOnlyNetAvailableBalance(){
        payment(quote.total(),"PAID",customer);assertEquals("POSTED",accept(event(snapshot,"DELIVERED")).result());
        assertEquals(2,count("ledger_transaction"));assertEquals(1,count("finance_earning_projection"));assertEquals(1,count("finance_payable"));
        var actor=new CravesPrincipal(chef,"",Set.of("CHEF"));assertEquals("338.52",payouts.balance(actor).outstanding());assertTrue(payouts.balance(actor).onHold());
        tx.execute(s->{payouts.bindVerifiedBeneficiary(admin,chef,new ChefPayoutService.Binding("fa_test","cont_test","TEST_BANK_OWNERSHIP","Test beneficiary"));payouts.hold(admin,chef,new ChefPayoutService.Hold(false,"Test verified beneficiary"));return null;});
        assertEquals("338.52",payouts.balance(actor).available());assertTrue(payouts.dueChefs().isEmpty());
        var withdrawal=tx.execute(s->payouts.withdraw(actor,new ChefPayoutService.Withdrawal(UUID.randomUUID(),"338.52")));
        assertEquals("RESERVED",withdrawal.status());assertEquals("0.00",payouts.balance(actor).available());
    }
    @Test void deliveryBeforeCaptureWaitsAndLaterCaptureFinishesWithoutNewDelivery(){
        assertEquals("WAITING_VERIFIED_CAPTURE",accept(event(snapshot,"DELIVERED")).result());assertEquals(0,count("ledger_transaction"));
        payment(quote.total(),"PAID",customer);assertEquals("POSTED",tx.execute(s->finalizer.finish(order)).result());assertEquals(1,count("finance_payable"));
    }
    @Test void repeatedDeliveryWithDifferentTransportIdsPostsExactlyOnce(){
        payment(quote.total(),"PAID",customer);var first=event(snapshot,"DELIVERED");var receipt=accept(first);
        var duplicate=first.deepCopy().put("eventId",UUID.randomUUID().toString());assertEquals(receipt.earningJournalId(),accept(duplicate).earningJournalId());
        assertEquals(2,count("ledger_transaction"));assertEquals(1,count("finance_payable"));
    }
    @Test void concurrentDeliveryRetriesDoNotDuplicateEarningOrCapture()throws Exception{
        payment(quote.total(),"PAID",customer);var template=event(snapshot,"DELIVERED");
        Callable<UUID> action=()->accept(template.deepCopy().put("eventId",UUID.randomUUID().toString())).earningJournalId();
        try(var pool=Executors.newFixedThreadPool(8)){var results=pool.invokeAll(java.util.Collections.nCopies(8,action));UUID first=results.getFirst().get();for(var result:results)assertEquals(first,result.get());}
        assertEquals(2,count("ledger_transaction"));assertEquals(1,count("finance_payable"));
    }
    @Test void changedSourceVersionContentIsConflictNotNewMoney(){
        payment(quote.total(),"PAID",customer);var original=event(snapshot,"DELIVERED");accept(original);
        var changed=original.deepCopy().put("eventId",UUID.randomUUID().toString()).put("deliveryJobId",UUID.randomUUID().toString());
        assertTrue(accept(changed).result().startsWith("CONFLICT_"));assertEquals(1,count("finance_source_exception"));assertEquals(2,count("ledger_transaction"));
    }
    @Test void policyAndChefProfileChangesCannotRepriceAcceptedOrder(){
        activate("20");taxProfile(chef,"REGISTERED","3000000.00");payment(quote.total(),"PAID",customer);accept(event(snapshot,"DELIVERED"));
        assertEquals(new BigDecimal("338.52"),jdbc.queryForObject("SELECT payable FROM payment_schema.finance_earning_projection",BigDecimal.class));
        assertEquals(new BigDecimal("25.83"),jdbc.queryForObject("SELECT service_fee FROM payment_schema.finance_earning_projection",BigDecimal.class));
    }
    @Test void captureAmountMismatchCannotCreateEarnings(){payment("433.46","PAID",customer);assertEquals("WAITING_VERIFIED_CAPTURE",accept(event(snapshot,"DELIVERED")).result());assertEquals(0,count("ledger_transaction"));}
    @Test void anotherCustomersCaptureCannotCreateEarnings(){payment(quote.total(),"PAID",UUID.randomUUID());assertEquals("WAITING_VERIFIED_CAPTURE",accept(event(snapshot,"DELIVERED")).result());assertEquals(0,count("finance_payable"));}
    @Test void uncapturedPaymentCannotCreateEarnings(){payment(quote.total(),"CREATED",customer);assertEquals("WAITING_VERIFIED_CAPTURE",accept(event(snapshot,"DELIVERED")).result());assertEquals(0,count("finance_payable"));}
    @Test void cancelledOrderNeverCreatesNormalEarning(){payment(quote.total(),"PAID",customer);accept(event(snapshot,"CANCELLED"));assertEquals("INELIGIBLE_SOURCE_STATE",tx.execute(s->finalizer.finish(order)).result());assertEquals(0,count("finance_payable"));}
    @Test void rollbackRemovesCaptureJournalProjectionAndEligibilityTogether(){
        payment(quote.total(),"PAID",customer);var delivered=event(snapshot,"DELIVERED");
        assertThrows(IllegalStateException.class,()->tx.execute(s->{finalizer.accept(delivered);throw new IllegalStateException("Simulated crash before commit");}));
        assertEquals(0,count("finance_source_event"));assertEquals(0,count("ledger_transaction"));assertEquals(0,count("finance_payable"));
        assertEquals("POSTED",accept(delivered).result());
    }
    @Test void lateBoundEventCannotRegressDeliveredEarning(){payment(quote.total(),"PAID",customer);accept(event(snapshot,"DELIVERED"));accept(event(snapshot,"BOUND"));assertEquals("DELIVERED",jdbc.queryForObject("SELECT state FROM payment_schema.finance_order_binding",String.class));assertEquals(2,count("ledger_transaction"));}
    @Test void aQuoteAloneIsNotCapturedFundsOrAnEarning(){assertEquals(1,count("finance_issued_snapshot"));assertEquals(0,count("finance_order_binding"));assertEquals(0,count("ledger_transaction"));}
    @Test void refundReservationBlocksNormalFinalization(){
        UUID payment=payment(quote.total(),"PAID",customer);jdbc.update("INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,chef_sub_order_id) VALUES (?,?,?,?,'INR','REQUESTED',?)",UUID.randomUUID(),payment,"refund-test",new BigDecimal(quote.total()),order);
        assertEquals("REFUND_REVIEW_REQUIRED",accept(event(snapshot,"DELIVERED")).result());assertEquals(0,count("finance_payable"));
    }
    @Test void invalidSnapshotAndUnreviewedChefCannotInventBalance(){
        assertTrue(accept(event(snapshot,"DELIVERED").put("snapshotHash","0".repeat(64))).result().startsWith("CONFLICT_"));
        assertThrows(RuntimeException.class,()->tx.execute(s->quotes.quote(new OrderFinancialQuoteService.Request(UUID.randomUUID(),customer,pricedAt,List.of(input(UUID.randomUUID(),UUID.randomUUID()))))));
        assertEquals(0,count("finance_payable"));
    }
    @Test void customerFoodTaxDoesNotChangeWithChefRegistration(){
        taxProfile(chef,"REGISTERED","3000000.00");var another=tx.execute(s->quotes.quote(new OrderFinancialQuoteService.Request(UUID.randomUUID(),customer,pricedAt,List.of(input(UUID.randomUUID(),chef))))).snapshots().getFirst();
        for(String field:List.of("foodGst","chefFoodGstDeduction","gstTcsDeduction","chefFeeGst","chefPayable"))assertEquals(snapshot.path(field),another.path(field));
    }
}
