package in.craves.integration.referrals;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.ledger.LedgerPostingService;
import in.craves.integration.referrals.transport.ReferralSourceClient;
import java.time.Instant;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ReferralFinanceConsumerDatabaseTest {
 JdbcTemplate db;ReferralFinanceConsumer consumer;ObjectMapper json=new ObjectMapper().findAndRegisterModules();
 @BeforeEach void setup(){
  String url=System.getenv("LEDGER_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
  var ds=new DriverManagerDataSource(url,System.getenv("LEDGER_TEST_DB_USER"),System.getenv("LEDGER_TEST_DB_PASSWORD"));db=new JdbcTemplate(ds);
  db.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");db.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
  Flyway.configure().dataSource(ds).schemas("payment_schema").defaultSchema("payment_schema").locations("classpath:db/migration").load().migrate();
  var manager=new DataSourceTransactionManager(ds);var ledger=new LedgerPostingService(db,json,true);var mirror=new ReferralJournalMirror(db,ledger);
  consumer=new ReferralFinanceConsumer(db,json,mock(ReferralSourceClient.class),manager,mirror);
 }
 com.fasterxml.jackson.databind.node.ObjectNode award(){return json.createObjectNode().put("journalId",1).put("userId",UUID.randomUUID().toString()).put("pendingDeltaPaise","2000").put("availableDeltaPaise","0").put("reservedDeltaPaise","0").put("counterpartyDeltaPaise","-2000").put("counterparty","UPLINE_EXPENSE").put("currency","INR").put("occurredAt",Instant.now().toString());}
 long count(String name){return db.queryForObject("SELECT count(*) FROM payment_schema."+name,Long.class);}
 @Test void duplicateFactPostsOneBalancedJournalAndNoChefPayout(){
  UUID event=UUID.randomUUID();var body=award();consumer.persist(event,"referral.journal.appended",body);consumer.persist(event,"referral.journal.appended",body);assertTrue(consumer.applyOne());assertFalse(consumer.applyOne());
  assertEquals(1,count("referral_journal_projection"));assertEquals(1,count("ledger_transaction"));assertEquals(0,db.queryForObject("SELECT count(*) FROM payment_schema.ledger_line WHERE chef_identity_id IS NOT NULL OR account_code='CHEF_PAYABLE'",Integer.class));
  assertEquals(0,new java.math.BigDecimal(db.queryForObject("SELECT (sum(debit_amount)-sum(credit_amount))::text FROM payment_schema.ledger_line",String.class)).signum());
 }
 @Test void changedReplayCannotReplaceDurableEvidence(){
  UUID event=UUID.randomUUID();var body=award();consumer.persist(event,"referral.journal.appended",body);assertThrows(IllegalStateException.class,()->consumer.persist(event,"referral.journal.appended",body.deepCopy().put("pendingDeltaPaise","3000")));
  assertEquals(1,count("referral_consumer_inbox"));assertTrue(consumer.applyOne());assertEquals(1,count("ledger_transaction"));
 }
 @Test void failedJournalRollsBackMoneyAndRetainsRetryableInbox(){
  UUID event=UUID.randomUUID();consumer.persist(event,"referral.journal.appended",award().put("pendingDeltaPaise","100"));assertTrue(consumer.applyOne());
  assertEquals(0,count("ledger_transaction"));assertEquals(0,count("referral_journal_projection"));assertEquals("RECEIVED",db.queryForObject("SELECT status FROM payment_schema.referral_consumer_inbox",String.class));assertEquals(1,db.queryForObject("SELECT attempts FROM payment_schema.referral_consumer_inbox",Integer.class));assertFalse(consumer.applyOne());
 }
 @Test void staleUnknownOrderCannotBeAttachedToUnissuedSnapshot(){
  consumer.persist(UUID.randomUUID(),"referral.order.bound",json.createObjectNode().put("chefOrderId",UUID.randomUUID().toString()).put("checkoutId",UUID.randomUUID().toString()).put("sourceSnapshotHash","a".repeat(64)));consumer.applyOne();assertEquals(0,count("referral_finance_binding"));assertEquals("RECEIVED",db.queryForObject("SELECT status FROM payment_schema.referral_consumer_inbox",String.class));
 }
 @Test void inboxAndJournalProjectionCannotBeRewritten(){
  consumer.persist(UUID.randomUUID(),"referral.journal.appended",award());consumer.applyOne();assertThrows(Exception.class,()->db.execute("UPDATE payment_schema.referral_consumer_inbox SET payload='{}'"));assertThrows(Exception.class,()->db.execute("DELETE FROM payment_schema.referral_journal_projection"));assertEquals(1,count("ledger_transaction"));
 }
}
