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
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;

// Needs a disposable PostgreSQL server, e.g. CENTRAL_OTP_TEST_DB=jdbc:postgresql://127.0.0.1:55447.
// The test creates and resets its own database, central_otp_test, on that server.
@EnabledIfEnvironmentVariable(named = "CENTRAL_OTP_TEST_DB", matches = "jdbc:postgresql://.+")
class CentralOtpTest {
    private static final String SERVER = System.getenv("CENTRAL_OTP_TEST_DB");
    private static final String USER = System.getenv().getOrDefault("CENTRAL_OTP_TEST_DB_USER", "postgres");
    private static final String PASSWORD = System.getenv().getOrDefault("CENTRAL_OTP_TEST_DB_PASSWORD", "");
    private static final CentralOtpCaller.Caller NOBODY = new CentralOtpCaller.Caller(null, false, null);
    private JdbcTemplate db;
    private CentralOtpStore store;
    private final String phone = "+919876543210";

    @BeforeAll static void database() {
        var db = new JdbcTemplate(new DriverManagerDataSource(SERVER + "/postgres", USER, PASSWORD));
        if (db.queryForObject("SELECT count(*) FROM pg_database WHERE datname='central_otp_test'", Integer.class) == 0) {
            db.execute("CREATE DATABASE central_otp_test");
        }
    }

