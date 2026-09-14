package in.craves.auth.security;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Actual PostgreSQL atomic admission tests. Never point this suite at a production DB or tunnel. */
@EnabledIfEnvironmentVariable(named="EMAIL_TEST_DB_URL",matches=".+")
@ResourceLock("disposable-email-auth-migration-schemas")
class PostgresAuthRateLimiterDbTest {
    private static final String SCHEMA="email_auth_rate_test";
    private static final String CLEAN_SCHEMA="email_auth_rate_clean_test";
    private static final Instant START=Instant.parse("2026-09-15T10:00:15Z");
    private static JdbcTemplate jdbc;
    private static DriverManagerDataSource data;
    private static Flyway flyway;
    private static UUID historicalIdentity;
    private static int upgradeMigrations;
    private MutableClock clock;
    private PostgresAuthRateLimiter limiter;

    @BeforeAll static void disposablePostgresOnly() {
        String url=System.getenv("EMAIL_TEST_DB_URL");
        assertNotNull(url);
        URI uri=URI.create(url.substring("jdbc:".length()));
        assertEquals("true",System.getenv("GITHUB_ACTIONS"),"Destructive tests require disposable GitHub CI");
        assertEquals("true",System.getenv("EMAIL_TEST_DISPOSABLE"));
        assertEquals("postgresql",uri.getScheme());
        assertTrue(List.of("localhost","127.0.0.1").contains(uri.getHost()));
        assertEquals("/craves_email_test",uri.getPath());
        assertNull(uri.getQuery());assertNull(uri.getFragment());assertNull(uri.getUserInfo());
        var admin=new JdbcTemplate(new DriverManagerDataSource(url,System.getenv("EMAIL_TEST_DB_USER"),System.getenv("EMAIL_TEST_DB_PASSWORD")));
        // V7 owns a hardcoded schema outside Flyway's configured default. Reset it only after the disposable DB guard.
        admin.execute("DROP SCHEMA IF EXISTS academy_schema CASCADE");
        resetPublicExplorerFixture(admin);
        admin.execute("DROP SCHEMA IF EXISTS "+SCHEMA+" CASCADE");
        admin.execute("CREATE SCHEMA "+SCHEMA);
        data=new DriverManagerDataSource(url+"?currentSchema="+SCHEMA,System.getenv("EMAIL_TEST_DB_USER"),System.getenv("EMAIL_TEST_DB_PASSWORD"));
        // Preserve production Auth V8, reviewed analytics V9, and email V10 before adding limiter V11.
        Flyway.configure().dataSource(data).schemas(SCHEMA).defaultSchema(SCHEMA).target("10").load().migrate();
        jdbc=new JdbcTemplate(data);
        historicalIdentity=UUID.randomUUID();
        jdbc.update("INSERT INTO auth_identity(id,firebase_uid,phone_number,email,email_verified,email_revision,email_verified_at) VALUES (?,?,?,'historical-fixture@example.test',true,3,?)",
            historicalIdentity,"historical-rate-"+historicalIdentity,"hist-"+historicalIdentity.toString().substring(0,20),Timestamp.from(START.minusSeconds(3600)));
        flyway=Flyway.configure().dataSource(data).schemas(SCHEMA).defaultSchema(SCHEMA).load();
        upgradeMigrations=flyway.migrate().migrationsExecuted;
        flyway.validate();
    }
    @BeforeEach void resetOnlyEphemeralCounters() {
        jdbc.execute("TRUNCATE TABLE auth_rate_limit_counter");
        clock=new MutableClock(START);
        limiter=limiter(120,150,3,4);
    }
    private PostgresAuthRateLimiter limiter(int exchange,int refresh,int credential,int identity) {
        return new PostgresAuthRateLimiter(jdbc,new AuthRateLimitSettings(true,"postgres",60,12,exchange,refresh,credential,identity),clock);
    }

