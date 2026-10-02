package in.craves.auth.centralotp;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.UserRecord;
import com.sun.net.httpserver.HttpServer;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.exception.AuthException;
import in.craves.auth.msg91.Msg91Properties;
import in.craves.auth.repository.AuthIdentityRepository;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class CentralOtpTest {
    private JdbcTemplate db;
    private CentralOtpStore store;
    private final String phone = "+919876543210";

    @BeforeAll static void database() {
        var db = new JdbcTemplate(new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:55447/postgres", "postgres", ""));
        if (db.queryForObject("SELECT count(*) FROM pg_database WHERE datname='central_otp_test'", Integer.class) == 0) {
            db.execute("CREATE DATABASE central_otp_test");
        }
    }

    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:55447/central_otp_test", "postgres", "");
        db = new JdbcTemplate(source);
        db.execute("DROP TABLE IF EXISTS auth_phone_otp, auth_phone_otp_limits");
        db.execute(Files.readString(Path.of("src/main/resources/db/migration/V19__centralized_phone_otp.sql")));
        store = new CentralOtpStore(db, new DataSourceTransactionManager(source));
    }
    void cooldown() { db.update("UPDATE auth_phone_otp SET resend_at=0"); }
    CentralOtpStore.Claim sent() {
        var claim = store.send(phone, null); assertTrue(store.finish(claim, "ACTIVE")); return claim;
    }
    @Test void consumesExactlyOnceAndStoresOnlyHashedChallenge() {
        var sent = sent();
        assertNotEquals(sent.challenge(), db.queryForObject("SELECT challenge_hash FROM auth_phone_otp", String.class));
        var proof = store.verify(sent.challenge());
        assertTrue(store.finish(proof, "CONSUMED"));
        assertFalse(store.finish(proof, "CONSUMED"));
        assertThrows(AuthException.class, () -> store.verify(sent.challenge()));
    }
    @Test void committedSendLeaseExcludesConcurrentSendAndVerify() {
        var sending = store.send(phone, null);
        assertEquals("OTP_BUSY", assertThrows(AuthException.class, () -> store.send(phone, null)).getCode());
        assertThrows(AuthException.class, () -> store.verify(sending.challenge()));
    }
    @Test void replacementInvalidatesOldChallengeEvenWhenSmsFails() {
        var old = sent(); cooldown(); var next = store.send(phone, old.challenge());
        assertThrows(AuthException.class, () -> store.verify(old.challenge()));
        assertTrue(store.finish(next, "FAILED"));
        assertThrows(AuthException.class, () -> store.verify(next.challenge()));
        assertThrows(AuthException.class, () -> store.verify(old.challenge()));
    }
    @Test void verifiesOnlyCurrentGenerationEvenAfterAStalledWorkerReturns() {
        var old = sent(); var verifying = store.verify(old.challenge());
        db.update("UPDATE auth_phone_otp SET lease_until=0,resend_at=0");
        var next = store.send(phone, null);
        assertFalse(store.finish(verifying, "CONSUMED"));
        assertTrue(store.finish(next, "ACTIVE"));
    }
    @Test void wrongCodesCanBeCorrectedButFiveAttemptsInvalidateChallenge() {
        var sent = sent();
        for (int i=0;i<5;i++) { var claim = store.verify(sent.challenge()); assertTrue(store.finish(claim, "ACTIVE")); }
        assertThrows(AuthException.class, () -> store.verify(sent.challenge()));
    }
    @Test void twoResendsAndSharedPhoneHourlyLimitAreEnforced() {
        var first = sent(); cooldown();
        var second = store.send(phone, first.challenge()); store.finish(second, "ACTIVE"); cooldown();
        var third = store.send(phone, second.challenge()); store.finish(third, "ACTIVE"); cooldown();
        assertEquals("OTP_RESEND_LIMIT", assertThrows(AuthException.class,
                () -> store.send(phone, third.challenge())).getCode());
        for(int i=0;i<2;i++) { cooldown(); var next=store.send(phone,null); store.finish(next,"ACTIVE"); }
        cooldown();
        assertEquals("OTP_RATE_LIMIT", assertThrows(AuthException.class, () -> store.send(phone,null)).getCode());
    }
    @Test void rejectsExpiredUnknownAndDuplicateConcurrentVerification() throws Exception {
        var sent = sent();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> { try { return store.verify(sent.challenge()); } catch(AuthException error) { return null; } });
            var b = executor.submit(() -> { try { return store.verify(sent.challenge()); } catch(AuthException error) { return null; } });
            assertEquals(1, (a.get()!=null?1:0)+(b.get()!=null?1:0));
        }
        db.update("UPDATE auth_phone_otp SET lease_until=0,expires_at=0");
        assertThrows(AuthException.class, () -> store.verify(sent.challenge()));
        assertThrows(AuthException.class, () -> store.verify("x".repeat(43)));
    }
    @Test void globalWalletSendBudgetRejectsBeforeProviderWork() {
        db.update("INSERT INTO auth_phone_otp_limits VALUES ('global',?,100)", System.currentTimeMillis()/60000);
        assertEquals("OTP_RATE_LIMIT", assertThrows(AuthException.class, () -> store.send(phone,null)).getCode());
    }
    @Test void controllerNeverIssuesIdentityForWrongOrStaleProviderProof() {
        var provider=mock(CentralOtpProvider.class); var identity=mock(CentralOtpIdentity.class);
        var controller=new CentralOtpController(store,provider,identity,true);
        var sent=controller.send(new CentralOtpController.SendRequest("9876543210","91",null)).getBody();
        doThrow(AuthException.badRequest("OTP_INVALID","Incorrect code")).when(provider).verify(phone,"000000");
        assertThrows(AuthException.class, () -> controller.verify(new CentralOtpController.VerifyRequest(sent.challengeId(),"000000")));
        verifyNoInteractions(identity);
        when(identity.issue(phone)).thenReturn("custom-token");
        assertEquals("custom-token",controller.verify(new CentralOtpController.VerifyRequest(sent.challengeId(),"123456")).getBody().firebaseCustomToken());
        assertThrows(AuthException.class, () -> controller.verify(new CentralOtpController.VerifyRequest(sent.challengeId(),"123456")));
        verify(identity,times(1)).issue(phone);
    }
    @Test void disabledFeatureNeverSendsOrTouchesIdentity() {
        var provider=mock(CentralOtpProvider.class); var identity=mock(CentralOtpIdentity.class);
        var controller=new CentralOtpController(store,provider,identity,false);
        assertThrows(AuthException.class, () -> controller.send(new CentralOtpController.SendRequest("9876543210","91",null)));
        verifyNoInteractions(provider,identity);
    }
    @Test void identityPreservesUidAndRejectsInactiveDisabledAndMismatchedAccounts() throws Exception {
        var repository=mock(AuthIdentityRepository.class); var firebase=mock(FirebaseAuth.class);
        var identity=mock(AuthIdentity.class); var user=mock(UserRecord.class);
        when(repository.findByPhoneNumber(phone)).thenReturn(Optional.of(identity));
        when(identity.getStatus()).thenReturn("ACTIVE"); when(identity.getFirebaseUid()).thenReturn("existing-uid");
        when(firebase.getUserByPhoneNumber(phone)).thenReturn(user);
        when(user.getPhoneNumber()).thenReturn(phone); when(user.getUid()).thenReturn("existing-uid");
        when(firebase.createCustomToken("existing-uid")).thenReturn("custom-token");
        var bridge=new CentralOtpIdentity(repository,firebase);
        assertEquals("custom-token",bridge.issue(phone));
        when(user.getUid()).thenReturn("wrong-uid");
        assertEquals("PHONE_IDENTITY_MISMATCH",assertThrows(AuthException.class, () -> bridge.issue(phone)).getCode());
        when(user.isDisabled()).thenReturn(true);
        assertEquals("IDENTITY_INACTIVE",assertThrows(AuthException.class, () -> bridge.issue(phone)).getCode());
        when(identity.getStatus()).thenReturn("INACTIVE");
        assertEquals("IDENTITY_INACTIVE",assertThrows(AuthException.class, () -> bridge.issue(phone)).getCode());
        verify(firebase,times(1)).createCustomToken(anyString());
        verify(firebase,never()).createUser(any());
    }
    @Test void providerUsesHeaderSecretExactTemplateAndFailsClosedOnHttp200Errors() throws Exception {
        var response=new AtomicReference<>("{\"type\":\"success\",\"request_id\":\"test-send-id\"}");
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/v5/otp", exchange -> {
            assertEquals("synthetic-test-key",exchange.getRequestHeaders().getFirst("authkey"));
            String query=exchange.getRequestURI().getRawQuery();
            assertFalse(query.contains("authkey")); assertTrue(query.contains("mobile=919876543210"));
            byte[] bytes=response.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        }); server.start();
        try {
            var provider=new CentralOtpProvider(new Msg91Properties(true,"synthetic-test-key"),
                    "6abe727541deb95f6d0b7192",URI.create("http://127.0.0.1:"+server.getAddress().getPort()));
            provider.send(phone);
            response.set("{\"type\":\"error\",\"message\":\"private account diagnostic\"}");
            assertEquals("OTP_UNAVAILABLE",assertThrows(AuthException.class, () -> provider.send(phone)).getCode());
            response.set("{\"type\":\"error\",\"message\":\"OTP not match\"}");
            assertEquals("OTP_INVALID",assertThrows(AuthException.class, () -> provider.verify(phone,"000000")).getCode());
            response.set("{\"type\":\"success\",\"message\":\"OTP verified success\"}"); provider.verify(phone,"123456");
            response.set("{\"type\":\"success\",\"message\":\"Already verified\"}");
            assertThrows(AuthException.class, () -> provider.verify(phone,"123456"));
            response.set("x".repeat(8193)); assertThrows(AuthException.class, () -> provider.send(phone));
        } finally { server.stop(0); }
    }
}
