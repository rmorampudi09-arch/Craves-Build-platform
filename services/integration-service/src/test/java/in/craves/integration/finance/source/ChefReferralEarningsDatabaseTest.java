package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.referrals.ChefReferralEarningsMirror;
import in.craves.integration.referrals.ReferralFinanceConsumer;
import in.craves.integration.referrals.ReferralJournalMirror;
import in.craves.integration.referrals.transport.ReferralSourceClient;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ChefReferralEarningsDatabaseTest {
    OrderFinancialFinalizationDatabaseTest f; ChefReferralEarningsMirror mirror;
    UUID recipient=UUID.randomUUID();
    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        f=new OrderFinancialFinalizationDatabaseTest(); f.setup();
        f.payment(f.quote.total(),"PAID",f.customer); f.accept(f.event(f.snapshot,"DELIVERED"));
        mirror=new ChefReferralEarningsMirror(f.jdbc,new LedgerPostingService(f.jdbc,f.json,true));
    }
    ObjectNode credit() {
        Instant at=Instant.now().truncatedTo(ChronoUnit.MICROS);
        return f.json.createObjectNode().put("postingId",UUID.randomUUID().toString()).put("rewardId",UUID.randomUUID().toString())
            .put("chefOrderId",f.order.toString()).put("checkoutId",f.checkout.toString()).put("sellingChefId",f.chef.toString())
            .put("beneficiaryId",recipient.toString()).put("amountPaise","738").putNull("originalPostingId")
            .put("postingMonth",at.atZone(ZoneId.of("Asia/Kolkata")).toLocalDate().withDayOfMonth(1).toString())
            .put("postedAt",at.toString()).put("policyVersion","CHEF_COMMISSION_20260916").put("currency","INR");
    }
    void apply(ObjectNode body) {f.tx.executeWithoutResult(s->mirror.apply(UUID.randomUUID(),body));}
    ReferralFinanceConsumer consumer() {
        var manager=new org.springframework.jdbc.datasource.DataSourceTransactionManager(f.jdbc.getDataSource());
        return new ReferralFinanceConsumer(f.jdbc,f.json,mock(ReferralSourceClient.class),manager,
            new ReferralJournalMirror(f.jdbc,new LedgerPostingService(f.jdbc,f.json,true)));
    }
    BigDecimal balance(UUID chef) {return f.jdbc.queryForObject("SELECT coalesce(sum(credit_amount-debit_amount),0) FROM payment_schema.ledger_line WHERE account_code='CHEF_PAYABLE' AND chef_identity_id=?",BigDecimal.class,chef);}
    @Test void duplicateCreditIncreasesRecipientEarningsOnceAndSellerKeepsSaleEarnings() {
        var body=credit();BigDecimal sellerBefore=balance(f.chef);apply(body);apply(body);
        assertEquals(0,new BigDecimal("7.38").compareTo(balance(recipient)));assertEquals(sellerBefore,balance(f.chef));
        assertEquals(1,f.count("chef_referral_posting"));assertEquals(0,f.count("referral_journal_projection"));
        assertEquals(0,f.jdbc.queryForObject("SELECT sum(debit_amount-credit_amount) FROM payment_schema.ledger_line",BigDecimal.class).signum());
    }
    @Test void alteredReplayCannotChangeChefOrAmount() {
        var body=credit();apply(body);assertThrows(RuntimeException.class,()->apply(body.deepCopy().put("amountPaise","739")));
        assertThrows(RuntimeException.class,()->apply(body.deepCopy().put("beneficiaryId",UUID.randomUUID().toString())));
        assertEquals(1,f.count("chef_referral_posting"));
    }
    @Test void reversalArrivingBeforeCreditRetriesThenReversesExactlyOnce() {
        var body=credit();var reverse=body.deepCopy().put("postingId",UUID.randomUUID().toString()).put("amountPaise","-738")
            .put("originalPostingId",body.path("postingId").asText());
        assertThrows(RuntimeException.class,()->apply(reverse));assertEquals(0,f.count("chef_referral_posting"));
        apply(body);apply(reverse);apply(reverse);assertEquals(0,balance(recipient).signum());assertEquals(2,f.count("chef_referral_posting"));
        assertThrows(RuntimeException.class,()->apply(reverse.deepCopy().put("postingId",UUID.randomUUID().toString())));
    }
    @Test void unknownOrderSelfReferralAndOverCommissionAreRejected() {
        assertThrows(RuntimeException.class,()->apply(credit().put("chefOrderId",UUID.randomUUID().toString())));
        assertThrows(RuntimeException.class,()->apply(credit().put("beneficiaryId",f.chef.toString())));
        assertThrows(RuntimeException.class,()->apply(credit().put("amountPaise","2584")));
        assertEquals(0,f.count("chef_referral_posting"));
    }
    @Test void concurrentRetriesCreateOneEconomicEffect() throws Exception {
        var body=credit();try(var pool=Executors.newFixedThreadPool(4)) {
            var results=pool.invokeAll(List.of(()->{apply(body);return true;},()->{apply(body);return true;},()->{apply(body);return true;}));
            for(var result:results)result.get();
        }
        assertEquals(1,f.count("chef_referral_posting"));assertEquals(0,new BigDecimal("7.38").compareTo(balance(recipient)));
    }
    @Test void databaseHistoryIsImmutable() {
        apply(credit());assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.chef_referral_posting SET amount_paise=1"));
        assertThrows(RuntimeException.class,()->f.jdbc.update("DELETE FROM payment_schema.chef_referral_posting"));
    }
    void refund() {
        UUID payment=f.jdbc.queryForObject("SELECT payment_order_id FROM payment_schema.finance_capture WHERE checkout_id=?",UUID.class,f.checkout);
        f.tx.executeWithoutResult(s->f.jdbc.update("INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,chef_sub_order_id) VALUES (?,?,?,?,'INR','REQUESTED',?)",UUID.randomUUID(),payment,"test-refund/"+UUID.randomUUID(),new BigDecimal(f.quote.total()),f.order));
    }
    void assertHeld() {
        assertEquals(true,f.jdbc.queryForObject("SELECT on_hold AND hold_kind='OPERATIONAL' FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=?",Boolean.class,recipient));
    }
    @Test void delayedCreditAfterRefundCanReconcileWithoutReleasingMoney() {
        var body=credit();refund();apply(body);assertHeld();
        var reverse=body.deepCopy().put("postingId",UUID.randomUUID().toString()).put("amountPaise","-738")
            .put("originalPostingId",body.path("postingId").asText());
        apply(reverse);assertEquals(0,balance(recipient).signum());assertHeld();
        assertThrows(RuntimeException.class,()->apply(credit()));
    }
    @Test void refundAfterCreditImmediatelyHoldsRecipientAndChangedCheckoutCannotReverse() {
        var body=credit();apply(body);refund();assertHeld();
        var reverse=body.deepCopy().put("postingId",UUID.randomUUID().toString()).put("amountPaise","-738")
            .put("originalPostingId",body.path("postingId").asText()).put("checkoutId",UUID.randomUUID().toString());
        assertThrows(RuntimeException.class,()->apply(reverse));assertEquals(1,f.count("chef_referral_posting"));
    }
    @Test void durableConsumerAcknowledgesCreditOnceAcrossRepeatedDeliveries() {
        var worker=consumer();var body=credit();UUID event=UUID.randomUUID();
        worker.persist(event,"referral.chef.earning",body);worker.persist(event,"referral.chef.earning",body);
        assertTrue(worker.applyOne());assertFalse(worker.applyOne());
        worker.persist(UUID.randomUUID(),"referral.chef.earning",body);assertTrue(worker.applyOne());
        assertEquals(1,f.count("chef_referral_posting"));
        assertEquals(2,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.referral_consumer_inbox WHERE status='APPLIED'",Integer.class));
        assertEquals(0,new BigDecimal("7.38").compareTo(balance(recipient)));
    }
    @Test void durableConsumerRecoversReversalBeforeCreditWithoutLosingEitherFact() {
        var worker=consumer();var body=credit();UUID reversalEvent=UUID.randomUUID();
        var reverse=body.deepCopy().put("postingId",UUID.randomUUID().toString()).put("amountPaise","-738")
            .put("originalPostingId",body.path("postingId").asText());
        worker.persist(reversalEvent,"referral.chef.earning",reverse);assertTrue(worker.applyOne());
        assertEquals("RECEIVED",f.jdbc.queryForObject("SELECT status FROM payment_schema.referral_consumer_inbox WHERE event_id=?",String.class,reversalEvent));
        assertEquals(0,f.count("chef_referral_posting"));
        worker.persist(UUID.randomUUID(),"referral.chef.earning",body);assertTrue(worker.applyOne());
        f.jdbc.update("UPDATE payment_schema.referral_consumer_inbox SET next_attempt_at=now() WHERE event_id=?",reversalEvent);
        assertTrue(worker.applyOne());assertEquals(0,balance(recipient).signum());assertHeld();
        assertEquals(2,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.referral_consumer_inbox WHERE status='APPLIED'",Integer.class));
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"249.99,false", "250.00,true", "250.01,true"})
    void minimumBoundaryReachesChefPayableWithoutChangingSeller(String food,boolean accepted) {
        // Rebuild only the explicitly disposable fixture with the tested food amount.
        f=new OrderFinancialFinalizationDatabaseTest() {
            @Override OrderFinancialQuoteService.OrderInput input(UUID id,UUID owner) {
                return new OrderFinancialQuoteService.OrderInput(id,owner,UUID.randomUUID(),"36","36","39.00",
                    List.of(new OrderFinancialQuoteService.Item(UUID.randomUUID(),1,food,food)));
            }
        };
        f.setup();
        f.payment(f.quote.total(),"PAID",f.customer);
        f.accept(f.event(f.snapshot,"DELIVERED"));
        mirror=new ChefReferralEarningsMirror(f.jdbc,new LedgerPostingService(f.jdbc,f.json,true));
        var body=credit().put("amountPaise","500");
        BigDecimal sellerBefore=balance(f.chef);
        if(accepted) {
            apply(body); apply(body);
            assertEquals(0,new BigDecimal("5.00").compareTo(balance(recipient)));
            assertEquals(1,f.count("chef_referral_posting"));
        } else {
            var error=assertThrows(IllegalStateException.class,()->apply(body));
            assertEquals("CHEF_REFERRAL_COMMISSION_EXCEEDED",error.getMessage());
            assertEquals(0,balance(recipient).signum());
            assertEquals(0,f.count("chef_referral_posting"));
        }
        assertEquals(sellerBefore,balance(f.chef));
        assertEquals(0,f.count("referral_journal_projection"));
        assertEquals(0,f.jdbc.queryForObject("SELECT sum(debit_amount-credit_amount) FROM payment_schema.ledger_line",BigDecimal.class).signum());
    }

}
