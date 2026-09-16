package in.craves.integration.payout;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.finance.FinancePolicy;
import in.craves.integration.ledger.LedgerJournal;
import in.craves.integration.ledger.LedgerPostingService;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Upgrade real V133 data; all financial identities below are disposable synthetic fixtures. */
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ManualSettlementMigrationDatabaseTest {
    DriverManagerDataSource ds;JdbcTemplate jdbc;TransactionTemplate tx;LedgerPostingService ledger;
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
    @BeforeEach void setup() {
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"),"Disposable CI database acknowledgement is required before schema reset");
        String url=System.getenv("LEDGER_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema").locations("classpath:db/migration").target("133").load().migrate();
        ledger=new LedgerPostingService(jdbc,json,true);
    }
    void upgrade() {
        Flyway flyway=Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema").locations("classpath:db/migration").load();
        assertEquals("133",flyway.info().current().getVersion().getVersion());
        assertEquals(List.of("134","136","137","138","139","140","141","142","143","144"),Arrays.stream(flyway.info().pending()).map(m->m.getVersion().getVersion()).toList(),
                "The combined release must test every exact source migration; this checkout has no V135");
        assertEquals(10,flyway.migrate().migrationsExecuted);
        assertEquals("144",flyway.info().current().getVersion().getVersion());
        flyway.validate();
        assertEquals(0,flyway.migrate().migrationsExecuted,"Validated release migrations must be safe to replay");
    }
    @Test void existingPaidRazorpayInstructionAndJournalsSurviveUnchanged()throws Exception {
        UUID chef=UUID.randomUUID(),beneficiary=UUID.randomUUID(),instruction=UUID.randomUUID(),order=UUID.randomUUID(),payable=UUID.randomUUID();
        Instant delivered=Instant.now().minusSeconds(180000);BigDecimal amount=new BigDecimal("100.00");
        var policy=new FinancePolicy(LocalDate.of(2026,9,14),true,true,true,48,0,60,"7","5","18","18","18",FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0.00",false,"TEST classification");
        String snapshot=json.writeValueAsString(policy);
        tx.execute(s->{
            jdbc.update("INSERT INTO payment_schema.finance_beneficiary_version(id,chef_identity_id,fund_account_id,contact_id,verification_reference,verified_by) VALUES (?,?,'fa_TEST','cont_TEST','TEST_EVIDENCE',?)",beneficiary,chef,UUID.randomUUID());
            jdbc.update("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,beneficiary_id,on_hold) VALUES (?,?,false)",chef,beneficiary);
            var journal=ledger.post(new LedgerJournal.Entry("TEST-earning/"+order,UUID.randomUUID(),"TEST","CHEF_ORDER_EARNING",null,order,"INR",delivered,"TEST",null,"SERVICE","TEST",List.of(LedgerJournal.Line.debit("CUSTOMER_FUNDS",amount,chef),LedgerJournal.Line.credit("CHEF_PAYABLE",amount,chef))));
            jdbc.update("INSERT INTO payment_schema.finance_payable(id,chef_identity_id,chef_order_id,journal_id,amount,delivered_at,automatic_due_at,manual_available_at,policy_snapshot) VALUES (?,?,?,?,?,?,?,?,CAST(? AS jsonb))",payable,chef,order,journal.transactionId(),amount,Timestamp.from(delivered),Timestamp.from(delivered.plusSeconds(172800)),Timestamp.from(delivered),snapshot);
            jdbc.update("INSERT INTO payment_schema.finance_payout_instruction(id,chef_identity_id,beneficiary_id,request_key,mode,amount,status,policy_revision) VALUES (?,?,?,?,'MANUAL',?,'RESERVED',1)",instruction,chef,beneficiary,UUID.randomUUID(),amount);
            jdbc.update("INSERT INTO payment_schema.finance_payout_allocation(instruction_id,payable_id) VALUES (?,?)",instruction,payable);
            jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status='SUBMITTING' WHERE id=?",instruction);
            var paid=ledger.post(new LedgerJournal.Entry("TEST-paid/"+instruction,UUID.randomUUID(),"TEST","CHEF_PAYOUT_CONFIRMED",null,null,"INR",Instant.now(),"TEST_BANK_EVIDENCE",null,"SERVICE","TEST",List.of(
                new LedgerJournal.Line("CHEF_PAYABLE","INR","100.00","0.00",chef,null,null,null,null,instruction),
                new LedgerJournal.Line("PAYOUT_CLEARING","INR","0.00","100.00",chef,null,null,null,null,instruction))));
            jdbc.update("UPDATE payment_schema.finance_payout_instruction SET status='PAID',provider_id='pout_TEST',provider_status='processed',transfer_reference='TEST_UTR',settlement_journal_id=? WHERE id=?",paid.transactionId(),instruction);
            return null;
        });
        String projection="SELECT id,chef_identity_id,beneficiary_id,amount,status,provider_id,provider_status,transfer_reference,settlement_journal_id,created_at FROM payment_schema.finance_payout_instruction";
        var before=jdbc.queryForList(projection);var journals=jdbc.queryForList("SELECT * FROM payment_schema.ledger_transaction ORDER BY id");
        upgrade();assertEquals(before,jdbc.queryForList(projection));assertEquals(journals,jdbc.queryForList("SELECT * FROM payment_schema.ledger_transaction ORDER BY id"));
        assertEquals("RAZORPAYX",jdbc.queryForObject("SELECT payout_channel FROM payment_schema.finance_payout_instruction",String.class));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_manual_settlement_action",Integer.class));
        assertThrows(RuntimeException.class,()->jdbc.execute("UPDATE payment_schema.finance_payout_allocation SET active=false"));
    }
    @Test void onlyUnauditedOriginalSystemHoldGetsSeparateBankRequirementKind() {
        UUID initial=UUID.randomUUID(),explicit=UUID.randomUUID(),refund=UUID.randomUUID();
        for(UUID chef:List.of(initial,explicit))jdbc.update("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,hold_reason) VALUES (?,'Beneficiary verification required')",chef);
        jdbc.update("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,hold_reason) VALUES (?,'Unresolved refund')",refund);
        jdbc.update("INSERT INTO payment_schema.finance_payout_audit(id,chef_identity_id,action,actor,evidence_reference) VALUES (?,?,'HOLD','TEST','TEST_EXPLICIT_HOLD')",UUID.randomUUID(),explicit);
        upgrade();
        assertEquals("BANK_REQUIREMENT",jdbc.queryForObject("SELECT hold_kind FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=?",String.class,initial));
        for(UUID chef:List.of(explicit,refund))assertEquals("OPERATIONAL",jdbc.queryForObject("SELECT hold_kind FROM payment_schema.finance_chef_payout_control WHERE chef_identity_id=?",String.class,chef));
        assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM payment_schema.finance_chef_payout_control WHERE on_hold",Integer.class));
    }
}
