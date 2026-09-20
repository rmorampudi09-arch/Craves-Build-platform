package in.craves.auth.referrals;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.referrals.transport.ReferralOutbox;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="REFERRAL_OWNER_TEST_JDBC_URL",matches=".+")
class ReferralEnrollmentDatabaseTest {
 JdbcTemplate db;TransactionTemplate tx;ReferralEnrollment enrollment;ObjectMapper json=new ObjectMapper();
 @BeforeEach void setup()throws Exception{
  String url=System.getenv("REFERRAL_OWNER_TEST_JDBC_URL");assertTrue(url.matches("jdbc:postgresql://(localhost|127[.]0[.]0[.]1):[0-9]+/referral_owner_test"));assertEquals("YES_DISPOSABLE_REFERRAL_TEST_ONLY",System.getenv("REFERRAL_TEST_CONFIRM"));
  var ds=new DriverManagerDataSource(url+"?currentSchema=referral_auth_test",System.getenv("REFERRAL_TEST_DB_USER"),System.getenv("REFERRAL_TEST_DB_PASSWORD"));db=new JdbcTemplate(ds);
  db.execute("DROP SCHEMA IF EXISTS referral_auth_test CASCADE");db.execute("CREATE SCHEMA referral_auth_test");
  for(String migration:new String[]{"V1__auth_schema.sql","V12__referral_source_outbox.sql","V13__referral_enrollment.sql","V14__referral_account_status.sql"})try(var in=getClass().getResourceAsStream("/db/migration/"+migration)){assertNotNull(in);db.execute(new String(in.readAllBytes(),StandardCharsets.UTF_8));}
  tx=new TransactionTemplate(new DataSourceTransactionManager(ds));var outbox=new ReferralOutbox(db,json,tx);
  enrollment=new ReferralEnrollment(db,json,outbox,"TEST_ONLY_TERMS",Base64.getEncoder().encodeToString("a".repeat(32).getBytes()),Base64.getEncoder().encodeToString("b".repeat(32).getBytes()),false);
 }
 AuthIdentity identity(){var id=UUID.randomUUID();var at=Instant.parse("2026-09-15T00:00:00Z");var result=new AuthIdentity(id.toString(),"+919876543210");ReflectionTestUtils.setField(result,"id",id);ReflectionTestUtils.setField(result,"createdAt",at);db.update("INSERT INTO auth_identity(id,firebase_uid,phone_number,created_at) VALUES(?,?,?,?)",id,id.toString(),result.getPhoneNumber(),java.sql.Timestamp.from(at));return result;}
 long count(String name){return db.queryForObject("SELECT count(*) FROM "+name,Long.class);}
 @Test void explicitConsentCreatesOnePrivacyPreservingDurableEnrollment()throws Exception{
  var user=identity();var consent=new ReferralSignup(null,"TEST_ONLY_TERMS",true);tx.executeWithoutResult(s->enrollment.signup(user,consent));tx.executeWithoutResult(s->enrollment.signup(user,consent));
  assertEquals(1,count("referral_enrollment"));assertEquals(1,count("referral_source_outbox"));String text=db.queryForObject("SELECT envelope FROM referral_source_outbox",String.class);assertFalse(text.contains(user.getPhoneNumber()));assertEquals(64,json.readTree(text).path("payload").path("contactHash").asText().length());assertEquals(user.getCreatedAt().toString(),json.readTree(text).path("payload").path("registeredAt").asText());
 }
 @Test void absentOrOldConsentProducesNoReferralEffect(){
  var user=identity();tx.executeWithoutResult(s->enrollment.signup(user,null));assertThrows(RuntimeException.class,()->tx.executeWithoutResult(s->enrollment.signup(user,new ReferralSignup(null,"OLD_TERMS",true))));assertThrows(RuntimeException.class,()->tx.executeWithoutResult(s->enrollment.signup(user,new ReferralSignup(null,"TEST_ONLY_TERMS",false))));assertEquals(0,count("referral_enrollment"));assertEquals(0,count("referral_source_outbox"));
 }
 @Test void originalAccountFailureRollsBackEnrollmentAndEvent(){
  assertThrows(IllegalStateException.class,()->tx.executeWithoutResult(s->{var user=identity();enrollment.signup(user,new ReferralSignup(null,"TEST_ONLY_TERMS",true));throw new IllegalStateException("rollback source");}));assertEquals(0,count("auth_identity"));assertEquals(0,count("referral_enrollment"));assertEquals(0,count("referral_source_outbox"));
 }
 @Test void accountStatusEventsAreVersionedAndRolledBackWithSource(){
  var user=identity();tx.executeWithoutResult(s->enrollment.signup(user,new ReferralSignup(null,"TEST_ONLY_TERMS",true)));
  db.update("UPDATE auth_identity SET status='SUSPENDED',updated_at=now() WHERE id=?",user.getId());assertEquals(2,count("referral_source_outbox"));db.update("UPDATE auth_identity SET status='SUSPENDED',updated_at=now() WHERE id=?",user.getId());assertEquals(2,count("referral_source_outbox"));
  assertThrows(IllegalStateException.class,()->tx.executeWithoutResult(s->{db.update("UPDATE auth_identity SET status='ACTIVE' WHERE id=?",user.getId());throw new IllegalStateException("rollback");}));assertEquals(2,count("referral_source_outbox"));assertEquals(2,db.queryForObject("SELECT source_version FROM referral_account_state",Integer.class));
 }
 @Test void storedParentAndConsentCannotBeRewritten(){var user=identity();tx.executeWithoutResult(s->enrollment.signup(user,new ReferralSignup(null,"TEST_ONLY_TERMS",true)));assertThrows(Exception.class,()->db.execute("UPDATE referral_enrollment SET terms_version='OTHER'"));assertThrows(Exception.class,()->db.execute("DELETE FROM referral_enrollment"));}
}
