package in.craves.integration.payout;

import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class FinanceRecoveryDatabaseTest {
    ChefPayoutDatabaseTest f;FinancePayoutReconciliationService recovery;ChefPayoutService.Payout payout;
    @BeforeEach void setup() {
        f=new ChefPayoutDatabaseTest();f.setup();f.earning(Instant.now().minusSeconds(30));payout=f.withdraw(UUID.randomUUID(),"343.17");
        recovery=new FinancePayoutReconciliationService(f.jdbc,f.provider,f.service,f.ledger,new DataSourceTransactionManager(f.jdbc.getDataSource()));
    }
    FinancePayoutReconciliationService.Request request() {return new FinancePayoutReconciliationService.Request("pout_original","Provider dashboard and bank evidence reviewed");}
    void providerState(String state) {when(f.provider.fetch(any())).thenReturn(new RazorpayXPayoutClient.Receipt("pout_original",state,"TEST_UTR"));}
    void uncertain() {var work=f.claim();f.tx.execute(s->{f.service.uncertain(work);return null;});}
    void paid() {var work=f.claim();f.tx.execute(s->{f.service.recordOutcome(work,new RazorpayXPayoutClient.Receipt("pout_original","processed","TEST_UTR"));return null;});}
    @Test void lostProviderIdRecoversWithGetAndNeverPostsAnotherPayout() {
        uncertain();providerState("processed");var result=recovery.reconcile(f.admin,payout.id(),request());
        assertEquals("PAID",result.status());assertEquals("0.00",f.service.balance(f.chef).outstanding());
        assertEquals(2,f.count("ledger_transaction"));assertEquals(1,f.count("finance_payout_instruction"));verify(f.provider,never()).submit(any());
    }
    @Test void repeatedReconciliationPreservesPaidJournal() {
        uncertain();providerState("processed");recovery.reconcile(f.admin,payout.id(),request());recovery.reconcile(f.admin,payout.id(),request());
        assertEquals(2,f.count("ledger_transaction"));assertEquals(1,f.count("finance_payout_instruction"));
    }
    @Test void paidReversalCreatesLinkedJournalAndKeepsChefHeld() {
        paid();UUID original=f.jdbc.queryForObject("SELECT settlement_journal_id FROM payment_schema.finance_payout_instruction WHERE id=?",UUID.class,payout.id());
        providerState("reversed");assertEquals("REVERSED",recovery.reconcile(f.admin,payout.id(),request()).status());
        assertEquals("343.17",f.service.balance(f.chef).outstanding());assertEquals("0.00",f.service.balance(f.chef).available());assertTrue(f.service.balance(f.chef).onHold());
        assertEquals(original,f.jdbc.queryForObject("SELECT settlement_journal_id FROM payment_schema.finance_payout_instruction WHERE id=?",UUID.class,payout.id()));
        assertEquals(original,f.jdbc.queryForObject("SELECT t.reversal_of FROM payment_schema.ledger_transaction t JOIN payment_schema.finance_payout_instruction i ON i.reversal_journal_id=t.id WHERE i.id=?",UUID.class,payout.id()));
        recovery.reconcile(f.admin,payout.id(),request());assertEquals(3,f.count("ledger_transaction"));verify(f.provider,never()).submit(any());
    }
    @Test void stillActiveSubmissionCannotBeOverriddenByAnAdmin() {
        f.claim();providerState("processed");assertThrows(RuntimeException.class,()->recovery.reconcile(f.admin,payout.id(),request()));
        assertEquals(1,f.count("ledger_transaction"));assertEquals("SUBMITTING",f.service.balance(f.chef).recentPayouts().getFirst().status());
    }
    @Test void chefCannotUseFinanceRecoveryAndReservedInstructionCannotBeAttached() {
        assertThrows(RuntimeException.class,()->recovery.reconcile(f.chef,payout.id(),request()));
        assertThrows(RuntimeException.class,()->recovery.reconcile(f.admin,payout.id(),request()));verify(f.provider,never()).fetch(any());
    }
    @Test void rawStateChangeCannotInventAPaidTransferOrReleaseIt() {
        assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status='PAID',provider_id='pout_forged',provider_status='processed' WHERE id=?",payout.id()));
        paid();assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status='REVERSED',provider_status='reversed' WHERE id=?",payout.id()));
        assertThrows(RuntimeException.class,()->f.jdbc.update("UPDATE payment_schema.finance_payout_instruction SET settlement_journal_id=NULL WHERE id=?",payout.id()));
        assertEquals("PAID",f.service.balance(f.chef).recentPayouts().getFirst().status());
    }
    @Test void differentChefCannotUseTheOriginalBeneficiary() {
        assertThrows(RuntimeException.class,()->f.jdbc.update("INSERT INTO payment_schema.finance_payout_instruction(id,chef_identity_id,beneficiary_id,request_key,mode,amount,status,policy_revision) SELECT ?,?,beneficiary_id,?,'MANUAL',amount,'RESERVED',1 FROM payment_schema.finance_payout_instruction WHERE id=?",UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),payout.id()));
    }
    @Test void rawPayableCannotReuseAJournalForAnotherOrder() {
        assertThrows(RuntimeException.class,()->f.jdbc.update("INSERT INTO payment_schema.finance_payable(id,chef_identity_id,chef_order_id,journal_id,amount,delivered_at,automatic_due_at,manual_available_at,policy_snapshot) SELECT ?,chef_identity_id,?,journal_id,amount,delivered_at,automatic_due_at,manual_available_at,policy_snapshot FROM payment_schema.finance_payable LIMIT 1",UUID.randomUUID(),UUID.randomUUID()));
    }
    @Test void failureReconciliationPreservesOutstandingAndDailyQuota() {
        uncertain();providerState("failed");assertEquals("FAILED",recovery.reconcile(f.admin,payout.id(),request()).status());
        assertEquals("343.17",f.service.balance(f.chef).outstanding());assertTrue(f.service.balance(f.chef).manualRequestUsedToday());assertTrue(f.service.balance(f.chef).onHold());
        assertEquals(1,f.count("ledger_transaction"));
    }
    @Test void enabledCutoverCannotBeMovedThroughOffOnSequence() {
        var policies=new FinancePolicyService(f.jdbc,f.json,true,true,true);
        var enabled=f.policy;
        var first=f.tx.execute(s->policies.draft(f.admin,new FinancePolicyService.DraftRequest(enabled,"Test initial activation")));
        f.tx.execute(s->policies.activate(f.admin,first.id(),new FinancePolicyService.ActivateRequest(0,first.contentHash(),"Test first start")));
        var disabled=new FinancePolicy(LocalDate.of(2026,9,14),false,false,false,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0",true,"TEST-ONLY");
        var off=f.tx.execute(s->policies.draft(f.admin,new FinancePolicyService.DraftRequest(disabled,"Test disable")));
        f.tx.execute(s->policies.activate(f.admin,off.id(),new FinancePolicyService.ActivateRequest(1,off.contentHash(),"Test stop")));
        var moved=new FinancePolicy(LocalDate.of(2026,9,15),false,false,false,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0",true,"TEST-ONLY");
        var invalid=f.tx.execute(s->policies.draft(f.admin,new FinancePolicyService.DraftRequest(moved,"Test invalid date")));
        assertThrows(RuntimeException.class,()->f.tx.execute(s->policies.activate(f.admin,invalid.id(),new FinancePolicyService.ActivateRequest(2,invalid.contentHash(),"Cannot rewrite historical scope"))));
        assertEquals(LocalDate.of(2026,9,14),policies.current().settings().ledgerStartDate());
    }
}
