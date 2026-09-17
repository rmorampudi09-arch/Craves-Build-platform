package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.ChefPayoutService;
import in.craves.integration.payout.ManualChefSettlementService;
import in.craves.integration.payout.ManualChefSettlementService.Action;
import in.craves.integration.payout.RazorpayXPayoutClient;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collections;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Synthetic paid/delivered source and synthetic bank evidence; no provider calls. */
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ReferralManualWithdrawalDatabaseTest {
    ChefReferralEarningsDatabaseTest r; OrderFinancialFinalizationDatabaseTest f;
    ManualChefSettlementService manual; ChefPayoutService payouts; RazorpayXPayoutClient provider;
    ObjectNode credit; CravesPrincipal chef;
    @BeforeEach void setup() {
        r=new ChefReferralEarningsDatabaseTest();r.setup();f=r.f;
        var ledger=new LedgerPostingService(f.jdbc,f.json,true);
        manual=new ManualChefSettlementService(f.jdbc,f.json,f.policies,ledger,true);
        provider=mock(RazorpayXPayoutClient.class);
        payouts=new ChefPayoutService(f.jdbc,f.json,f.policies,ledger,provider,manual);
        chef=new CravesPrincipal(r.recipient,"",Set.of("CHEF"));
        credit=r.credit();r.apply(credit);
    }
    ManualChefSettlementService.Instruction reserve() {
        return f.tx.execute(s->manual.reserveChef(chef,new ChefPayoutService.Withdrawal(UUID.randomUUID(),"7.38")));
    }
    ManualChefSettlementService.Instruction act(ManualChefSettlementService.Instruction i,Action a) {
        boolean paid=a==Action.CONFIRM_PAID || a==Action.CONFIRM_REVERSED;
        var change=new ManualChefSettlementService.Change(UUID.randomUUID(),i.version(),a,"TEST-only bank workflow",
            a==Action.AUTHORIZE_TRANSFER?"TEST-controlled-destination":null,
            paid || a==Action.CONFIRM_NOT_SENT?"TEST-bank-outcome":null,
            paid?"TEST-UTR-"+i.id():null,paid?i.amount():null,paid?Instant.now():null);
        return f.tx.execute(s->manual.change(f.admin,i.id(),change));
    }
    void reverse(String paise) {
        r.apply(credit.deepCopy().put("postingId",UUID.randomUUID().toString()).put("amountPaise",paise)
            .put("originalPostingId",credit.path("postingId").asText()));
    }
    @Test void referralOnlyBalanceUsesExistingChefWithdrawalWithoutCreatingSaleOrBankFacts() {
        assertEquals("7.38",payouts.balance(chef).available());
        var paid=f.tx.execute(s->payouts.withdraw(chef,new ChefPayoutService.Withdrawal(UUID.randomUUID(),"7.38")));
        assertEquals("CRAVES_MANUAL",paid.payoutChannel());assertEquals("0.00",payouts.balance(chef).available());
        assertEquals("7.38",payouts.balance(chef).reservedOrPaid());
        assertEquals(1,f.count("finance_referral_allocation"));assertEquals(1,f.count("finance_payable"));
        assertEquals(0,f.count("finance_beneficiary_version"));verifyNoInteractions(provider);
    }
    @Test void confirmedManualPaymentReconcilesLedgerAndCannotBeWithdrawnTwice() {
        var paid=act(act(reserve(),Action.AUTHORIZE_TRANSFER),Action.CONFIRM_PAID);
        assertEquals("PAID",paid.status());assertEquals("0.00",payouts.balance(chef).outstanding());
        assertEquals("0.00",payouts.balance(chef).available());assertThrows(RuntimeException.class,this::reserve);
        assertEquals(new BigDecimal("7.38"),f.jdbc.queryForObject("SELECT sum(credit_amount) FROM payment_schema.ledger_line WHERE account_code='BANK' AND chef_identity_id=?",BigDecimal.class,r.recipient));
        assertEquals("7.38",payouts.balance(chef).accounting().recordedPayments());verifyNoInteractions(provider);
    }
    @Test void cancelledUnsentReservationRestoresBalanceButKeepsDailyLimit() {
        act(reserve(),Action.CANCEL_RESERVATION);assertEquals("7.38",payouts.balance(chef).available());
        assertTrue(payouts.balance(chef).manualRequestUsedToday());assertThrows(RuntimeException.class,this::reserve);
        assertEquals(0,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_referral_allocation WHERE active",Integer.class));
    }
    @Test void uncertainTransferKeepsReservationUntilRealOutcomeIsRecorded() {
        var unknown=act(act(reserve(),Action.AUTHORIZE_TRANSFER),Action.MARK_UNKNOWN);
        assertThrows(RuntimeException.class,()->act(unknown,Action.CANCEL_RESERVATION));
        assertEquals(1,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_referral_allocation WHERE active",Integer.class));
        act(unknown,Action.CONFIRM_NOT_SENT);
        assertEquals(0,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_referral_allocation WHERE active",Integer.class));
        assertTrue(payouts.balance(chef).onHold());
    }
    @Test void refundBeforeReservationBlocksMoneyEvenIfOperatorReleasesTheHold() {
        r.refund();f.tx.executeWithoutResult(s->payouts.hold(f.admin,r.recipient,new ChefPayoutService.Hold(false,"TEST release attempt")));
        assertEquals("0.00",payouts.balance(chef).available());assertThrows(RuntimeException.class,this::reserve);
    }
    @Test void refundAfterReservationPreventsAuthorizationAndCannotLoseReservedMoney() {
        var reserved=reserve();r.refund();reverse("-738");
        assertThrows(RuntimeException.class,()->act(reserved,Action.AUTHORIZE_TRANSFER));
        assertEquals(1,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_referral_allocation WHERE active",Integer.class));
        act(reserved,Action.CANCEL_RESERVATION);assertEquals("0.00",payouts.balance(chef).available());
    }
    @Test void refundAfterPaymentProducesVisibleDebtAndNoNewWithdrawableBalance() {
        act(act(reserve(),Action.AUTHORIZE_TRANSFER),Action.CONFIRM_PAID);r.refund();reverse("-738");
        assertEquals("-7.38",payouts.balance(chef).accounting().outstanding());
        assertEquals("0.00",payouts.balance(chef).available());assertTrue(payouts.balance(chef).onHold());
    }
    @Test void partialReversalUsesOnlyNetCreditAfterIndependentReview() {
        reverse("-100");f.tx.executeWithoutResult(s->payouts.hold(f.admin,r.recipient,new ChefPayoutService.Hold(false,"TEST reviewed synthetic correction")));
        assertEquals("6.38",payouts.balance(chef).available());
        var request=new ChefPayoutService.Withdrawal(UUID.randomUUID(),"6.38");
        var first=f.tx.execute(s->payouts.withdraw(chef,request));
        assertEquals(first.id(),f.tx.execute(s->payouts.withdraw(chef,request)).id());
        assertEquals(new BigDecimal("6.38"),f.jdbc.queryForObject("SELECT amount FROM payment_schema.finance_referral_allocation",BigDecimal.class));
    }
    @Test void concurrentRequestsReserveReferralCreditOnce() throws Exception {
        Callable<Boolean> attempt=()->{try{reserve();return true;}catch(RuntimeException conflict){return false;}};
        try(var pool=Executors.newFixedThreadPool(4)) {
            int count=0;for(var result:pool.invokeAll(Collections.nCopies(4,attempt)))if(result.get())count++;
            assertEquals(1,count);
        }
        assertEquals(1,f.count("finance_referral_allocation"));
    }
    @Test void anotherChefCannotReserveCreditAndAllocationCannotBeEditedOrDeleted() {
        var other=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));
        assertThrows(RuntimeException.class,()->f.tx.execute(s->manual.reserveChef(other,new ChefPayoutService.Withdrawal(UUID.randomUUID(),"7.38"))));
        reserve();assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_referral_allocation SET amount=1"));
        assertThrows(RuntimeException.class,()->f.jdbc.update("DELETE FROM payment_schema.finance_referral_allocation"));
        assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_referral_allocation SET active=false"));
    }
    @Test void returnedBankPaymentReleasesAllocationButRequiresReviewBeforeAnotherPayment() {
        var paid=act(act(reserve(),Action.AUTHORIZE_TRANSFER),Action.CONFIRM_PAID);
        act(paid,Action.CONFIRM_REVERSED);
        assertEquals(0,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_referral_allocation WHERE active",Integer.class));
        assertEquals("7.38",payouts.balance(chef).outstanding());assertTrue(payouts.balance(chef).onHold());
        assertEquals("0.00",payouts.balance(chef).available());verifyNoInteractions(provider);
    }
    @Test void refundAndReversalPreserveAnExistingOperationalHoldReason() {
        f.tx.executeWithoutResult(s->payouts.hold(f.admin,r.recipient,new ChefPayoutService.Hold(true,"TEST account investigation")));
        r.refund();reverse("-738");
        assertEquals("TEST account investigation",f.jdbc.queryForObject("SELECT hold_reason FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=?",String.class,r.recipient));
        assertTrue(payouts.balance(chef).onHold());
    }
    @Test void saleAndReferralSourcesReserveTogetherAndReconcileOneManualPayment() {
        var sale=new OrderFinancialFinalizationDatabaseTest();
        sale.jdbc=f.jdbc;sale.tx=f.tx;sale.policies=f.policies;sale.profiles=f.profiles;
        sale.quotes=f.quotes;sale.finalizer=f.finalizer;
        f.taxProfile(r.recipient,"UNREGISTERED","0.00");
        sale.quote=f.tx.execute(s->f.quotes.quote(sale.request(java.util.List.of(sale.input(sale.order,r.recipient)))));
        sale.snapshot=sale.quote.snapshots().getFirst();
        sale.payment(sale.quote.total(),"PAID",sale.customer);sale.accept(sale.event(sale.snapshot,"DELIVERED"));
        assertEquals("345.90",payouts.balance(chef).available());
        var combined=f.tx.execute(s->manual.reserveChef(chef,new ChefPayoutService.Withdrawal(UUID.randomUUID(),"345.90")));
        assertEquals(1,f.count("finance_payout_allocation"));assertEquals(1,f.count("finance_referral_allocation"));
        act(act(combined,Action.AUTHORIZE_TRANSFER),Action.CONFIRM_PAID);
        assertEquals("0.00",payouts.balance(chef).outstanding());assertEquals("345.90",payouts.balance(chef).reservedOrPaid());
        verifyNoInteractions(provider);
    }
}
