package in.craves.auth.email;

import static org.junit.jupiter.api.Assertions.*;
import in.craves.auth.exception.AuthException;
import in.craves.auth.security.CurrentUser;
import java.net.URI;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Real PostgreSQL transactions/concurrency; never accepts any production/tunnel configuration. */
@EnabledIfEnvironmentVariable(named="EMAIL_TEST_DB_URL", matches=".+")
@ResourceLock("disposable-email-auth-migration-schemas")
class EmailVerificationPersistenceTest {
    static JdbcTemplate jdbc;
    static DataSourceTransactionManager transactions;
    static Flyway flyway;
    static final String CODE_KEY="synthetic-auth-code-hmac-key-32-bytes";
    static final EmailVerificationSettings SETTINGS=new EmailVerificationSettings(true,CODE_KEY,
        "synthetic-notification-key-independent-32", "https://notification.example.test",true,
        "synthetic-projection-key-independent-32","https://user-chef.example.test",false);
    MutableClock clock;
    CaptureTransport transport;
    EmailVerificationService service;
    CurrentUser owner;
    @BeforeAll static void database() {
        String url=System.getenv("EMAIL_TEST_DB_URL");
        URI uri=URI.create(url.substring("jdbc:".length()));
        if (!"true".equals(System.getenv("GITHUB_ACTIONS")) || !"true".equals(System.getenv("EMAIL_TEST_DISPOSABLE")) || !"postgresql".equals(uri.getScheme()) ||
            !List.of("localhost","127.0.0.1").contains(uri.getHost()) || !"/craves_email_test".equals(uri.getPath()) ||
            uri.getQuery()!=null || uri.getUserInfo()!=null || uri.getFragment()!=null)
            throw new IllegalStateException("Only the explicitly disposable CI PostgreSQL service is allowed");
        var admin=new DriverManagerDataSource(url,System.getenv("EMAIL_TEST_DB_USER"),System.getenv("EMAIL_TEST_DB_PASSWORD"));
        // V7 owns a hardcoded schema outside Flyway's configured default. Reset it only after the disposable DB guard.
        new JdbcTemplate(admin).execute("DROP SCHEMA IF EXISTS academy_schema CASCADE");
        resetPublicExplorerFixture(new JdbcTemplate(admin));
        new JdbcTemplate(admin).execute("DROP SCHEMA IF EXISTS email_auth_test CASCADE");
        new JdbcTemplate(admin).execute("CREATE SCHEMA email_auth_test");
        var source=new DriverManagerDataSource(url+"?currentSchema=email_auth_test",System.getenv("EMAIL_TEST_DB_USER"),System.getenv("EMAIL_TEST_DB_PASSWORD"));
        // Exercise the exact previously deployed version before additive upgrade.
        Flyway.configure().dataSource(source).schemas("email_auth_test").defaultSchema("email_auth_test").target("8").load().migrate();
        jdbc=new JdbcTemplate(source);
        UUID historical=UUID.randomUUID();
        jdbc.update("INSERT INTO auth_identity(id,firebase_uid,phone_number,email,email_verified) VALUES(?,?,?,'existing@example.test',true)",
            historical,"historical-"+historical,"hist-"+historical.toString().substring(0,20));
        flyway=Flyway.configure().dataSource(source).schemas("email_auth_test").defaultSchema("email_auth_test").load();
        assertEquals(7,flyway.migrate().migrationsExecuted); // Existing four upgrades plus three additive referral migrations.
        assertEquals("existing@example.test",jdbc.queryForObject("SELECT email FROM auth_identity WHERE id=?",String.class,historical));
        assertTrue(Boolean.TRUE.equals(jdbc.queryForObject("SELECT email_verified FROM auth_identity WHERE id=?",Boolean.class,historical)));
        assertEquals(0L,jdbc.queryForObject("SELECT email_revision FROM auth_identity WHERE id=?",Long.class,historical));
        assertNull(jdbc.queryForObject("SELECT email_verified_at FROM auth_identity WHERE id=?",Timestamp.class,historical));
        assertEquals(0,flyway.migrate().migrationsExecuted);
        flyway.validate();
        transactions=new DataSourceTransactionManager(source);
    }
    @BeforeEach void setup() {
        clock=new MutableClock(Instant.parse("2026-09-15T10:00:00Z"));
        transport=new CaptureTransport();
        service=new EmailVerificationService(jdbc,transactions,SETTINGS,transport,clock);
        owner=newOwner();
    }
    CurrentUser newOwner() {
        UUID id=UUID.randomUUID();
        jdbc.update("INSERT INTO auth_identity(id,firebase_uid,phone_number) VALUES(?,?,?)",id,"synthetic-"+id,"s-"+id.toString().substring(0,25));
        return new CurrentUser(id,"synthetic-"+id,"+10000000000",List.of("CUSTOMER"),1);
    }
    String address() { return "chef-"+owner.identityId()+"@example.test"; }
    EmailVerificationState issue(String email) { return service.issue(owner,email,UUID.randomUUID()); }
    EmailVerificationState verified() {
        var state=issue(address());
        return service.verify(owner,state.pending().challengeId(),transport.code(state.pending().challengeId()));
    }
    @Test void validCodeUpdatesOnlyCanonicalOwnerAndCreatesOneImmutableProjection() {
        var issued=issue(address());
        assertNull(issued.email()); assertFalse(issued.emailVerified());
        assertEquals("ACCEPTED",issued.pending().deliveryStatus());
        UUID id=issued.pending().challengeId();
        String stored=jdbc.queryForObject("SELECT code_mac FROM auth_email_challenge WHERE id=?",String.class,id);
        assertNotEquals(transport.code(id),stored); assertEquals(64,stored.length());
        assertEquals(EmailVerificationCrypto.codeMac(CODE_KEY,owner.identityId(),address(),id,transport.code(id)),stored);
        var state=service.verify(owner,id,transport.code(id));
        assertTrue(state.emailVerified()); assertEquals(address(),state.email()); assertEquals(1,state.emailRevision()); assertNull(state.pending());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM auth_email_projection_outbox WHERE identity_id=?",Integer.class,owner.identityId()));
        assertThrows(Exception.class,()->jdbc.update("UPDATE auth_email_projection_outbox SET email='tamper@example.test' WHERE identity_id=?",owner.identityId()));
        assertThrows(Exception.class,()->jdbc.update("DELETE FROM auth_email_audit WHERE identity_id=?",owner.identityId()));
    }
    @Test void wrongAttemptsCommitAndFifthExhaustsWithoutCanonicalChange() {
        var state=issue(address()); UUID id=state.pending().challengeId();
        String wrong="000000".equals(transport.code(id))?"111111":"000000";
        for(int i=1;i<=5;i++) {
            assertEquals("EMAIL_CODE_INVALID",assertThrows(AuthException.class,()->service.verify(owner,id,wrong)).getCode());
            assertEquals(i,jdbc.queryForObject("SELECT attempts FROM auth_email_challenge WHERE id=?",Integer.class,id));
        }
        assertThrows(AuthException.class,()->service.verify(owner,id,transport.code(id)));
        assertEquals("EXHAUSTED",jdbc.queryForObject("SELECT status FROM auth_email_challenge WHERE id=?",String.class,id));
        assertNull(service.state(owner).email());
    }
    @Test void expiryBoundaryRejectsCodeAndRetainsAudit() {
        var state=issue(address()); UUID id=state.pending().challengeId();
        clock.advance(600);
        assertThrows(AuthException.class,()->service.verify(owner,id,transport.code(id)));
        assertEquals("EXPIRED",jdbc.queryForObject("SELECT status FROM auth_email_challenge WHERE id=?",String.class,id));
    }
    @Test void resendInvalidatesOldCodeAndEnforcesCooldown() {
        var first=issue(address()); UUID old=first.pending().challengeId();
        assertEquals("EMAIL_VERIFICATION_RATE_LIMITED",assertThrows(AuthException.class,()->issue(address())).getCode());
        clock.advance(60);
        var second=issue(address()); UUID fresh=second.pending().challengeId(); assertNotEquals(old,fresh);
        assertThrows(AuthException.class,()->service.verify(owner,old,transport.code(old)));
        assertTrue(service.verify(owner,fresh,transport.code(fresh)).emailVerified());
        assertEquals("SUPERSEDED",jdbc.queryForObject("SELECT status FROM auth_email_challenge WHERE id=?",String.class,old));
    }
    @Test void replayIsRejectedAndTwentyConcurrentVerifiesCommitOneSuccess() throws Exception {
        var state=issue(address()); UUID id=state.pending().challengeId(); String code=transport.code(id);
        try(var executor=Executors.newFixedThreadPool(8)) {
            List<Future<Boolean>> results=new ArrayList<>(); CountDownLatch start=new CountDownLatch(1);
            for(int i=0;i<20;i++) results.add(executor.submit(()->{start.await();try {service.verify(owner,id,code);return true;}catch(AuthException expected){return false;}}));
            start.countDown(); int successes=0; for(var result:results) if(result.get(30,TimeUnit.SECONDS)) successes++;
            assertEquals(1,successes);
        }
        assertThrows(AuthException.class,()->service.verify(owner,id,code));
        assertEquals(1L,service.state(owner).emailRevision());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM auth_email_projection_outbox WHERE identity_id=?",Integer.class,owner.identityId()));
    }
    @Test void wrongOwnerCannotReadVerifyOrConsumeAnotherOwnersChallenge() {
        var state=issue(address()); UUID id=state.pending().challengeId(); CurrentUser other=newOwner();
        assertNull(service.state(other).pending());
        assertThrows(AuthException.class,()->service.verify(other,id,transport.code(id)));
        assertEquals(0,jdbc.queryForObject("SELECT attempts FROM auth_email_challenge WHERE id=?",Integer.class,id));
        assertTrue(service.verify(owner,id,transport.code(id)).emailVerified());
    }
    @Test void resendAfterReloadUsesStoredAddressAndIsOwnedAndIdempotent() {
        var first=issue(address()); UUID old=first.pending().challengeId(); clock.advance(60);
        assertThrows(AuthException.class,()->service.resend(newOwner(),old,UUID.randomUUID()));
        UUID request=UUID.randomUUID();var second=service.resend(owner,old,request);UUID next=second.pending().challengeId();
        assertEquals(next,service.resend(owner,old,request).pending().challengeId());
        assertEquals(2,transport.codes.size());
        assertThrows(AuthException.class,()->service.verify(owner,old,transport.code(old)));
        assertTrue(service.verify(owner,next,transport.code(next)).emailVerified());
    }
    @Test void pendingReplacementKeepsExistingEmailUntilSuccessAndChangesAreBound() {
        verified(); clock.advance(60);
        var replacement=issue("replacement-"+owner.identityId()+"@example.test"); UUID old=replacement.pending().challengeId();
        assertEquals(address(),replacement.email()); assertTrue(replacement.emailVerified());
        clock.advance(60); var changed=issue("changed-"+owner.identityId()+"@example.test"); UUID next=changed.pending().challengeId();
        assertThrows(AuthException.class,()->service.verify(owner,old,transport.code(old)));
        var finalState=service.verify(owner,next,transport.code(next));
        assertEquals("changed-"+owner.identityId()+"@example.test",finalState.email()); assertEquals(2,finalState.emailRevision());
    }
    @Test void choosingCurrentVerifiedAddressCancelsPendingReplacementWithoutReverification() {
        verified(); clock.advance(60); var pending=issue("replacement-"+owner.identityId()+"@example.test");
        var state=issue(address()); assertTrue(state.emailVerified()); assertNull(state.pending());
        assertThrows(AuthException.class,()->service.verify(owner,pending.pending().challengeId(),transport.code(pending.pending().challengeId())));
    }
    @Test void duplicateIssueIsIdempotentAndDifferentMeaningConflicts() throws Exception {
        UUID request=UUID.randomUUID();
        try(var executor=Executors.newFixedThreadPool(6)) {
            var results=new ArrayList<Future<EmailVerificationState>>();
            for(int i=0;i<12;i++) results.add(executor.submit(()->service.issue(owner,address(),request)));
            UUID challenge=null;
            for(var result:results) {UUID next=result.get(30,TimeUnit.SECONDS).pending().challengeId();if(challenge==null)challenge=next;else assertEquals(challenge,next);}
        }
        assertEquals(1,transport.codes.size());
        assertEquals("EMAIL_REQUEST_CONFLICT",assertThrows(AuthException.class,()->service.issue(owner,"different@example.test",request)).getCode());
    }
    @Test void perIdentityHourlyLimitCannotBeAvoidedByChangingDestination() {
        for(int i=0;i<6;i++) {issue("chef-"+owner.identityId()+"-"+i+"@example.test");clock.advance(60);}
        assertEquals("EMAIL_VERIFICATION_RATE_LIMITED",assertThrows(AuthException.class,()->issue(address())).getCode());
        clock.advance(3600); assertNotNull(issue(address()).pending());
    }
    @Test void recipientLimitIsSerializedAcrossIndependentIdentities() throws Exception {
        String target="bounded-"+UUID.randomUUID()+"@example.test";
        List<CurrentUser> owners=new ArrayList<>(); for(int i=0;i<16;i++) owners.add(newOwner());
        try(var executor=Executors.newFixedThreadPool(8)) {
            List<Future<Boolean>> results=new ArrayList<>();
            for(CurrentUser candidate:owners) results.add(executor.submit(()->{try {service.issue(candidate,target,UUID.randomUUID());return true;}catch(AuthException expected){return false;}}));
            int issued=0;for(var result:results)if(result.get(30,TimeUnit.SECONDS))issued++;
            assertEquals(10,issued);
        }
    }
    @Test void unknownEmailOutcomeDoesNotDuplicateSendAndStillAllowsReceivedCode() {
        transport.delivery="UNKNOWN"; UUID request=UUID.randomUUID();
        var state=service.issue(owner,address(),request); assertEquals("UNKNOWN",state.pending().deliveryStatus());
        service.issue(owner,address(),request); assertEquals(1,transport.codes.size());
        assertTrue(service.verify(owner,state.pending().challengeId(),transport.code(state.pending().challengeId())).emailVerified());
    }
    @Test void inactiveAndRevokedIdentityCannotIssueOrVerify() {
        var state=issue(address());
        jdbc.update("UPDATE auth_identity SET token_version=2 WHERE id=?",owner.identityId());
        assertEquals("AUTHENTICATION_REQUIRED",assertThrows(AuthException.class,()->service.verify(owner,state.pending().challengeId(),transport.code(state.pending().challengeId()))).getCode());
        jdbc.update("UPDATE auth_identity SET status='SUSPENDED',token_version=1 WHERE id=?",owner.identityId());
        assertEquals("IDENTITY_NOT_ACTIVE",assertThrows(AuthException.class,()->service.state(owner)).getCode());
    }
    @Test void projectionWorkerRetriesAndAcknowledgesExactlySavedRevision() {
        verified();transport.projection=false;
        jdbc.update("UPDATE auth_email_projection_outbox SET delivered_at=? WHERE identity_id<>? AND delivered_at IS NULL",Timestamp.from(clock.instant()),owner.identityId());
        var worker=new EmailProjectionWorker(jdbc,transactions,SETTINGS,transport,clock);
        worker.runOnce();
        assertEquals(1,jdbc.queryForObject("SELECT attempts FROM auth_email_projection_outbox WHERE identity_id=?",Integer.class,owner.identityId()));
        assertNull(jdbc.queryForObject("SELECT delivered_at FROM auth_email_projection_outbox WHERE identity_id=?",Timestamp.class,owner.identityId()));
        clock.advance(3601);transport.projection=true;worker.runOnce();
        assertNotNull(jdbc.queryForObject("SELECT delivered_at FROM auth_email_projection_outbox WHERE identity_id=?",Timestamp.class,owner.identityId()));
        assertTrue(transport.projected.containsKey(owner.identityId()));
        assertEquals(address(),transport.projected.get(owner.identityId()));
    }
    @Test void cleanMigrationAndReplayingHaveNoSideEffects() {
        // This second fresh migration also executes V7; another default schema does not isolate academy_schema.
        jdbc.execute("DROP SCHEMA IF EXISTS academy_schema CASCADE");
        resetPublicExplorerFixture(jdbc);
        jdbc.execute("DROP SCHEMA IF EXISTS email_auth_clean_test CASCADE");
        var source=jdbc.getDataSource();
        Flyway clean=Flyway.configure().dataSource(source).schemas("email_auth_clean_test").defaultSchema("email_auth_clean_test").load();
        assertEquals(15,clean.migrate().migrationsExecuted);
        assertEquals(0,clean.migrate().migrationsExecuted);clean.validate();
        assertEquals(15,jdbc.queryForObject("SELECT count(*) FROM email_auth_clean_test.flyway_schema_history WHERE success AND version IS NOT NULL",Integer.class));
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
    static class CaptureTransport implements EmailVerificationTransport {
        final ConcurrentHashMap<UUID,String> codes=new ConcurrentHashMap<>();
        final ConcurrentHashMap<UUID,String> projected=new ConcurrentHashMap<>();
        volatile String delivery="ACCEPTED"; volatile boolean projection=true;
        public String send(UUID challenge,UUID owner,String email,String code,Instant expires) {codes.put(challenge,code);return delivery;}
        public boolean project(UUID event,UUID owner,String email,long revision,Instant verified) {if(projection)projected.put(owner,email);return projection;}
        String code(UUID id) {return codes.get(id);}
    }
    static class MutableClock extends Clock {
        volatile Instant current;
        MutableClock(Instant now){current=now;}
        void advance(long seconds){current=current.plusSeconds(seconds);}
        public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return this;}
        public Instant instant(){return current;}
    }
}
