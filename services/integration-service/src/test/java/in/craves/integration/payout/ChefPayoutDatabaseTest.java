package in.craves.integration.payout;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.finance.FinancePolicyService;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
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
class ChefPayoutDatabaseTest {
    JdbcTemplate jdbc;TransactionTemplate tx;ChefPayoutService service;LedgerPostingService ledger;
    FinancePolicyService policies;RazorpayXPayoutClient provider;
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
    final CravesPrincipal chef=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));
    final CravesPrincipal admin=new CravesPrincipal(UUID.randomUUID(),"",Set.of("PAYMENTS_ADMIN"));
    final FinancePolicy policy=new FinancePolicy(LocalDate.of(2026,9,14),true,true,true,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0",true,"TEST-TAX-CONTEXT");
    @BeforeEach void setup() {
        String url=System.getenv("LEDGER_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema").locations("classpath:db/migration").load().migrate();
        policies=mock(FinancePolicyService.class);provider=mock(RazorpayXPayoutClient.class);when(provider.ready()).thenReturn(true);
        when(policies.current()).thenReturn(new FinancePolicyService.View(1,UUID.randomUUID(),policy,List.of(),"TEST_ONLY",1));
        ledger=new LedgerPostingService(jdbc,json,true);service=new ChefPayoutService(jdbc,json,policies,ledger,provider);
        tx.execute(s->{service.bindVerifiedBeneficiary(admin,chef.identityId(),new ChefPayoutService.Binding("fa_testchef","cont_testchef","TEST_BANK_OWNERSHIP","Test beneficiary"));service.hold(admin,chef.identityId(),new ChefPayoutService.Hold(false,"Test release"));return null;});
    }
    UUID earning(Instant delivered) {
        UUID order=UUID.randomUUID();
        tx.execute(s->{
            var journal=ledger.post(new LedgerJournal.Entry("chef-order/"+order+"/earning",UUID.randomUUID(),"test-authoritative-order","CHEF_ORDER_EARNING",UUID.randomUUID(),order,"INR",delivered,"test/binding-snapshot",null,"SERVICE","test-finalizer",
                List.of(LedgerJournal.Line.debit("CUSTOMER_FUNDS",new BigDecimal("343.17"),chef.identityId()),LedgerJournal.Line.credit("CHEF_PAYABLE",new BigDecimal("343.17"),chef.identityId()))));
            service.recordDeliveredPayable(chef.identityId(),order,journal.transactionId(),delivered,policy);return null;
        });return order;
    }
    ChefPayoutService.Payout withdraw(UUID key,String amount) {return tx.execute(s->service.withdraw(chef,new ChefPayoutService.Withdrawal(key,amount)));}
    ChefPayoutService.Work claim() {return tx.execute(s->service.claim());}
    long count(String table) {return jdbc.queryForObject("SELECT count(*) FROM payment_schema."+table,Long.class);}
    @Test void manualWithdrawalBefore48HoursQueuesExactlyAvailableBalance() {
        earning(Instant.now().minusSeconds(30));assertTrue(service.dueChefs().isEmpty());
        var payout=withdraw(UUID.randomUUID(),"343.17");assertEquals("RESERVED",payout.status());assertEquals("343.17",payout.amount());
        assertEquals("0.00",service.balance(chef).available());assertTrue(service.balance(chef).manualRequestUsedToday());
        verify(provider,never()).submit(any());
    }
    @Test void retrySameKeyIsIdempotentAndChangedAmountConflicts() {
        earning(Instant.now().minusSeconds(30));UUID key=UUID.randomUUID();var first=withdraw(key,"343.17");
        assertEquals(first.id(),withdraw(key,"343.17").id());assertEquals(1,count("finance_payout_instruction"));
        assertThrows(RuntimeException.class,()->withdraw(key,"300"));
    }
    @Test void secondManualRequestSameIstDayFailsEvenWhenNewEarningsArrive() {
        earning(Instant.now().minusSeconds(30));withdraw(UUID.randomUUID(),"343.17");earning(Instant.now().minusSeconds(20));
        assertThrows(RuntimeException.class,()->withdraw(UUID.randomUUID(),"343.17"));
        assertEquals(1,count("finance_manual_withdrawal_day"));
    }
    @Test void staleExpectedBalanceCannotReserveMoreOrLess() {
        earning(Instant.now().minusSeconds(30));assertThrows(RuntimeException.class,()->withdraw(UUID.randomUUID(),"343.16"));
        assertEquals(0,count("finance_payout_instruction"));assertEquals(0,count("finance_manual_withdrawal_day"));
    }
    @Test void automaticPayoutMaturesAfter48HoursAndDoesNotUseManualQuota() {
        earning(Instant.now().minusSeconds(172801));assertEquals(List.of(chef.identityId()),service.dueChefs());
        tx.execute(s->{service.reserveAutomatic(chef.identityId());return null;});
        assertEquals(1,count("finance_payout_instruction"));assertEquals(0,count("finance_manual_withdrawal_day"));
        assertEquals("AUTOMATIC",service.balance(chef).recentPayouts().getFirst().mode());
    }
    @Test void simultaneousManualRequestsReserveOnlyOnce() throws Exception {
        earning(Instant.now().minusSeconds(30));
        Callable<Boolean> action=()->{try{withdraw(UUID.randomUUID(),"343.17");return true;}catch(RuntimeException expected){return false;}};
        try(var pool=Executors.newFixedThreadPool(8)) {
            long succeeded=0;for(var result:pool.invokeAll(java.util.Collections.nCopies(8,action)))if(result.get())succeeded++;
            assertEquals(1,succeeded);
        }
        assertEquals(1,count("finance_payout_allocation"));
    }
    @Test void automaticAndManualReservationRaceCannotDoublePay() throws Exception {
        earning(Instant.now().minusSeconds(172801));
        Callable<Boolean> manual=()->{try{withdraw(UUID.randomUUID(),"343.17");return true;}catch(RuntimeException expected){return false;}};
        Callable<Boolean> automatic=()->{tx.execute(s->{service.reserveAutomatic(chef.identityId());return null;});return true;};
        try(var pool=Executors.newFixedThreadPool(2)){for(var result:pool.invokeAll(List.of(manual,automatic)))result.get();}
        assertEquals(1,count("finance_payout_instruction"));assertEquals(1,count("finance_payout_allocation"));
    }
    @Test void unknownPayoutCannotBeReissuedAndKeepsReservation() {
        earning(Instant.now().minusSeconds(30));withdraw(UUID.randomUUID(),"343.17");var work=claim();assertNotNull(work);
        tx.execute(s->{service.uncertain(work);return null;});assertNull(claim());
        assertEquals("REVIEW_REQUIRED",service.balance(chef).recentPayouts().getFirst().status());assertEquals("0.00",service.balance(chef).available());
        assertEquals("343.17",service.balance(chef).outstanding());
    }
    @Test void confirmedSuccessPostsOnceAndNeverBecomesSpendableAgain() {
        earning(Instant.now().minusSeconds(30));withdraw(UUID.randomUUID(),"343.17");var work=claim();
        var receipt=new RazorpayXPayoutClient.Receipt("pout_success","processed","TEST_UTR");
        tx.execute(s->{service.recordOutcome(work,receipt);return null;});
        tx.execute(s->{service.recordOutcome(work,receipt);return null;});
        assertEquals("0.00",service.balance(chef).outstanding());assertEquals("0.00",service.balance(chef).available());
        assertEquals(2,count("ledger_transaction"));assertEquals("PAID",service.balance(chef).recentPayouts().getFirst().status());
        assertThrows(RuntimeException.class,()->jdbc.execute("UPDATE payment_schema.finance_payout_allocation SET active=false"));
    }
    @Test void confirmedFailureReleasesReservationButHoldsChefAndKeepsDailyQuota() {
        earning(Instant.now().minusSeconds(30));withdraw(UUID.randomUUID(),"343.17");var work=claim();
        tx.execute(s->{service.recordOutcome(work,new RazorpayXPayoutClient.Receipt("pout_failed","failed",null));return null;});
        assertTrue(service.balance(chef).onHold());assertEquals("343.17",service.balance(chef).outstanding());assertEquals("0.00",service.balance(chef).available());
        assertTrue(service.balance(chef).manualRequestUsedToday());assertEquals(1,count("ledger_transaction"));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_payout_allocation WHERE active",Integer.class));
    }
    @Test void beneficiaryChangeDoesNotRewriteAnExistingInstruction() {
        earning(Instant.now().minusSeconds(30));var payout=withdraw(UUID.randomUUID(),"343.17");
        UUID original=jdbc.queryForObject("SELECT beneficiary_id FROM payment_schema.finance_payout_instruction WHERE id=?",UUID.class,payout.id());
        tx.execute(s->{service.bindVerifiedBeneficiary(admin,chef.identityId(),new ChefPayoutService.Binding("fa_newchef","cont_newchef","TEST_UPDATED_BANK","Test change"));return null;});
        assertTrue(service.balance(chef).onHold());assertNull(claim());
        assertEquals(original,jdbc.queryForObject("SELECT beneficiary_id FROM payment_schema.finance_payout_instruction WHERE id=?",UUID.class,payout.id()));
    }
    @Test void databaseRejectsUnallocatedInstructionAndMoneyMutation() {
        earning(Instant.now().minusSeconds(30));var payout=withdraw(UUID.randomUUID(),"343.17");
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.finance_payout_instruction SET amount=1 WHERE id=?",payout.id()));
        assertThrows(RuntimeException.class,()->tx.execute(s->{jdbc.update("INSERT INTO payment_schema.finance_payout_instruction(id,chef_identity_id,beneficiary_id,request_key,mode,amount,status,policy_revision) SELECT ?,chef_identity_id,beneficiary_id,?,'MANUAL',1,'RESERVED',1 FROM payment_schema.finance_payout_instruction WHERE id=?",UUID.randomUUID(),UUID.randomUUID(),payout.id());return null;}));
    }
    @Test void otherChefSeesNoBalanceAndCannotReuseRequestToReadAnotherChef() {
        earning(Instant.now().minusSeconds(30));UUID key=UUID.randomUUID();withdraw(key,"343.17");
        var other=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));assertEquals("0.00",service.balance(other).available());assertTrue(service.balance(other).recentPayouts().isEmpty());
        assertThrows(RuntimeException.class,()->tx.execute(s->service.withdraw(other,new ChefPayoutService.Withdrawal(key,"343.17"))));
        assertThrows(RuntimeException.class,()->service.balance(new CravesPrincipal(chef.identityId(),"",Set.of("CUSTOMER"))));
    }
    @Test void crashedSubmissionIsHeldInsteadOfRepeatingPost() {
        earning(Instant.now().minusSeconds(30));withdraw(UUID.randomUUID(),"343.17");var work=claim();
        jdbc.update("UPDATE payment_schema.finance_payout_instruction SET lease_until=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(10)),work.id());
        tx.execute(s->{service.recoverStaleSubmissions();return null;});assertNull(claim());
        assertEquals("REVIEW_REQUIRED",service.balance(chef).recentPayouts().getFirst().status());
    }
}