    @BeforeEach void setup() throws Exception {
        var source = new DriverManagerDataSource(SERVER + "/central_otp_test", USER, PASSWORD);
        db = new JdbcTemplate(source);
        db.execute("DROP TABLE IF EXISTS auth_phone_otp, auth_phone_otp_limits");
        db.execute(Files.readString(Path.of("src/main/resources/db/migration/V19__centralized_phone_otp.sql")));
        store = new CentralOtpStore(db, new DataSourceTransactionManager(source));
    }
    void cooldown() { db.update("UPDATE auth_phone_otp SET resend_at=0"); }
    CentralOtpStore.Claim sent() {
        var claim = store.send(phone, null, NOBODY); assertTrue(store.finish(claim, "ACTIVE")); return claim;
    }
    int count(String scope) {
        return db.queryForObject("SELECT coalesce(sum(count),0) FROM auth_phone_otp_limits WHERE scope=?", Integer.class, scope);
    }
    static MockHttpServletRequest from(String... headers) {
        var request = new MockHttpServletRequest();
        for (int i = 0; i < headers.length; i += 2) { request.addHeader(headers[i], headers[i + 1]); }
        return request;
    }
    @Test void consumesExactlyOnceAndStoresOnlyHashedChallenge() {
        var sent = sent();
        assertNotEquals(sent.challenge(), db.queryForObject("SELECT challenge_hash FROM auth_phone_otp", String.class));
        var proof = store.verify(sent.challenge(), NOBODY);
        assertTrue(store.finish(proof, "CONSUMED"));
        assertFalse(store.finish(proof, "CONSUMED"));
        assertThrows(AuthException.class, () -> store.verify(sent.challenge(), NOBODY));
    }
    @Test void committedSendLeaseExcludesConcurrentSendAndVerify() {
        var sending = store.send(phone, null, NOBODY);
        assertEquals("OTP_BUSY", assertThrows(AuthException.class, () -> store.send(phone, null, NOBODY)).getCode());
        assertThrows(AuthException.class, () -> store.verify(sending.challenge(), NOBODY));
    }
    @Test void replacementInvalidatesOldChallengeEvenWhenSmsFails() {
        var old = sent(); cooldown(); var next = store.send(phone, old.challenge(), NOBODY);
        assertThrows(AuthException.class, () -> store.verify(old.challenge(), NOBODY));
        assertTrue(store.finish(next, "FAILED"));
        assertThrows(AuthException.class, () -> store.verify(next.challenge(), NOBODY));
        assertThrows(AuthException.class, () -> store.verify(old.challenge(), NOBODY));
    }
    @Test void verifiesOnlyCurrentGenerationEvenAfterAStalledWorkerReturns() {
        var old = sent(); var verifying = store.verify(old.challenge(), NOBODY);
        db.update("UPDATE auth_phone_otp SET lease_until=0,resend_at=0");
        var next = store.send(phone, null, NOBODY);
        assertFalse(store.finish(verifying, "CONSUMED"));
        assertTrue(store.finish(next, "ACTIVE"));
    }
    @Test void wrongCodesCanBeCorrectedButFiveAttemptsInvalidateChallenge() {
        var sent = sent();
        for (int i=0;i<5;i++) { var claim = store.verify(sent.challenge(), NOBODY); assertTrue(store.finish(claim, "ACTIVE")); }
        assertThrows(AuthException.class, () -> store.verify(sent.challenge(), NOBODY));
    }
    @Test void aResendKeepsTheFailedTriesAndCodesLiveTenMinutes() {
        var sent = sent();
        for (int i=0;i<4;i++) { var claim = store.verify(sent.challenge(), NOBODY); assertTrue(store.finish(claim, "ACTIVE")); }
        cooldown();
        long before = System.currentTimeMillis();
        var next = store.send(phone, sent.challenge(), NOBODY);
        long after = System.currentTimeMillis();
        assertTrue(store.finish(next, "ACTIVE"));
        assertTrue(next.expiresAt() >= before + 600_000 && next.expiresAt() <= after + 600_000, "codes live 10 minutes");
        var fifth = store.verify(next.challenge(), NOBODY); assertTrue(store.finish(fifth, "ACTIVE"));
        assertThrows(AuthException.class, () -> store.verify(next.challenge(), NOBODY), "a resend keeps the 4 failed tries: the 5th ends it");
        cooldown();
        assertEquals("OTP_RESTART", assertThrows(AuthException.class, () -> store.send(phone, next.challenge(), NOBODY)).getCode());
    }
    @Test void twoResendsAndSharedPhoneHourlyLimitAreEnforced() {
        var first = sent(); cooldown();
        var second = store.send(phone, first.challenge(), NOBODY); store.finish(second, "ACTIVE"); cooldown();
        var third = store.send(phone, second.challenge(), NOBODY); store.finish(third, "ACTIVE"); cooldown();
        assertEquals("OTP_RESEND_LIMIT", assertThrows(AuthException.class,
                () -> store.send(phone, third.challenge(), NOBODY)).getCode());
        for(int i=0;i<2;i++) { cooldown(); var next=store.send(phone,null,NOBODY); store.finish(next,"ACTIVE"); }
        cooldown();
        assertEquals("OTP_RATE_LIMIT", assertThrows(AuthException.class, () -> store.send(phone,null,NOBODY)).getCode());
    }
    @Test void rejectsExpiredUnknownAndDuplicateConcurrentVerification() throws Exception {
        var sent = sent();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(() -> { try { return store.verify(sent.challenge(), NOBODY); } catch(AuthException error) { return null; } });
            var b = executor.submit(() -> { try { return store.verify(sent.challenge(), NOBODY); } catch(AuthException error) { return null; } });
            assertEquals(1, (a.get()!=null?1:0)+(b.get()!=null?1:0));
        }
        db.update("UPDATE auth_phone_otp SET lease_until=0,expires_at=0");
        assertThrows(AuthException.class, () -> store.verify(sent.challenge(), NOBODY));
        assertThrows(AuthException.class, () -> store.verify("x".repeat(43), NOBODY));
    }
    @Test void globalWalletSendBudgetRejectsBeforeProviderWork() {
        db.update("INSERT INTO auth_phone_otp_limits VALUES ('global',?,100)", System.currentTimeMillis()/60000);
        assertEquals("OTP_RATE_LIMIT", assertThrows(AuthException.class, () -> store.send(phone,null,NOBODY)).getCode());
    }
    @Test void eachIpAndInstallHasItsOwnHourlySendBucketSoAScriptCannotSpendEveryonesBudget() {
        var script = new CentralOtpCaller.Caller("cb007107", false, null);
        for (int i = 0; i < 20; i++) { assertTrue(store.finish(store.send("+9190000000" + (10 + i), null, script), "ACTIVE")); }
        assertEquals("OTP_RATE_LIMIT", assertThrows(AuthException.class, () -> store.send("+919000000099", null, script)).getCode());
        // The refusal added to no bucket, and another address still gets its code.
        assertEquals(20, count("ip:" + CentralOtpStore.hash("cb007107")));
        assertEquals(20, count("global"));
        assertTrue(store.finish(store.send("+919000000099", null, new CentralOtpCaller.Caller("cb007108", false, null)), "ACTIVE"));
        var app = new CentralOtpCaller.Caller(null, false, "a1b2c3d4e5f60718");
        for (int i = 0; i < 10; i++) { assertTrue(store.finish(store.send("+9191000000" + (10 + i), null, app), "ACTIVE")); }
        assertEquals("OTP_RATE_LIMIT", assertThrows(AuthException.class, () -> store.send("+919100000099", null, app)).getCode());
        assertEquals(10, count("install:" + CentralOtpStore.hash("a1b2c3d4e5f60718")));
        assertEquals(31, count("global"));
        // Hourly buckets, so the cleanup that runs with each send removes them after 48 hours.
        long hour = System.currentTimeMillis() / 3600000;
        db.update("INSERT INTO auth_phone_otp_limits VALUES ('ip:old',?,1),('vinst:old',?,1)", hour - 49, hour - 49);
        sent();
        assertEquals(0, count("ip:old") + count("vinst:old"));
    }
    @Test void verifyBucketsCountEachCheckAndARefusedCheckUsesNoTry() {
        var sent = sent();
        long hour = System.currentTimeMillis() / 3600000;
        db.update("INSERT INTO auth_phone_otp_limits VALUES (?,?,60),(?,?,30)", "vip:" + CentralOtpStore.hash("cb007107"), hour,
                "vinst:" + CentralOtpStore.hash("a1b2c3d4e5f60718"), hour);
        for (var full : List.of(new CentralOtpCaller.Caller("cb007107", false, null),
                new CentralOtpCaller.Caller(null, false, "a1b2c3d4e5f60718"))) {
            assertEquals("OTP_RATE_LIMIT", assertThrows(AuthException.class, () -> store.verify(sent.challenge(), full)).getCode());
        }
        assertEquals(0, db.queryForObject("SELECT attempts FROM auth_phone_otp", Integer.class), "refused checks use none of the 5 tries");
        assertEquals(60, count("vip:" + CentralOtpStore.hash("cb007107")));
        var other = new CentralOtpCaller.Caller("cb007108", false, "a1b2c3d4e5f60719");
        assertTrue(store.finish(store.verify(sent.challenge(), other), "ACTIVE"));
        assertEquals(1, db.queryForObject("SELECT attempts FROM auth_phone_otp", Integer.class));
        assertEquals(1, count("vip:" + CentralOtpStore.hash("cb007108")) * count("vinst:" + CentralOtpStore.hash("a1b2c3d4e5f60719")));
    }
    @Test void callerAddressComesOnlyFromTheEdgeHeaderOrWhatTheWebServerForwards() {
        // Unset (the default): no address, so no per-IP limit; the install still counts.
        assertEquals(new CentralOtpCaller.Caller(null, false, "a1b2c3d4e5f60718"), new CentralOtpCaller("", "").of(
                from("X-Azure-SocketIP", "203.0.113.7", "X-Craves-Installation-Id", "a1b2c3d4e5f60718")));
        var callers = new CentralOtpCaller("X-Azure-SocketIP", " 20.198.84.102 , 2001:db8::5");
        // A phone: its own address; an X-Craves-Client-Ip it sends is ignored.
        assertEquals(new CentralOtpCaller.Caller("cb007107", false, null),
                callers.of(from("X-Azure-SocketIP", "203.0.113.7", "X-Craves-Client-Ip", "198.51.100.1")));
        // The web server: the browser's address it forwards, and never its own one bucket.
        assertEquals(new CentralOtpCaller.Caller("c6336401", true, null),
                callers.of(from("X-Azure-SocketIP", "20.198.84.102", "X-Craves-Client-Ip", "198.51.100.1")));
        assertEquals(new CentralOtpCaller.Caller(null, true, null), callers.of(from("X-Azure-SocketIP", "20.198.84.102")));
        assertEquals(new CentralOtpCaller.Caller(null, true, null),
                callers.of(from("X-Azure-SocketIP", "2001:db8:0:0:0:0:0:5", "X-Craves-Client-Ip", "web.example")));
        // Literal addresses only, never a name to look up; IPv4-mapped is the IPv4 address; IPv6 counts per /64.
        for (String bad : List.of("localhost", "example.com", "1.2.3.4, 5.6.7.8", "01.2.3.4", "1.2.3", "fe80::1%eth0", "[::1]", "")) {
            assertNull(callers.of(from("X-Azure-SocketIP", bad)).ip(), bad);
        }
        assertEquals("cb007107", callers.of(from("X-Azure-SocketIP", "::ffff:203.0.113.7")).ip());
        assertEquals("20010db800010002" + "0".repeat(16), callers.of(from("X-Azure-SocketIP", "2001:db8:1:2:aaaa::1")).ip());
        assertEquals("20010db800010002" + "0".repeat(16), callers.of(from("X-Azure-SocketIP", "2001:db8:1:2::bbbb")).ip());
        for (String bad : List.of("short", "has space1", "x".repeat(129), "android/id/1")) {
            assertNull(callers.of(from("X-Craves-Installation-Id", bad)).install(), bad);
        }
        // A typo stops the start, instead of putting every web sign-in in the web server's one bucket.
        assertThrows(IllegalArgumentException.class, () -> new CentralOtpCaller("X-Azure-SocketIP", "20.198.84.102,web-1"));
        assertThrows(IllegalArgumentException.class, () -> new CentralOtpCaller("X Azure ClientIP", ""));
        // So does the header without the web server's addresses: every web sign-in would share its one bucket.
        assertTrue(assertThrows(IllegalStateException.class, () -> new CentralOtpCaller("X-Azure-SocketIP", " , "))
                .getMessage().contains("CRAVES_CENTRAL_OTP_FORWARDING_IPS"));
    }
    @Test void controllerCountsTheCallersBucketsAndOnlyARiderSendAsksForTheRiderTemplate() {
        var provider=mock(CentralOtpProvider.class); var identity=mock(CentralOtpIdentity.class);
        when(provider.send(phone,true)).thenReturn(true);
        var controller=new CentralOtpController(store,provider,identity,new CentralOtpCaller("X-Azure-SocketIP","20.198.84.102"),true);
        var web=controller.send(new CentralOtpController.SendRequest("9876543210","91",null),
                from("X-Azure-SocketIP","203.0.113.7","X-Craves-Installation-Id","a1b2c3d4e5f60718")).getBody();
        assertFalse(web.autoRead()); verify(provider).send(phone,false);
        assertEquals(1, count("ip:"+CentralOtpStore.hash("cb007107"))*count("install:"+CentralOtpStore.hash("a1b2c3d4e5f60718")));
        controller.verify(new CentralOtpController.VerifyRequest(web.challengeId(),"123456"),
                from("X-Azure-SocketIP","203.0.113.7","X-Craves-Installation-Id","a1b2c3d4e5f60718"));
        assertEquals(1, count("vip:"+CentralOtpStore.hash("cb007107"))*count("vinst:"+CentralOtpStore.hash("a1b2c3d4e5f60718")));
        cooldown();
        var rider=controller.send(new CentralOtpController.SendRequest("9876543210","91",null),from("X-Craves-App","rider")).getBody();
        assertTrue(rider.autoRead()); verify(provider).send(phone,true);
    }
    @Test void riderSignInsUseTheRiderTemplateOnlyOnceItIsSet() throws Exception {
        var templates=new CopyOnWriteArrayList<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/v5/otp", exchange -> {
            templates.add(exchange.getRequestURI().getRawQuery().replaceAll(".*template_id=([^&]*).*","$1"));
            byte[] bytes="{\"type\":\"success\",\"request_id\":\"test-send-id\"}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        }); server.start();
        try {
            var base=URI.create("http://127.0.0.1:"+server.getAddress().getPort());
            var keys=new Msg91Properties(true,"synthetic-test-key");
            var provider=new CentralOtpProvider(keys,"6abe727541deb95f6d0b7192","7bcd8386529dfc06a7e1c8a3",base);
            assertTrue(provider.send(phone,true));
            assertFalse(provider.send(phone,false));
            // Unset (the default) or not a template ID: riders get the usual template, read with one tap.
            assertFalse(new CentralOtpProvider(keys,"6abe727541deb95f6d0b7192",base).send(phone,true));
            assertFalse(new CentralOtpProvider(keys,"6abe727541deb95f6d0b7192","not-a-template",base).send(phone,true));
            assertEquals(List.of("7bcd8386529dfc06a7e1c8a3","6abe727541deb95f6d0b7192","6abe727541deb95f6d0b7192",
                    "6abe727541deb95f6d0b7192"),templates);
        } finally { server.stop(0); }
    }
    @Test void controllerNeverIssuesIdentityForWrongOrStaleProviderProof() {
        var provider=mock(CentralOtpProvider.class); var identity=mock(CentralOtpIdentity.class);
        var controller=new CentralOtpController(store,provider,identity,new CentralOtpCaller("",""),true);
        var sent=controller.send(new CentralOtpController.SendRequest("9876543210","91",null),from()).getBody();
        doThrow(AuthException.badRequest("OTP_INVALID","Incorrect code")).when(provider).verify(phone,"000000");
        assertThrows(AuthException.class, () -> controller.verify(new CentralOtpController.VerifyRequest(sent.challengeId(),"000000"),from()));
        verifyNoInteractions(identity);
        when(identity.issue(phone)).thenReturn("custom-token");
        assertEquals("custom-token",controller.verify(new CentralOtpController.VerifyRequest(sent.challengeId(),"123456"),from()).getBody().firebaseCustomToken());
        assertThrows(AuthException.class, () -> controller.verify(new CentralOtpController.VerifyRequest(sent.challengeId(),"123456"),from()));
        verify(identity,times(1)).issue(phone);
    }
    @Test void disabledFeatureNeverSendsOrTouchesIdentity() {
        var provider=mock(CentralOtpProvider.class); var identity=mock(CentralOtpIdentity.class);
        var controller=new CentralOtpController(store,provider,identity,new CentralOtpCaller("",""),false);
        assertThrows(AuthException.class, () -> controller.send(new CentralOtpController.SendRequest("9876543210","91",null),from()));
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
            if ("POST".equals(exchange.getRequestMethod())) {
                assertTrue(query.contains("template_id=6abe727541deb95f6d0b7192"));
                assertTrue(query.contains("realTimeResponse=1"));
                assertFalse(query.contains("invisible"));
                assertEquals("{}", new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            }
            byte[] bytes=response.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        }); server.start();
        try {
            var provider=new CentralOtpProvider(new Msg91Properties(true,"synthetic-test-key"),
                    "6abe727541deb95f6d0b7192",URI.create("http://127.0.0.1:"+server.getAddress().getPort()));
            provider.send(phone, false);
            response.set("{\"type\":\"error\",\"message\":\"private account diagnostic\"}");
            assertEquals("OTP_UNAVAILABLE",assertThrows(AuthException.class, () -> provider.send(phone, false)).getCode());
            response.set("{\"type\":\"error\",\"message\":\"OTP not match\"}");
            assertEquals("OTP_INVALID",assertThrows(AuthException.class, () -> provider.verify(phone,"000000")).getCode());
            response.set("{\"type\":\"success\",\"message\":\"OTP verified success\"}"); provider.verify(phone,"123456");
            response.set("{\"type\":\"success\",\"message\":\"Already verified\"}");
            assertThrows(AuthException.class, () -> provider.verify(phone,"123456"));
            response.set("x".repeat(8193)); assertThrows(AuthException.class, () -> provider.send(phone, false));
        } finally { server.stop(0); }
    }
    @Test void providerNeverFollowsRedirectsWithTheAccountAuthkey() throws Exception {
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/v5/otp", exchange -> {
            exchange.getResponseHeaders().set("Location","http://127.0.0.1:"+server.getAddress().getPort()+"/redirected");
            exchange.sendResponseHeaders(302,-1);exchange.close();
        });
        server.createContext("/redirected",exchange->{calls.incrementAndGet();exchange.sendResponseHeaders(200,-1);exchange.close();});
        server.start();
        try {
            var provider=new CentralOtpProvider(new Msg91Properties(true,"synthetic-test-key"),
                    "6abe727541deb95f6d0b7192",URI.create("http://127.0.0.1:"+server.getAddress().getPort()));
            assertThrows(AuthException.class,()->provider.send(phone, false));
            assertThrows(AuthException.class,()->provider.verify(phone,"123456"));
            assertEquals(0,calls.get());
        } finally {server.stop(0);}
    }
}
