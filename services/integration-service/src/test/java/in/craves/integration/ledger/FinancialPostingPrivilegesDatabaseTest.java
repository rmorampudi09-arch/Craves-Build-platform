package in.craves.integration.ledger;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class FinancialPostingPrivilegesDatabaseTest {
    JdbcTemplate jdbc;TransactionTemplate tx;LedgerPostingService service;
    @BeforeEach void setup() throws Exception {
        String url=System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");jdbc.execute("CREATE SCHEMA payment_schema");
        for(String file:List.of("V105__chef_financial_ledger.sql","V121__immutable_financial_journal.sql",
            "V122__chef_settlement_history_controls.sql","V123__ledger_posting_role_guard.sql")) {
            String sql=new ClassPathResource("db/migration/"+file).getContentAsString(StandardCharsets.UTF_8);
            try(Connection c=ds.getConnection();var statement=c.createStatement()){statement.execute(sql);}
        }
        jdbc.execute("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ledger_test_poster') THEN CREATE ROLE ledger_test_poster NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END $$");
        jdbc.execute("GRANT USAGE ON SCHEMA payment_schema TO ledger_test_poster");
        jdbc.execute("GRANT SELECT ON payment_schema.ledger_account TO ledger_test_poster");
        jdbc.execute("GRANT SELECT,INSERT ON payment_schema.ledger_transaction,payment_schema.ledger_line,payment_schema.ledger_event_inbox,payment_schema.ledger_outbox,payment_schema.ledger_conflict TO ledger_test_poster");
        service=new LedgerPostingService(jdbc,new ObjectMapper(),true);
    }
    LedgerJournal.Entry entry() {
        return new LedgerJournal.Entry("role-test/"+UUID.randomUUID(),UUID.randomUUID(),"test","CAPTURE",null,null,"INR",
            Instant.parse("2026-09-13T12:00:00Z"),"test/evidence",null,"SERVICE","test",
            List.of(LedgerJournal.Line.debit("GATEWAY_CLEARING",new BigDecimal("434.00"),null),
                LedgerJournal.Line.credit("CUSTOMER_FUNDS",new BigDecimal("434.00"),null)));
    }
    @Test void insertOnlyApplicationRoleCanPostAndReplayBalancedJournal() {
        var entry=entry();
        var first=tx.execute(status->{jdbc.execute("SET LOCAL ROLE ledger_test_poster");return service.post(entry);});
        assertEquals(LedgerJournal.Outcome.POSTED,first.outcome());
        var replay=tx.execute(status->{jdbc.execute("SET LOCAL ROLE ledger_test_poster");return service.post(entry);});
        assertEquals(LedgerJournal.Outcome.REPLAY,replay.outcome());
        assertEquals(first.transactionId(),replay.transactionId());
    }
    @Test void ordinaryPostingRoleHasNoHistoryMutationPermission() {
        var receipt=tx.execute(status->{jdbc.execute("SET LOCAL ROLE ledger_test_poster");return service.post(entry());});
        for(String sql:List.of("UPDATE payment_schema.ledger_transaction SET evidence_reference='changed'",
            "DELETE FROM payment_schema.ledger_line","TRUNCATE payment_schema.ledger_line")) {
            assertThrows(RuntimeException.class,()->tx.execute(status->{jdbc.execute("SET LOCAL ROLE ledger_test_poster");jdbc.execute(sql);return null;}));
        }
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM payment_schema.ledger_line WHERE transaction_id=?",Integer.class,receipt.transactionId()));
    }
    @Test void callerCannotForgeHeaderCreationTransactionMarker() {
        tx.execute(status->{
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO payment_schema.ledger_transaction(id,business_event_key,source_event_id,source,event_type,currency,occurred_at,business_date,evidence_reference,payload_hash,actor_type,actor_id,created_in_tx) VALUES (?,?,?,'test','TEST','INR',now(),CURRENT_DATE,'test/evidence',?,'SERVICE','test',-1)",
                id,"stamp/"+id,UUID.randomUUID(),"a".repeat(64));
            assertEquals(jdbc.queryForObject("SELECT txid_current()",Long.class),jdbc.queryForObject("SELECT created_in_tx FROM payment_schema.ledger_transaction WHERE id=?",Long.class,id));
            status.setRollbackOnly();return null;
        });
    }
}
