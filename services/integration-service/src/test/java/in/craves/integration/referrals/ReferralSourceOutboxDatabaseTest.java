package in.craves.integration.referrals;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.referrals.transport.ReferralOutbox;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Uses only a named loopback disposable database, never a service runtime database. */
@EnabledIfEnvironmentVariable(named="REFERRAL_OWNER_TEST_JDBC_URL",matches=".+")
class ReferralSourceOutboxDatabaseTest {
 JdbcTemplate db;TransactionTemplate tx;ReferralOutbox outbox;ObjectMapper json=new ObjectMapper();
 UUID user=UUID.randomUUID();Instant at=Instant.parse("2026-09-15T10:00:00Z");
 @BeforeEach void setup() throws Exception {
  String url=System.getenv("REFERRAL_OWNER_TEST_JDBC_URL");
  assertEquals("YES_DISPOSABLE_REFERRAL_TEST_ONLY",System.getenv("REFERRAL_TEST_CONFIRM"));
  assertTrue(url.matches("jdbc:postgresql://(localhost|127[.]0[.]0[.]1):[0-9]+/referral_owner_test"));
  var ds=new DriverManagerDataSource(url,System.getenv("REFERRAL_TEST_DB_USER"),System.getenv("REFERRAL_TEST_DB_PASSWORD"));
  db=new JdbcTemplate(ds);assertEquals("referral_owner_test",db.queryForObject("SELECT current_database()",String.class));
  db.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");db.execute("CREATE SCHEMA payment_schema");
  try(var in=getClass().getResourceAsStream("/db/migration/V137__referral_source_outbox.sql")){assertNotNull(in);db.execute(new String(in.readAllBytes(),StandardCharsets.UTF_8));}
  tx=new TransactionTemplate(new DataSourceTransactionManager(ds));outbox=new ReferralOutbox(db,json,tx);
 }
 UUID enqueue(String key){return tx.execute(s->outbox.enqueue(key,"account.registered",user,at,json.createObjectNode().put("userId",user.toString())));}
 long count(){return db.queryForObject("SELECT count(*) FROM payment_schema.referral_source_outbox",Long.class);}
 String status(UUID id){return db.queryForObject("SELECT status FROM payment_schema.referral_source_outbox WHERE event_id=?",String.class,id);}
 @Test void requiresOwnerTransactionAndRollsBackTogether(){
  assertThrows(IllegalStateException.class,()->outbox.enqueue("a","account.registered",user,at,json.createObjectNode()));
  assertThrows(IllegalStateException.class,()->tx.execute(s->{enqueue("a");throw new IllegalStateException("source rollback");}));assertEquals(0,count());
 }
 @Test void replayPreservesIdentityAndRejectsChangedContent(){
  UUID id=enqueue("a");assertEquals(id,enqueue("a"));assertEquals(1,count());
  assertThrows(IllegalStateException.class,()->tx.execute(s->outbox.enqueue("a","account.registered",user,at,json.createObjectNode().put("different",true))));assertEquals(1,count());
 }
 @Test void persistedPayloadCannotBeChangedOrDeleted(){
  UUID id=enqueue("a");assertThrows(Exception.class,()->db.update("UPDATE payment_schema.referral_source_outbox SET envelope='{}' WHERE event_id=?",id));
  assertThrows(Exception.class,()->db.update("DELETE FROM payment_schema.referral_source_outbox WHERE event_id=?",id));
  assertThrows(Exception.class,()->db.execute("TRUNCATE payment_schema.referral_source_outbox"));assertEquals(1,count());
 }
 @Test void staleLeaseCannotAcknowledgeNewOwner(){
  UUID id=enqueue("a");var first=outbox.claim();assertNotNull(first);assertNull(outbox.claim());
  db.update("UPDATE payment_schema.referral_source_outbox SET lease_until=now()-interval '1 second' WHERE event_id=?",id);
  var second=outbox.claim();assertNotEquals(first.lease(),second.lease());assertEquals(first.envelope(),second.envelope());
  var receipt=json.createObjectNode().put("accepted",true).put("eventId",id.toString()).put("status","RECEIVED");
  outbox.acknowledge(first,receipt);assertEquals("SENDING",status(id));outbox.acknowledge(second,receipt);assertEquals("RECEIVED",status(id));
 }
 @Test void arbitraryAcceptedResponseDoesNotLoseEvent(){
  UUID id=enqueue("a");var work=outbox.claim();
  assertThrows(IllegalStateException.class,()->outbox.acknowledge(work,json.createObjectNode().put("accepted",true).put("eventId",UUID.randomUUID().toString()).put("status","RECEIVED")));
  outbox.failed(work,false);assertEquals("PENDING",status(id));assertNull(outbox.claim());
 }
 @Test void rejectionIsDeadAndExhaustedCrashIsRecovered(){
  UUID a=enqueue("a");outbox.failed(outbox.claim(),true);assertEquals("DEAD",status(a));
  UUID b=enqueue("b");outbox.claim();db.update("UPDATE payment_schema.referral_source_outbox SET attempts=40,lease_until=now()-interval '1 second' WHERE event_id=?",b);
  assertNull(outbox.claim());assertEquals("DEAD",status(b));
 }
 @Test void concurrentEnqueueAndClaimsHaveOneOwner() throws Exception {
  try(var pool=Executors.newFixedThreadPool(8)){
   var tasks=new java.util.ArrayList<Future<UUID>>();for(int n=0;n<8;n++)tasks.add(pool.submit(()->enqueue("same")));
   UUID id=tasks.getFirst().get(10,TimeUnit.SECONDS);for(var task:tasks)assertEquals(id,task.get(10,TimeUnit.SECONDS));assertEquals(1,count());
   var claims=new java.util.ArrayList<Future<ReferralOutbox.Work>>();for(int n=0;n<8;n++)claims.add(pool.submit(outbox::claim));
   int claimed=0;for(var task:claims)if(task.get(10,TimeUnit.SECONDS)!=null)claimed++;assertEquals(1,claimed);
  }
 }
}
