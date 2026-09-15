package in.craves.integration.finance.source;

import in.craves.integration.payout.ChefPayoutService;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.web.ChefDocumentSourceController;
import in.craves.integration.web.FinanceSourceOperationsController;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class FinancialSourceCompletionDatabaseTest {
    OrderFinancialFinalizationDatabaseTest f;
    @BeforeEach void setup(){f=new OrderFinancialFinalizationDatabaseTest();f.setup();}
    CravesPrincipal chef(){return new CravesPrincipal(f.chef,"",Set.of("CHEF"));}
    void delivered(){f.payment(f.quote.total(),"PAID",f.customer);f.accept(f.event(f.snapshot,"DELIVERED"));}
    void beneficiary(){f.tx.execute(s->{f.payouts.bindVerifiedBeneficiary(f.admin,f.chef,new ChefPayoutService.Binding("fa_test","cont_test","TEST_BANK_OWNERSHIP","Test review"));f.payouts.hold(f.admin,f.chef,new ChefPayoutService.Hold(false,"Test reviewed release"));return null;});}
    @Test void replayAliasCannotBeReusedForAnotherFinancialContext(){
        f.payment(f.quote.total(),"PAID",f.customer);var event=f.event(f.snapshot,"DELIVERED");f.accept(event);
        UUID alias=UUID.randomUUID();f.accept(event.deepCopy().put("eventId",alias.toString()));
        assertEquals(2,f.count("finance_source_receipt"));
        var changed=event.deepCopy().put("eventId",alias.toString()).put("orderTotal","999.00");
        assertTrue(f.accept(changed).result().startsWith("CONFLICT_"));assertEquals(2,f.count("ledger_transaction"));assertTrue(f.payouts.balance(chef()).onHold());
    }
    @Test void sourceConflictCannotBeHiddenByReplayingAnEarlierSuccess(){
        f.payment(f.quote.total(),"PAID",f.customer);var event=f.event(f.snapshot,"DELIVERED");f.accept(event);beneficiary();
        f.accept(event.deepCopy().put("eventId",UUID.randomUUID().toString()).put("deliveryJobId",UUID.randomUUID().toString()));
        assertEquals("SOURCE_REVIEW_REQUIRED",f.accept(event).result());assertTrue(f.payouts.balance(chef()).onHold());assertEquals("0.00",f.payouts.balance(chef()).available());
    }
    @Test void oneCheckoutWithTwoChefsCapturesOnceAndFinalizesTwoNetEarnings(){
        UUID otherChef=UUID.randomUUID(),checkout=UUID.randomUUID(),first=UUID.randomUUID(),second=UUID.randomUUID();f.taxProfile(otherChef,"UNREGISTERED","400000.00");
        f.quote=f.tx.execute(s->f.quotes.quote(new OrderFinancialQuoteService.Request(checkout,f.customer,f.pricedAt,List.of(f.input(first,f.chef),f.input(second,otherChef)))));
        UUID payment=UUID.randomUUID();f.jdbc.update("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,amount,currency,status,provider,provider_status,provider_payment_id) VALUES (?,?,?, ?,?,'INR','PAID','RAZORPAY','captured',?)",payment,checkout,f.customer,"multi/"+payment,new BigDecimal(f.quote.total()),"pay_"+payment.toString().replace("-",""));
        for(var snapshot:f.quote.snapshots())assertEquals("POSTED",f.accept(f.event(snapshot,"DELIVERED")).result());
        assertEquals(1,f.count("finance_capture"));assertEquals(3,f.count("ledger_transaction"));assertEquals(2,f.count("finance_earning_projection"));assertEquals(2,f.count("finance_payable"));
        assertEquals(new BigDecimal("677.04"),f.jdbc.queryForObject("SELECT sum(amount) FROM payment_schema.finance_payable",BigDecimal.class));
        assertEquals(0,f.jdbc.queryForObject("SELECT sum(credit_amount-debit_amount) FROM payment_schema.ledger_line WHERE account_code='CUSTOMER_FUNDS'",BigDecimal.class).signum());
    }
    @Test void registrationReviewBlocksQuoteWithoutInventingAFoodGstDeduction(){
        f.taxProfile(f.chef,"UNREGISTERED","2100000.00");
        assertThrows(RuntimeException.class,()->f.tx.execute(s->f.quotes.quote(new OrderFinancialQuoteService.Request(UUID.randomUUID(),f.customer,f.pricedAt,List.of(f.input(UUID.randomUUID(),f.chef))))));
        assertEquals("REGISTRATION_REVIEW_REQUIRED",f.profiles.resolved(f.chef).registrationReview());assertEquals("0.00",f.profiles.resolved(f.chef).foodGstDeduction());
    }
    @Test void postedRefundHoldCannotBeBypassedByReleasingOnlyTheUiHold(){
        UUID payment=f.payment(f.quote.total(),"PAID",f.customer);f.accept(f.event(f.snapshot,"DELIVERED"));beneficiary();
        f.tx.execute(s->f.payouts.withdraw(chef(),new ChefPayoutService.Withdrawal(UUID.randomUUID(),"338.52")));
        f.jdbc.update("INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,chef_sub_order_id) VALUES (?,?,?,?,'INR','REQUESTED',?)",UUID.randomUUID(),payment,"new-refund",new BigDecimal("100.00"),f.order);
        assertTrue(f.payouts.balance(chef()).onHold());
        f.tx.execute(s->{f.payouts.hold(f.admin,f.chef,new ChefPayoutService.Hold(false,"This does not approve a refund adjustment"));return null;});
        assertThrows(RuntimeException.class,()->f.tx.execute(s->f.payouts.claim()));assertEquals("RESERVED",f.payouts.balance(chef()).recentPayouts().getFirst().status());
    }
    @Test void earningsPdfSourceIncludesFeeTaxAndReconciledLiability(){
        delivered();var source=new ChefDocumentSourceController(f.jdbc,true);
        var result=source.earnings(chef(),Instant.now().minusSeconds(86400),Instant.now().plusSeconds(60),"INR","Asia/Kolkata");
        String text=result.getBody().toString();assertTrue(text.contains("25.83"));assertTrue(text.contains("4.65"));assertTrue(text.contains("338.52"));assertTrue(text.contains("GST on fee"));
        assertTrue(text.contains("Closing recorded outstanding"));assertFalse(text.contains(f.customer.toString()));
    }
    @Test void anotherChefCannotReadTheNewEarningOrTransfer(){
        delivered();var source=new ChefDocumentSourceController(f.jdbc,true);var other=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));
        String result=source.earnings(other,Instant.now().minusSeconds(86400),Instant.now().plusSeconds(60),"INR","Asia/Kolkata").getBody().toString();
        assertFalse(result.contains(f.order.toString()));assertFalse(result.contains("338.52"));
        assertThrows(RuntimeException.class,()->source.earnings(new CravesPrincipal(f.chef,"",Set.of("CUSTOMER")),Instant.now().minusSeconds(86400),Instant.now(),"INR","Asia/Kolkata"));
    }
    @Test void sourceStatusShowsActualCountersAndDeniesNonFinanceReaders(){
        delivered();var api=new FinanceSourceOperationsController(f.jdbc,true);var status=api.status(f.admin);
        assertEquals(1,status.capturedCheckouts());assertEquals(1,status.postedEarnings());assertTrue(status.finalizationEnabled());
        assertThrows(RuntimeException.class,()->api.status(chef()));
    }
}
