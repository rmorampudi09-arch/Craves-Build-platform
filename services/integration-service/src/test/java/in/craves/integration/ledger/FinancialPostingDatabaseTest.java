package in.craves.integration.ledger;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
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
class FinancialPostingDatabaseTest {
    JdbcTemplate jdbc;
    TransactionTemplate tx;
    LedgerPostingService service;
    UUID chef=UUID.fromString("00112233-4455-4677-8899-aabbccddeeff");
    static final Instant TIME=Instant.parse("2026-09-13T12:00:00Z");
    @BeforeEach void setup() throws Exception {
        String url=System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"),"Only isolated local ledger test DB is allowed");
        var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds); tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        jdbc.execute("CREATE SCHEMA payment_schema");
        String migration=new ClassPathResource("db/migration/V121__immutable_financial_journal.sql").getContentAsString(StandardCharsets.UTF_8);
        try(Connection c=ds.getConnection();var statement=c.createStatement()) { statement.execute(migration); }
        service=new LedgerPostingService(jdbc,new ObjectMapper(),true);
    }
    LedgerJournal.Entry entry(UUID event,String key,String amount) {
        return new LedgerJournal.Entry(key,event,"order-service","PAYMENT_CAPTURED",null,null,"INR",TIME,"payment/test",null,
            "SERVICE","order-service",List.of(LedgerJournal.Line.debit("GATEWAY_CLEARING",new BigDecimal(amount),chef),
                LedgerJournal.Line.credit("CUSTOMER_FUNDS",new BigDecimal(amount),chef)));
    }
    LedgerJournal.Receipt post(LedgerJournal.Entry value) { return tx.execute(status->service.post(value)); }
    long count(String table) { return jdbc.queryForObject("SELECT count(*) FROM payment_schema."+table,Long.class); }
    @Test void replayDifferentTransportIdsCreatesOneJournal() {
        var first=post(entry(UUID.randomUUID(),"payment/one","434"));
        var replay=post(entry(UUID.randomUUID(),"payment/one","434.00"));
        assertEquals(LedgerJournal.Outcome.POSTED,first.outcome()); assertEquals(LedgerJournal.Outcome.REPLAY,replay.outcome());
        assertEquals(first.transactionId(),replay.transactionId());
        assertEquals(1,count("ledger_transaction")); assertEquals(2,count("ledger_line"));
        assertEquals(2,count("ledger_event_inbox")); assertEquals(1,count("ledger_outbox"));
    }
    @Test void conflictingBusinessContextIsRecordedWithoutSecondPosting() {
        post(entry(UUID.randomUUID(),"payment/conflict","434"));
        var conflict=post(entry(UUID.randomUUID(),"payment/conflict","435"));
        assertEquals(LedgerJournal.Outcome.CONFLICT,conflict.outcome());
        assertEquals(1,count("ledger_transaction")); assertEquals(1,count("ledger_conflict"));
    }
    @Test void sourceEventCannotBeReusedForAnotherBusinessEvent() {
        UUID event=UUID.randomUUID(); post(entry(event,"payment/first","1"));
        assertEquals(LedgerJournal.Outcome.CONFLICT,post(entry(event,"payment/second","1")).outcome());
        assertEquals(1,count("ledger_transaction")); assertEquals(1,count("ledger_conflict"));
    }
    @Test void concurrentDeliveryReplaysAreIdempotent() throws Exception {
        try(var pool=Executors.newFixedThreadPool(8)) {
            List<Callable<LedgerJournal.Receipt>> tasks=new ArrayList<>();
            for(int i=0;i<16;i++) tasks.add(()->post(entry(UUID.randomUUID(),"payment/concurrent","434")));
            var results=pool.invokeAll(tasks);
            long posted=0; UUID id=null;
            for(var result:results) {
                var receipt=result.get(); if(receipt.outcome()==LedgerJournal.Outcome.POSTED) posted++;
                if(id==null) id=receipt.transactionId(); else assertEquals(id,receipt.transactionId());
            }
            assertEquals(1,posted); assertEquals(1,count("ledger_transaction")); assertEquals(16,count("ledger_event_inbox"));
        }
    }
    void rawHeader(UUID id) {
        jdbc.update("INSERT INTO payment_schema.ledger_transaction(id,business_event_key,source_event_id,source,event_type,currency,occurred_at,business_date,evidence_reference,payload_hash,actor_type,actor_id) VALUES (?,?,?,'test','TEST','INR',?,'2026-09-13','test/evidence',?,'SERVICE','test')",
            id,"raw/"+id,UUID.randomUUID(),Timestamp.from(TIME),"a".repeat(64));
    }
    void rawLine(UUID txId,int sequence,String currency,String debit,String credit) {
        jdbc.update("INSERT INTO payment_schema.ledger_line(id,transaction_id,sequence,account_code,currency,debit_amount,credit_amount) VALUES (?,?,?,'BANK',?,?,?)",
            UUID.randomUUID(),txId,sequence,currency,new BigDecimal(debit),new BigDecimal(credit));
    }
    @Test void databaseRejectsEmptyOrUnbalancedJournalAtCommit() {
        assertThrows(RuntimeException.class,()->tx.execute(status->{rawHeader(UUID.randomUUID());return null;}));
        assertThrows(RuntimeException.class,()->tx.execute(status->{UUID id=UUID.randomUUID();rawHeader(id);rawLine(id,1,"INR","10","0");rawLine(id,2,"INR","0","9");return null;}));
        assertEquals(0,count("ledger_transaction"));
    }
    @Test void databaseRejectsMixedCurrencyAndFractionalPaise() {
        assertThrows(RuntimeException.class,()->tx.execute(status->{UUID id=UUID.randomUUID();rawHeader(id);rawLine(id,1,"USD","10","0");return null;}));
        assertThrows(RuntimeException.class,()->tx.execute(status->{UUID id=UUID.randomUUID();rawHeader(id);rawLine(id,1,"INR","0.001","0");return null;}));
    }
    @Test void postedHistoryCannotBeEditedDeletedTruncatedOrExtended() {
        UUID id=post(entry(UUID.randomUUID(),"payment/immutable","434")).transactionId();
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE payment_schema.ledger_transaction SET evidence_reference='changed' WHERE id=?",id));
        assertThrows(RuntimeException.class,()->jdbc.update("DELETE FROM payment_schema.ledger_line WHERE transaction_id=?",id));
        assertThrows(RuntimeException.class,()->jdbc.execute("TRUNCATE payment_schema.ledger_line"));
        assertThrows(RuntimeException.class,()->tx.execute(status->{rawLine(id,3,"INR","1","0");rawLine(id,4,"INR","0","1");return null;}));
        assertEquals(2,count("ledger_line"));
    }
    @Test void fullReversalIsLinkedAndCanHappenOnlyOnce() {
        var original=entry(UUID.randomUUID(),"payment/original","434"); UUID id=post(original).transactionId();
        var inverse=original.lines().stream().map(l->new LedgerJournal.Line(l.accountCode(),l.currency(),l.credit(),l.debit(),
            l.chefIdentityId(),l.deliveryAttemptId(),l.providerId(),l.paymentId(),l.refundId(),l.payoutInstructionId())).toList();
        var reversal=new LedgerJournal.Entry("payment/reversal",UUID.randomUUID(),"finance","PAYMENT_REVERSAL",null,null,"INR",TIME,
            "approved/correction",id,"HUMAN",UUID.randomUUID().toString(),inverse);
        assertEquals(LedgerJournal.Outcome.POSTED,post(reversal).outcome());
        assertThrows(RuntimeException.class,()->post(new LedgerJournal.Entry("payment/reversal-again",UUID.randomUUID(),"finance","PAYMENT_REVERSAL",null,null,"INR",TIME,"approved/correction",id,"HUMAN",UUID.randomUUID().toString(),inverse)));
        assertEquals(2,count("ledger_transaction"));
    }
    @Test void disabledWriterCannotPost() {
        var disabled=new LedgerPostingService(jdbc,new ObjectMapper(),false);
        assertThrows(IllegalStateException.class,()->tx.execute(status->disabled.post(entry(UUID.randomUUID(),"payment/disabled","1"))));
        assertEquals(0,count("ledger_transaction"));
    }
}