    @Test void additiveEmailV10ToLimiterV11UpgradeAndReplayPreserveHistoricalIdentity() {
        assertEquals(1,upgradeMigrations);
        assertEquals(0,flyway.migrate().migrationsExecuted);flyway.validate();
        var identity=jdbc.queryForMap("SELECT email,email_verified,email_revision,email_verified_at FROM auth_identity WHERE id=?",historicalIdentity);
        assertEquals("historical-fixture@example.test",identity.get("email"));assertEquals(Boolean.TRUE,identity.get("email_verified"));
        assertEquals(3L,((Number)identity.get("email_revision")).longValue());
        assertEquals(START.minusSeconds(3600),((Timestamp)identity.get("email_verified_at")).toInstant());
        assertEquals(11,jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success AND version IS NOT NULL",Integer.class));
    }
    @Test void cleanLatestMigrationAndReplayCreateCounterAndExpiryIndex() {
        // This second fresh migration also executes V7; another default schema does not isolate academy_schema.
        jdbc.execute("DROP SCHEMA IF EXISTS academy_schema CASCADE");
        resetPublicExplorerFixture(jdbc);
        jdbc.execute("DROP SCHEMA IF EXISTS "+CLEAN_SCHEMA+" CASCADE");
        var clean=Flyway.configure().dataSource(data).schemas(CLEAN_SCHEMA).defaultSchema(CLEAN_SCHEMA).load();
        assertEquals(12,clean.migrate().migrationsExecuted);clean.validate();assertEquals(0,clean.migrate().migrationsExecuted);
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('"+CLEAN_SCHEMA+".auth_rate_limit_counter')::text",String.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('"+CLEAN_SCHEMA+".auth_rate_limit_expiry')::text",String.class));
        assertEquals(11,jdbc.queryForObject("SELECT count(*) FROM "+CLEAN_SCHEMA+".flyway_schema_history WHERE success AND version IS NOT NULL",Integer.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('academy_schema.learner')::text",String.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('public.admin_explorer_audit')::text",String.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('public.admin_explorer_admission')::text",String.class));
    }
    private static void resetPublicExplorerFixture(JdbcTemplate database) {
        // V9 deliberately uses public, outside the test's default schema. The caller has passed the strict disposable DB guard.
        database.execute("DROP TABLE IF EXISTS public.admin_explorer_admission CASCADE");
        database.execute("DROP TABLE IF EXISTS public.admin_explorer_audit CASCADE");
        database.execute("DROP FUNCTION IF EXISTS public.reject_admin_explorer_audit_mutation()");
    }
    @Test void concurrentGlobalAdmissionsAreExactAndOperationsRemainIndependent() throws Exception {
        limiter=limiter(7,11,3,4);
        List<Callable<Boolean>> exchange=new ArrayList<>(),refresh=new ArrayList<>();
        for(int i=0;i<64;i++){exchange.add(()->limiter.allowGlobal("exchange"));refresh.add(()->limiter.allowGlobal("refresh"));}
        assertEquals(7,concurrently(exchange));assertEquals(11,concurrently(refresh));
        assertEquals(8L,count("global:exchange"));assertEquals(12L,count("global:refresh"));
        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM auth_rate_limit_counter",Integer.class));
    }
    @Test void concurrentCredentialAdmissionsAreExactAndCountersClampAtLimitPlusOne() throws Exception {
        String token=raw("exchange");List<Callable<Boolean>> calls=new ArrayList<>();
        for(int i=0;i<64;i++)calls.add(()->limiter.allowCredential("exchange",token));
        assertEquals(3,concurrently(calls));
        assertEquals(4L,count("credential:exchange:"+new TokenHasher().sha256Base64Url(token)));
        for(int i=0;i<30;i++)assertFalse(limiter.allowCredential("exchange",token));
        assertEquals(4L,count("credential:exchange:"+new TokenHasher().sha256Base64Url(token)));
    }
    @Test void credentialOperationsAndDifferentCredentialsHaveSeparateLimits() {
        String token=raw("shared"),other=raw("other");
        for(int i=0;i<3;i++)assertTrue(limiter.allowCredential("exchange",token));
        assertFalse(limiter.allowCredential("exchange",token));
        assertTrue(limiter.allowCredential("refresh",token));assertTrue(limiter.allowCredential("exchange",other));
        assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM auth_rate_limit_counter",Integer.class));
    }
    @Test void fixedWindowBoundaryResetsAdmissionsAndRetryAfter() {
        limiter=limiter(1,1,1,1);
        assertEquals(45,limiter.retryAfterSeconds());assertTrue(limiter.allowGlobal("exchange"));assertFalse(limiter.allowGlobal("exchange"));
        var first=jdbc.queryForMap("SELECT window_start,expires_at,request_count FROM auth_rate_limit_counter WHERE bucket_key='global:exchange'");
        assertEquals(Instant.parse("2026-09-15T10:00:00Z"),((Timestamp)first.get("window_start")).toInstant());
        assertEquals(Instant.parse("2026-09-15T10:02:00Z"),((Timestamp)first.get("expires_at")).toInstant());
        clock.advance(44);assertEquals(1,limiter.retryAfterSeconds());assertFalse(limiter.allowGlobal("exchange"));
        clock.advance(1);assertEquals(60,limiter.retryAfterSeconds());assertTrue(limiter.allowGlobal("exchange"));
        assertFalse(limiter.allowGlobal("exchange"));assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM auth_rate_limit_counter WHERE bucket_key='global:exchange'",Integer.class));
    }
    @Test void multipleRefreshSessionsForOneIdentityShareOneConcurrentLimit() throws Exception {
        UUID owner=owner();List<String> tokens=new ArrayList<>();
        for(int i=0;i<8;i++){String token=raw("refresh");tokens.add(token);session(owner,token,START.plusSeconds(3600),null);}
        List<Callable<Boolean>> calls=new ArrayList<>();for(int i=0;i<48;i++){String token=tokens.get(i%tokens.size());calls.add(()->limiter.allowKnownRefreshIdentity(token));}
        assertEquals(4,concurrently(calls));
        assertEquals(5L,count("identity:refresh:"+new TokenHasher().sha256Base64Url(owner.toString())));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM auth_rate_limit_counter",Integer.class));
    }
    @Test void refreshIdentityBudgetDoesNotConsumeAnotherOwnersBudget() {
        UUID first=owner(),second=owner();String a=raw("first"),b=raw("second");
        session(first,a,START.plusSeconds(3600),null);session(second,b,START.plusSeconds(3600),null);
        for(int i=0;i<4;i++)assertTrue(limiter.allowKnownRefreshIdentity(a));assertFalse(limiter.allowKnownRefreshIdentity(a));
        assertTrue(limiter.allowKnownRefreshIdentity(b));assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM auth_rate_limit_counter",Integer.class));
    }
    @Test void unknownRevokedAndExpiredRefreshDoNotCreateIdentityBuckets() {
        UUID owner=owner();String expired=raw("expired"),revoked=raw("revoked");
        session(owner,expired,START,null);session(owner,revoked,START.plusSeconds(3600),START.minusSeconds(1));
        assertTrue(limiter.allowKnownRefreshIdentity(raw("unknown")));assertTrue(limiter.allowKnownRefreshIdentity(expired));assertTrue(limiter.allowKnownRefreshIdentity(revoked));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM auth_rate_limit_counter",Integer.class));
        // These true results are only a cost-control decision; the Auth service must still reject unusable sessions.
    }
    @Test void noRawCredentialsOrRequestMaterialArePersistedInCounters() {
        UUID owner=owner();String token=raw("secret-refresh"),exchange=raw("secret-firebase");session(owner,token,START.plusSeconds(3600),null);
        assertTrue(limiter.allowGlobal("exchange"));assertTrue(limiter.allowCredential("exchange",exchange));
        assertTrue(limiter.allowCredential("refresh",token));assertTrue(limiter.allowKnownRefreshIdentity(token));
        List<String> rows=jdbc.query("SELECT row_to_json(counter)::text FROM auth_rate_limit_counter counter",(rs,n)->rs.getString(1));
        assertEquals(4,rows.size());for(String row:rows){assertFalse(row.contains(token));assertFalse(row.contains(exchange));assertFalse(row.contains(owner.toString()));}
        Set<String> columns=Set.copyOf(jdbc.query("SELECT column_name FROM information_schema.columns WHERE table_schema=? AND table_name='auth_rate_limit_counter'",(rs,n)->rs.getString(1),SCHEMA));
        assertEquals(Set.of("bucket_key","window_start","expires_at","request_count"),columns);
    }
    @Test void cleanupDeletesAtMostFiveHundredExpiredRowsPerAdmittedBatch() {
        jdbc.batchUpdate("INSERT INTO auth_rate_limit_counter(bucket_key,window_start,expires_at,request_count) VALUES (?,?,?,1)",new BatchPreparedStatementSetter(){
            public int getBatchSize(){return 1021;}
            public void setValues(PreparedStatement statement,int i)throws SQLException{
                statement.setString(1,(i<1001?"expired:":"retained:")+i);
                statement.setTimestamp(2,Timestamp.from(START.minusSeconds(3600)));
                statement.setTimestamp(3,Timestamp.from(i<1001?START.minusSeconds(1):START.plusSeconds(600)));
            }
        });
        assertTrue(limiter.allowGlobal("exchange"));assertEquals(501,expired());
        for(int i=2;i<=50;i++)assertTrue(limiter.allowGlobal("exchange"));assertEquals(501,expired());
        assertTrue(limiter.allowGlobal("exchange"));assertEquals(1,expired());
        assertEquals(20,jdbc.queryForObject("SELECT count(*) FROM auth_rate_limit_counter WHERE bucket_key LIKE 'retained:%'",Integer.class));
        assertEquals(51L,count("global:exchange"));
    }
    @Test void invalidOperationsCannotCreateArbitraryGlobalOrCredentialBuckets() {
        assertThrows(IllegalArgumentException.class,()->limiter.allowGlobal("arbitrary"));
        assertThrows(IllegalArgumentException.class,()->limiter.allowCredential("arbitrary",raw("arbitrary")));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM auth_rate_limit_counter",Integer.class));
    }
    private int expired(){return jdbc.queryForObject("SELECT count(*) FROM auth_rate_limit_counter WHERE expires_at<=?",Integer.class,Timestamp.from(clock.instant()));}
    private long count(String key){return jdbc.queryForObject("SELECT request_count FROM auth_rate_limit_counter WHERE bucket_key=? ORDER BY window_start DESC LIMIT 1",Long.class,key);}
    private UUID owner(){UUID id=UUID.randomUUID();jdbc.update("INSERT INTO auth_identity(id,firebase_uid,phone_number) VALUES (?,?,?)",id,"rate-"+id,"rate-"+id.toString().substring(0,20));return id;}
    private void session(UUID owner,String token,Instant expires,Instant revoked){jdbc.update("INSERT INTO refresh_session(id,identity_id,refresh_token_hash,expires_at,revoked_at) VALUES (?,?,?,?,?)",UUID.randomUUID(),owner,new TokenHasher().sha256Base64Url(token),Timestamp.from(expires),revoked==null?null:Timestamp.from(revoked));}
    private static String raw(String purpose){return "synthetic-not-a-live-"+purpose+"-credential-"+UUID.randomUUID();}
    private static int concurrently(List<Callable<Boolean>> calls)throws Exception{
        try(var executor=Executors.newFixedThreadPool(12)){
            CountDownLatch start=new CountDownLatch(1);List<Future<Boolean>> results=new ArrayList<>();
            for(var call:calls)results.add(executor.submit(()->{start.await();return call.call();}));start.countDown();
            int allowed=0;for(var result:results)if(result.get(30,TimeUnit.SECONDS))allowed++;return allowed;
        }
    }
    private static final class MutableClock extends Clock {
        private Instant now;MutableClock(Instant now){this.now=now;}void advance(long seconds){now=now.plusSeconds(seconds);}
        public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return now;}
    }
}
