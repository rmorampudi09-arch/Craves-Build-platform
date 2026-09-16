package in.craves.notification.email;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;

@EnabledIfEnvironmentVariable(named="EMAIL_TEST_DB_URL",matches=".+")
class VerificationEmailReceiptDbTest {
    DriverManagerDataSource data; JdbcTemplate jdbc; VerificationEmailTransport transport; VerificationEmailService service;
    @BeforeEach void disposableDatabaseOnly() {
        String url=System.getenv("EMAIL_TEST_DB_URL");
        assertTrue("true".equals(System.getenv("GITHUB_ACTIONS")) || "true".equalsIgnoreCase(System.getenv("TF_BUILD")),"Destructive suite must run in disposable CI");
        assertEquals("true",System.getenv("EMAIL_TEST_DISPOSABLE"));
        assertTrue(url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/craves_email_test"));
        data=new DriverManagerDataSource(url,System.getenv("EMAIL_TEST_DB_USER"),System.getenv("EMAIL_TEST_DB_PASSWORD"));jdbc=new JdbcTemplate(data);
        jdbc.execute("DROP SCHEMA IF EXISTS notification_schema CASCADE");
        flyway(null).migrate(); transport=mock(VerificationEmailTransport.class); service=new VerificationEmailService(jdbc,new DataSourceTransactionManager(data),transport);
    }
    Flyway flyway(String target) {
        var config=Flyway.configure().dataSource(data).schemas("notification_schema").locations("classpath:db/migration");
        if(target!=null)config.target(target); return config.load();
    }
    @Test void cleanUpgradeReplayAndImmutableReceipts() {
        flyway(null).validate();assertEquals(0,flyway(null).migrate().migrationsExecuted);
        jdbc.execute("DROP SCHEMA notification_schema CASCADE");assertEquals(6,flyway("6").migrate().migrationsExecuted);
        assertEquals(1,flyway(null).migrate().migrationsExecuted);flyway(null).validate();assertEquals(0,flyway(null).migrate().migrationsExecuted);
        var request=request();when(transport.send(any())).thenReturn(VerificationEmailTransport.Outcome.ACCEPTED);
        assertEquals(VerificationEmailTransport.Outcome.ACCEPTED,service.deliver(request,"a".repeat(64)));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE notification_schema.auth_email_verification_receipt SET status='FAILED' WHERE challenge_id=?",request.challengeId()));
        assertThrows(RuntimeException.class,()->jdbc.update("DELETE FROM notification_schema.auth_email_verification_receipt WHERE challenge_id=?",request.challengeId()));
    }
    @Test void duplicateAcceptedAndUnavailableNeverResend() {
        for(var outcome:new VerificationEmailTransport.Outcome[]{VerificationEmailTransport.Outcome.ACCEPTED,VerificationEmailTransport.Outcome.UNAVAILABLE}) {
            var request=request(); when(transport.send(request)).thenReturn(outcome);
            assertEquals(outcome,service.deliver(request,"b".repeat(64)));assertEquals(outcome,service.deliver(request,"b".repeat(64))); verify(transport,times(1)).send(request);
        }
    }
    @Test void unknownAndCrashRemainUnknownAndCannotBlindResend() {
        var request=request();when(transport.send(request)).thenThrow(new IllegalStateException("simulated-transport-timeout"));
        assertEquals(VerificationEmailTransport.Outcome.UNKNOWN,service.deliver(request,"c".repeat(64)));
        assertEquals(VerificationEmailTransport.Outcome.UNKNOWN,service.deliver(request,"c".repeat(64)));verify(transport,times(1)).send(request);
        var orphan=request();jdbc.update("INSERT INTO notification_schema.auth_email_verification_receipt(challenge_id,identity_id,request_fingerprint,status,expires_at) VALUES (?,?,?,'UNKNOWN',?)",orphan.challengeId(),orphan.identityId(),"d".repeat(64),java.sql.Timestamp.from(orphan.expiresAt()));
        assertEquals(VerificationEmailTransport.Outcome.UNKNOWN,service.deliver(orphan,"d".repeat(64)));verify(transport,never()).send(orphan);
    }
    @Test void changedPayloadOrOwnerWithSameChallengeConflicts() {
        var request=request();when(transport.send(any())).thenReturn(VerificationEmailTransport.Outcome.ACCEPTED); service.deliver(request,"e".repeat(64));
        assertEquals(409,assertThrows(ResponseStatusException.class,()->service.deliver(request,"f".repeat(64))).getStatusCode().value());
        var other=new VerificationEmailRequest(request.challengeId(),UUID.randomUUID(),request.email(),request.code(),request.expiresAt());
        assertThrows(ResponseStatusException.class,()->service.deliver(other,"e".repeat(64)));verify(transport,times(1)).send(any());
    }
    @Test void concurrentDuplicateSubmissionsProduceOneProviderCall() throws Exception {
        var request=request();CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        when(transport.send(any())).thenAnswer(ignored->{ entered.countDown();assertTrue(release.await(5,TimeUnit.SECONDS));return VerificationEmailTransport.Outcome.ACCEPTED; });
        try(var executor=Executors.newFixedThreadPool(2)) {
            var first=executor.submit(()->service.deliver(request,"1".repeat(64)));assertTrue(entered.await(5,TimeUnit.SECONDS));
            var second=executor.submit(()->service.deliver(request,"1".repeat(64)));
            assertEquals(VerificationEmailTransport.Outcome.UNKNOWN,second.get(5,TimeUnit.SECONDS));release.countDown();
            assertEquals(VerificationEmailTransport.Outcome.ACCEPTED,first.get(5,TimeUnit.SECONDS));
        } finally { release.countDown(); }
        verify(transport,times(1)).send(request);
    }
    @Test void durableReceiptAndNormalQueueContainNoCodeBodyOrRecipient() {
        var request=request();when(transport.send(any())).thenReturn(VerificationEmailTransport.Outcome.ACCEPTED);service.deliver(request,"2".repeat(64));
        String serialized=jdbc.queryForObject("SELECT row_to_json(r)::text FROM notification_schema.auth_email_verification_receipt r WHERE challenge_id=?",String.class,request.challengeId());
        assertFalse(serialized.contains("\""+request.code()+"\""));assertFalse(serialized.contains(request.email()));assertFalse(serialized.contains("body"));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM notification_schema.notification_request",Integer.class));
    }
    private VerificationEmailRequest request() { return new VerificationEmailRequest(UUID.randomUUID(),UUID.randomUUID(),"ci-only@example.test","804729",Instant.now().truncatedTo(ChronoUnit.MICROS).plusSeconds(600)); }
}
