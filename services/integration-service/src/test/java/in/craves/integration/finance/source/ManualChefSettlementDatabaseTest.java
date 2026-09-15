package in.craves.integration.finance.source;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.payout.ChefPayoutService;
import in.craves.integration.payout.ManualChefSettlementService;
import in.craves.integration.payout.ManualChefSettlementService.Action;
import in.craves.integration.payout.ManualChefSettlementService.Change;
import in.craves.integration.payout.ManualChefSettlementService.Instruction;
import in.craves.integration.payout.ManualChefSettlementService.Reservation;
import in.craves.integration.payout.RazorpayXPayoutClient;
import in.craves.integration.security.CravesPrincipal;
import in.craves.integration.web.ChefDocumentSourceController;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ManualChefSettlementDatabaseTest {
    OrderFinancialFinalizationDatabaseTest f;
    ManualChefSettlementService manual;
    ChefPayoutService balances;
    RazorpayXPayoutClient provider;
    UUID payment;
    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"),"Disposable CI database acknowledgement is required before schema reset");
        f=new OrderFinancialFinalizationDatabaseTest();f.setup();
        payment=f.payment(f.quote.total(),"PAID",f.customer);assertEquals("POSTED",f.accept(f.event(f.snapshot,"DELIVERED")).result());
        var ledger=new LedgerPostingService(f.jdbc,f.json,true);
        manual=new ManualChefSettlementService(f.jdbc,f.json,f.policies,ledger,true);
        provider=mock(RazorpayXPayoutClient.class);
        balances=new ChefPayoutService(f.jdbc,f.json,f.policies,ledger,provider,manual);
    }
    CravesPrincipal chef(){return new CravesPrincipal(f.chef,"",Set.of("CHEF"));}
    Instruction reserve(){return f.tx.execute(s->manual.reserveAdmin(f.admin,f.chef,new Reservation(UUID.randomUUID(),"338.52","TEST owner requested payment")));}
    Change change(Instruction i,Action action) {
        boolean money=action==Action.CONFIRM_PAID || action==Action.CONFIRM_REVERSED;
        return new Change(UUID.randomUUID(),i.version(),action,"TEST controlled bank evidence",
            action==Action.AUTHORIZE_TRANSFER?"TEST-destination-record":null,
            money || action==Action.CONFIRM_NOT_SENT?"TEST-bank-evidence":null,
            money?"TEST-UTR-"+i.id():null,money?i.amount():null,money?Instant.now():null);
    }
    Instruction act(Instruction i,Action action){return apply(i,change(i,action));}
    Instruction apply(Instruction i,Change r){return f.tx.execute(s->manual.change(f.admin,i.id(),r));}
    Instruction authorize(){return act(reserve(),Action.AUTHORIZE_TRANSFER);}
    Instruction paid(){return act(authorize(),Action.CONFIRM_PAID);}
    @Test void sourceEarningBecomesManualAvailableWithoutInventingBankValidation() {
        assertEquals("338.52",balances.balance(chef()).available());assertEquals("CRAVES_MANUAL",balances.balance(chef()).payoutMode());
        assertEquals(0,f.count("finance_beneficiary_version"));assertEquals(0,f.count("finance_bank_request"));assertTrue(balances.balance(chef()).executionEnabled());
        var i=reserve();assertEquals("RESERVED",i.status());assertNull(i.destinationReference());assertEquals("0.00",balances.balance(chef()).available());
        assertEquals(0,f.count("finance_manual_settlement_action"));verifyNoInteractions(provider);
    }
    @Test void chefWithdrawalUsesManualChannelAndExistingDailyQuota() {
        var result=f.tx.execute(s->balances.withdraw(chef(),new ChefPayoutService.Withdrawal(UUID.randomUUID(),"338.52")));
        assertEquals("CRAVES_MANUAL",result.payoutChannel());assertEquals(1,f.count("finance_manual_withdrawal_day"));verifyNoInteractions(provider);
    }
    @Test void sameReservationReplaysAndChangedReasonOrAmountFails() {
        var request=new Reservation(UUID.randomUUID(),"338.52","TEST exact reason");
        var first=f.tx.execute(s->manual.reserveAdmin(f.admin,f.chef,request));
        assertEquals(first.id(),f.tx.execute(s->manual.reserveAdmin(f.admin,f.chef,request)).id());
        assertThrows(RuntimeException.class,()->f.tx.execute(s->manual.reserveAdmin(f.admin,f.chef,new Reservation(request.requestKey(),"338.52","Different"))));
        assertThrows(RuntimeException.class,()->f.tx.execute(s->manual.reserveAdmin(f.admin,f.chef,new Reservation(request.requestKey(),"338.51",request.reason()))));
        assertEquals(1,f.count("finance_payout_instruction"));
    }
    @Test void invalidPaiseOrStaleBalanceCannotReserve() {
        for(String value:List.of("338.521","338.5","338.53","0.00","-1.00","3.3852e2"))
            assertThrows(RuntimeException.class,()->f.tx.execute(s->manual.reserveAdmin(f.admin,f.chef,new Reservation(UUID.randomUUID(),value,"TEST"))));
        assertEquals(0,f.count("finance_payout_instruction"));
    }
    @Test void concurrentReservationsReserveOnlyOnce()throws Exception {
        Callable<Boolean> action=()->{try{reserve();return true;}catch(RuntimeException conflict){return false;}};
        try(var pool=Executors.newFixedThreadPool(6)){long count=0;for(var result:pool.invokeAll(Collections.nCopies(6,action)))if(result.get())count++;assertEquals(1,count);}
        assertEquals(1,f.count("finance_payout_allocation"));
    }
    @Test void actualConfirmationPostsExactBankJournalAndReducesBalance() {
        var p=paid();assertEquals("PAID",p.status());assertNotNull(p.paidAt());assertEquals("0.00",balances.balance(chef()).outstanding());
        assertEquals(new BigDecimal("338.52"),f.jdbc.queryForObject("SELECT sum(credit_amount) FROM payment_schema.ledger_line WHERE account_code='BANK'",BigDecimal.class));
        assertEquals(3,f.count("ledger_transaction"));assertEquals(0,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_payout_instruction WHERE provider_id IS NOT NULL OR beneficiary_id IS NOT NULL",Integer.class));
        assertEquals(1,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_payout_allocation WHERE active",Integer.class));verifyNoInteractions(provider);
    }
    @Test void duplicateConfirmationIsSingleUseAndChangedEvidenceConflicts() {
        var submitted=authorize();var request=change(submitted,Action.CONFIRM_PAID);var confirmed=apply(submitted,request);
        assertEquals(confirmed.id(),apply(submitted,request).id());assertEquals(3,f.count("ledger_transaction"));
        var changed=new Change(request.actionKey(),request.expectedVersion(),request.action(),"changed",null,request.evidenceReference(),request.bankReference(),request.amount(),request.paidAt());
        assertThrows(RuntimeException.class,()->apply(submitted,changed));
    }
    @Test void concurrentConfirmationPostsOnce()throws Exception {
        var submitted=authorize();var request=change(submitted,Action.CONFIRM_PAID);
        try(var pool=Executors.newFixedThreadPool(4)){for(var result:pool.invokeAll(Collections.nCopies(4,(Callable<String>)()->apply(submitted,request).status())))assertEquals("PAID",result.get());}
        assertEquals(3,f.count("ledger_transaction"));assertEquals(2,f.count("finance_manual_settlement_action"));
    }
    @Test void neverConfirmAnUnsubmittedReservation() {
        var reserved=reserve();assertThrows(RuntimeException.class,()->act(reserved,Action.CONFIRM_PAID));assertEquals(2,f.count("ledger_transaction"));
    }
    @Test void exactAmountAndNonFutureBankTimestampAreRequired() {
        var submitted=authorize();var base=change(submitted,Action.CONFIRM_PAID);
        assertThrows(RuntimeException.class,()->apply(submitted,new Change(base.actionKey(),base.expectedVersion(),base.action(),base.reason(),null,base.evidenceReference(),base.bankReference(),"338.51",base.paidAt())));
        assertThrows(RuntimeException.class,()->apply(submitted,new Change(base.actionKey(),base.expectedVersion(),base.action(),base.reason(),null,base.evidenceReference(),base.bankReference(),base.amount(),Instant.now().plusSeconds(3600))));
        assertEquals("338.52",balances.balance(chef()).outstanding());
    }
    @Test void unsentCancellationReleasesReservationButNotDailyQuota() {
        assertEquals("CANCELLED",act(reserve(),Action.CANCEL_RESERVATION).status());assertEquals("338.52",balances.balance(chef()).available());
        assertTrue(balances.balance(chef()).manualRequestUsedToday());assertThrows(RuntimeException.class,this::reserve);
    }
    @Test void submittedUnknownCannotBeCancelledOrPaidTwice() {
        var unknown=act(authorize(),Action.MARK_UNKNOWN);assertEquals("UNKNOWN",unknown.status());
        assertThrows(RuntimeException.class,()->act(unknown,Action.CANCEL_RESERVATION));assertEquals("0.00",balances.balance(chef()).available());
        assertEquals("PAID",act(unknown,Action.CONFIRM_PAID).status());assertEquals("0.00",balances.balance(chef()).outstanding());
        assertTrue(balances.balance(chef()).onHold());
    }
    @Test void realNoDebitEvidenceReleasesUncertainReservationAndRetainsHold() {
        var unknown=act(authorize(),Action.MARK_UNKNOWN);assertEquals("FAILED",act(unknown,Action.CONFIRM_NOT_SENT).status());
        assertEquals(0,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_payout_allocation WHERE active",Integer.class));
        assertTrue(balances.balance(chef()).onHold());assertEquals("338.52",balances.balance(chef()).outstanding());assertEquals(2,f.count("ledger_transaction"));
    }
    @Test void returnedBankFundsRequireLinkedReversalAndRetainPaidHistory() {
        var first=paid();var reversed=act(first,Action.CONFIRM_REVERSED);assertEquals("REVERSED",reversed.status());
        assertEquals("338.52",balances.balance(chef()).outstanding());assertEquals(4,f.count("ledger_transaction"));
        assertTrue(f.jdbc.queryForObject("SELECT reversal_journal_id IS NOT NULL AND settlement_journal_id IS NOT NULL AND manual_paid_at IS NOT NULL FROM payment_schema.finance_payout_instruction WHERE id=?",Boolean.class,first.id()));
        assertThrows(RuntimeException.class,()->act(reversed,Action.CONFIRM_REVERSED));
    }
    @Test void evidenceAndChannelCannotBeRewrittenThroughSql() {
        var first=paid();assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_payout_instruction SET payout_channel='RAZORPAYX' WHERE id=?",first.id()));
        assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_payout_instruction SET manual_paid_at=now() WHERE id=?",first.id()));
        assertThrows(RuntimeException.class,()->f.jdbc.execute("DELETE FROM payment_schema.finance_manual_settlement_action"));
        assertThrows(RuntimeException.class,()->f.jdbc.execute("UPDATE payment_schema.finance_payout_allocation SET active=false"));
    }
    @Test void directSqlCannotForgePaidStatusWithoutEvidence() {
        var first=reserve();assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status='PAID',manual_version=1 WHERE id=?",first.id()));
        assertEquals("338.52",balances.balance(chef()).outstanding());
    }
    @Test void explicitOperationalHoldCannotMasqueradeAsInitialBankHold() {
        f.tx.execute(s->{balances.hold(f.admin,f.chef,new ChefPayoutService.Hold(true,"Beneficiary verification required"));return null;});
        assertTrue(manual.held(f.chef));assertThrows(RuntimeException.class,this::reserve);
    }
    @Test void unresolvedRefundIncludingDeadLetterBlocksReservationAndSubmission() {
        var reservation=reserve();
        f.jdbc.update("INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,chef_sub_order_id) VALUES (?,?,?,?,'INR','DEAD_LETTER',?)",UUID.randomUUID(),payment,"TEST-manual-refund",new BigDecimal("100.00"),f.order);
        f.tx.execute(s->{balances.hold(f.admin,f.chef,new ChefPayoutService.Hold(false,"TEST cannot bypass refund guard"));return null;});
        assertTrue(manual.held(f.chef));assertThrows(RuntimeException.class,()->act(reservation,Action.AUTHORIZE_TRANSFER));
    }
    @Test void sourceConflictBlocksEvenAfterOperatorHoldRelease() {
        f.jdbc.update("UPDATE payment_schema.finance_order_binding SET state='REVIEW_REQUIRED' WHERE chef_order_id=?",f.order);
        f.tx.execute(s->{balances.hold(f.admin,f.chef,new ChefPayoutService.Hold(false,"TEST cannot bypass source"));return null;});
        assertThrows(RuntimeException.class,this::reserve);
    }
    @Test void laterRefundHoldDoesNotPreventRecordingAlreadySentBankPayment() {
        var submitted=authorize();
        f.jdbc.update("INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,currency,status,chef_sub_order_id) VALUES (?,?,?,?,'INR','PENDING',?)",UUID.randomUUID(),payment,"TEST-late-refund",new BigDecimal("10.00"),f.order);
        assertEquals("PAID",act(submitted,Action.CONFIRM_PAID).status());assertTrue(manual.held(f.chef));
    }
    @Test void providerWorkerNeverClaimsManualInstruction() {
        var p=authorize();when(provider.ready()).thenReturn(true);
        assertNull(f.tx.execute(s->balances.claim()));
        f.tx.execute(s->{balances.recoverStaleSubmissions();return null;});assertEquals("SUBMITTING",manual.list(f.admin).getFirst().status());
        assertEquals(p.id(),manual.list(f.admin).getFirst().id());verify(provider,never()).submit(any());
    }
    @Test void wrongRoleOrOtherChefCannotReadOrReserve() {
        assertThrows(RuntimeException.class,()->manual.balance(chef(),f.chef));
        assertThrows(RuntimeException.class,()->manual.reserveAdmin(chef(),f.chef,new Reservation(UUID.randomUUID(),"338.52","TEST")));
        var other=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));assertEquals("0.00",balances.balance(other).available());
        assertThrows(RuntimeException.class,()->f.tx.execute(s->manual.reserveChef(other,new ChefPayoutService.Withdrawal(UUID.randomUUID(),"338.52"))));
    }
    @Test void policyAllowsManualAccountingWithoutRazorpayApprovalButAutomaticStillFails() {
        var policy=f.policies.current().settings();var service=new FinancePolicyService(f.jdbc,f.json,true,true,false,true);
        var manualPolicy=new FinancePolicy(policy.ledgerStartDate(),true,false,true,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0.00",false,"TEST existing classification");
        var draft=f.tx.execute(s->service.draft(f.admin,new FinancePolicyService.DraftRequest(manualPolicy,"TEST manual policy")));
        assertTrue(f.tx.execute(s->service.activate(f.admin,draft.id(),new FinancePolicyService.ActivateRequest(service.current().revision(),draft.contentHash(),"TEST approved"))).activationBlockers().isEmpty());
        var automatic=f.tx.execute(s->service.draft(f.admin,new FinancePolicyService.DraftRequest(policy,"TEST forbidden automatic")));
        assertThrows(RuntimeException.class,()->f.tx.execute(s->service.activate(f.admin,automatic.id(),new FinancePolicyService.ActivateRequest(service.current().revision(),automatic.contentHash(),"TEST"))));
    }
    @Test void statementsShowManualBankPaymentAndExactLiabilityWithoutOtherChefData() {
        var p=paid();var source=new ChefDocumentSourceController(f.jdbc,true);
        String body=source.settlements(chef(),Instant.now().minusSeconds(86400),Instant.now().plusSeconds(30),"INR","Asia/Kolkata").getBody().toString();
        assertTrue(body.contains("Craves manual"));assertTrue(body.contains(p.bankReference()));assertTrue(body.contains("Manual paid at"));assertTrue(body.contains("Closing recorded outstanding, 0.00"));
        var other=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));
        assertFalse(source.settlements(other,Instant.now().minusSeconds(86400),Instant.now().plusSeconds(30),"INR","Asia/Kolkata").getBody().toString().contains(p.id().toString()));
    }
    @Test void orphanActionCannotCommitWithoutChangingInstruction() {
        var reserved=reserve();assertThrows(RuntimeException.class,()->f.tx.execute(s->{
            f.jdbc.update("INSERT INTO payment_schema.finance_manual_settlement_action(id,instruction_id,action_key,request_hash,action,from_status,to_status,result_version,operator_id,reason,destination_reference) VALUES (?,?,?,?,'AUTHORIZE_TRANSFER','RESERVED','SUBMITTING',1,?,'TEST','TEST-destination')",UUID.randomUUID(),reserved.id(),UUID.randomUUID(),"a".repeat(64),f.admin.identityId());return null;
        }));assertEquals(0,f.count("finance_manual_settlement_action"));
    }
    @Test void disablingNewManualWorkDoesNotDisableUnknownOutcomeReconciliation() {
        var submitted=authorize();var disabled=new ManualChefSettlementService(f.jdbc,f.json,f.policies,new LedgerPostingService(f.jdbc,f.json,true),false);
        var request=change(submitted,Action.CONFIRM_PAID);
        assertEquals("PAID",f.tx.execute(s->disabled.change(f.admin,submitted.id(),request)).status());
        assertEquals("0.00",balances.balance(chef()).outstanding());assertFalse(disabled.enabled());
    }
    @Test void databaseRejectsNullEvidenceAndLeavesReservationUnchanged() {
        var reserved=reserve();assertThrows(RuntimeException.class,()->f.jdbc.update("INSERT INTO payment_schema.finance_manual_settlement_action(id,instruction_id,action_key,request_hash,action,from_status,to_status,result_version,operator_id,reason) VALUES (?,?,?,?,'AUTHORIZE_TRANSFER','RESERVED','SUBMITTING',1,?,'TEST')",UUID.randomUUID(),reserved.id(),UUID.randomUUID(),"a".repeat(64),f.admin.identityId()));
        assertEquals("RESERVED",manual.list(f.admin).getFirst().status());
    }
    @Test void journalConflictCommitsEvidenceAndKeepsReservationHeld() {
        var submitted=authorize();String key="chef-manual-payout/"+submitted.id()+"/confirmed";
        f.tx.execute(s->new LedgerPostingService(f.jdbc,f.json,true).post(new in.craves.integration.ledger.LedgerJournal.Entry(key,UUID.randomUUID(),"TEST_CONFLICT","TEST",null,null,"INR",Instant.now(),"TEST_EXISTING_CONFLICT",null,"SERVICE","TEST",List.of(
            in.craves.integration.ledger.LedgerJournal.Line.debit("BANK",new BigDecimal("1.00"),f.chef),
            in.craves.integration.ledger.LedgerJournal.Line.credit("CUSTOMER_FUNDS",new BigDecimal("1.00"),f.chef)))));
        assertEquals("SUBMITTING",act(submitted,Action.CONFIRM_PAID).status());assertEquals(1,f.count("ledger_conflict"));
        assertEquals(1,f.count("finance_manual_settlement_action"));assertTrue(manual.held(f.chef));
        assertEquals(1,f.jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_payout_allocation WHERE active",Integer.class));
    }
    @Test void paymentRecordedThisPeriodIsShownEvenWhenRequestedEarlier() {
        var submitted=authorize();Instant from=Instant.now();var confirmed=act(submitted,Action.CONFIRM_PAID);
        String body=new ChefDocumentSourceController(f.jdbc,true).settlements(chef(),from,Instant.now().plusSeconds(30),"INR","Asia/Kolkata").getBody().toString();
        assertTrue(body.contains(confirmed.id().toString()));assertTrue(body.contains(confirmed.bankReference()));
    }
}
