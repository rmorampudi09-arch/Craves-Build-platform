package in.craves.auth.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import in.craves.auth.api.AuthTokenResponse;
import in.craves.auth.api.FirebaseExchangeRequest;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.exception.AuthException;
import in.craves.auth.exception.RestExceptionHandler;
import in.craves.auth.repository.*;
import in.craves.auth.security.*;
import in.craves.auth.web.AuthController;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.mockito.MockedStatic;
import java.util.concurrent.*;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

/** Real PostgreSQL, JPA repositories and Spring transaction proxies; Firebase verification alone is mocked. */
@EnabledIfEnvironmentVariable(named = "AUTH_AUDIT_TEST_JDBC_URL", matches = "jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/auth_audit_test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FailedLoginAuditDatabaseTest {
    static final String TOKEN = "synthetic-token-not-for-logging";
    static final String UID = "synthetic-firebase-uid";
    static final String PHONE = "+10000000000";
    static final Instant NOW = Instant.parse("2026-10-09T00:00:00Z");
    AnnotationConfigApplicationContext context;
    AuthService auth;
    JdbcTemplate jdbc;
    TransactionTemplate transaction;
    FirebaseAuth firebase;
    MockedStatic<FirebaseAuth> firebaseStatic;
    MockMvc mvc;

    @BeforeAll void database() {
        assertEquals("YES_LOCAL_DISPOSABLE_AUTH_AUDIT_ONLY", System.getenv("AUTH_AUDIT_TEST_CONFIRM"));
        context = new AnnotationConfigApplicationContext(Config.class);
        auth = context.getBean(AuthService.class);
        jdbc = context.getBean(JdbcTemplate.class);
        transaction = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        assertEquals("auth_audit_test", jdbc.queryForObject("SELECT current_database()", String.class));
        assertTrue(AopUtils.isAopProxy(auth), "Regression must exercise the real Spring transaction boundary");
        mvc = MockMvcBuilders.standaloneSetup(new AuthController(auth))
            .setControllerAdvice(new RestExceptionHandler()).build();
    }

    @AfterAll void close() { if (context != null) context.close(); }

    @BeforeEach void setup() {
        for (String table : List.of("auth_token_revocation_outbox", "refresh_session", "admin_session_family", "login_attempt", "auth_audit", "auth_identity_role", "auth_identity")) {
            jdbc.update("DELETE FROM " + table);
        }
        reset(context.getBean(CravesJwtService.class));
        firebase = mock(FirebaseAuth.class);
        firebaseStatic = mockStatic(FirebaseAuth.class);
        firebaseStatic.when(() -> FirebaseAuth.getInstance(context.getBean(FirebaseApp.class))).thenReturn(firebase);
    }

    @AfterEach void cleanup() {
        if (firebaseStatic != null) firebaseStatic.close();
        context.getBean(FailingConnectionDataSource.class).failNext.set(false);
    }

    FirebaseToken token(boolean phone, boolean adminTime) {
        FirebaseToken token = mock(FirebaseToken.class);
        when(token.getUid()).thenReturn(UID);
        when(token.getName()).thenReturn("Synthetic display");
        Map<String, Object> claims = new HashMap<>();
        if (phone) claims.put("phone_number", PHONE);
        if (adminTime) claims.put("auth_time", NOW.getEpochSecond());
        when(token.getClaims()).thenReturn(claims);
        return token;
    }

    void rejectVerification(boolean invalid) throws Exception {
        if (invalid) doThrow(mock(FirebaseAuthException.class)).when(firebase).verifyIdToken(TOKEN, true);
        else doReturn(token(false, false)).when(firebase).verifyIdToken(TOKEN, true);
    }

    String code(boolean invalid) { return invalid ? "FIREBASE_TOKEN_INVALID" : "PHONE_NUMBER_MISSING"; }
    String message(boolean invalid) {
        return invalid ? "Firebase ID token is invalid or expired" : "Firebase token does not contain a verified phone number";
    }

    AuthException rejected(boolean invalid) throws Exception {
        AuthException error = assertThrows(AuthException.class, () -> auth.exchangeFirebaseToken(
            new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest()));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatus());
        assertEquals(code(invalid), error.getCode());
        assertEquals(message(invalid), error.getMessage());
        verify(firebase).verifyIdToken(TOKEN, true);
        return error;
    }

    int count(String table) { return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class); }
    void noCredentials() {
        for (String table : List.of("auth_identity", "auth_identity_role", "refresh_session", "admin_session_family", "auth_audit")) {
            assertEquals(0, count(table), table + " must be rolled back");
        }
    }
    UUID seedIdentity(String... roles) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth_identity(id,firebase_uid,phone_number,email,email_verified,display_name) VALUES(?,?,?,'verified@example.test',true,'Original')", id, UID, PHONE);
        for (String role : roles) jdbc.update("INSERT INTO auth_identity_role(identity_id,role_code) VALUES(?,?)", id, role);
        return id;
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void rejectionHasOriginalHttpContractAndOneDurableAttempt(boolean invalid) throws Exception {
        rejectVerification(invalid);
        mvc.perform(post("/api/v1/auth/firebase/exchange").contentType("application/json")
            .header("User-Agent", "x".repeat(600)).header("X-Forwarded-For", "127.0.0.2, 127.0.0.3")
            .content("{\"firebaseIdToken\":\"" + TOKEN + "\"}"))
            .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value(code(invalid)))
            .andExpect(jsonPath("$.message").value(message(invalid)))
            .andExpect(jsonPath("$.accessToken").doesNotExist()).andExpect(jsonPath("$.refreshToken").doesNotExist());
        assertEquals(1, count("login_attempt"));
        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM login_attempt");
        assertEquals(false, row.get("success"));
        assertEquals(code(invalid), row.get("failure_code"));
        assertEquals(invalid ? null : UID, row.get("firebase_uid"));
        assertNull(row.get("phone_number"));
        assertEquals("127.0.0.2", row.get("ip_address"));
        assertEquals("x".repeat(512), row.get("user_agent"));
        assertNotNull(row.get("attempted_at"));
        assertFalse(row.values().toString().contains(TOKEN));
        noCredentials();
        verify(firebase).verifyIdToken(TOKEN, true);
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void auditCommitsIndependentlyWhileOuterIdentityRoleAndSessionRollBack(boolean invalid) throws Exception {
        rejectVerification(invalid);
        assertThrows(AuthException.class, () -> transaction.execute(status -> {
            UUID id = seedIdentity("CUSTOMER");
            jdbc.update("INSERT INTO refresh_session(identity_id,refresh_token_hash,expires_at) VALUES(?, 'synthetic-hash', now()+interval '1 day')", id);
            return auth.exchangeFirebaseToken(new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest());
        }));
        noCredentials();
        assertEquals(1, count("login_attempt"));
        assertEquals(code(invalid), jdbc.queryForObject("SELECT failure_code FROM login_attempt", String.class));
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void caughtRejectionStillMarksExistingCallerTransactionRollbackOnly(boolean invalid) throws Exception {
        rejectVerification(invalid);
        AuthException[] rejection = new AuthException[1];
        assertThrows(org.springframework.transaction.UnexpectedRollbackException.class, () -> transaction.execute(status -> {
            UUID id = seedIdentity("CUSTOMER");
            jdbc.update("INSERT INTO refresh_session(identity_id,refresh_token_hash,expires_at) VALUES(?, 'synthetic-caught-hash', now()+interval '1 day')", id);
            try {
                auth.exchangeFirebaseToken(new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest());
                fail("Authentication must reject");
            } catch (AuthException error) { rejection[0] = error; }
            return null;
        }));
        assertNotNull(rejection[0]);
        assertEquals(HttpStatus.UNAUTHORIZED, rejection[0].getStatus());
        assertEquals(code(invalid), rejection[0].getCode()); assertEquals(message(invalid), rejection[0].getMessage());
        noCredentials(); assertEquals(1, count("login_attempt"));
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void unavailableAuditTableCannotReplaceOriginalRejection(boolean invalid) throws Exception {
        rejectVerification(invalid);
        jdbc.execute("ALTER TABLE login_attempt RENAME TO unavailable_login_attempt");
        try { rejected(invalid); noCredentials(); }
        finally { jdbc.execute("ALTER TABLE unavailable_login_attempt RENAME TO login_attempt"); }
        assertEquals(0, count("login_attempt"));
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void auditCommitFailureCannotReplaceOriginalRejectionOrLogRequestData(boolean invalid) throws Exception {
        rejectVerification(invalid);
        jdbc.execute("CREATE FUNCTION reject_audit_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit commit failure'; END $$");
        jdbc.execute("CREATE CONSTRAINT TRIGGER reject_audit_commit AFTER INSERT ON login_attempt DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_audit_commit()");
        Logger logger = (Logger) LoggerFactory.getLogger(AuthService.class);
        var appender = new ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
        appender.start(); logger.addAppender(appender);
        try {
            rejected(invalid); noCredentials();
            assertEquals(0, count("login_attempt"));
            assertEquals(1, appender.list.size());
            assertEquals("Failed to persist rejected Firebase login audit", appender.list.getFirst().getFormattedMessage());
            assertNull(appender.list.getFirst().getThrowableProxy());
        } finally {
            logger.detachAppender(appender); appender.stop();
            jdbc.execute("DROP TRIGGER reject_audit_commit ON login_attempt");
            jdbc.execute("DROP FUNCTION reject_audit_commit()");
        }
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void auditConnectionFailureCannotReplaceOriginalRejection(boolean invalid) throws Exception {
        when(firebase.verifyIdToken(TOKEN, true)).thenAnswer(call -> {
            context.getBean(FailingConnectionDataSource.class).failNext.set(true);
            if (invalid) throw mock(FirebaseAuthException.class);
            return token(false, false);
        });
        try { rejected(invalid); }
        finally { context.getBean(FailingConnectionDataSource.class).failNext.set(false); }
        noCredentials(); assertEquals(0, count("login_attempt"));
    }

    @Test void referralRejectionRollsBackNewIdentityAndRole() throws Exception {
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        AuthException error = assertThrows(AuthException.class, () -> auth.exchangeFirebaseToken(
            new FirebaseExchangeRequest(TOKEN, null, new ObjectMapper().createObjectNode()), new MockHttpServletRequest()));
        assertEquals("REFERRAL_SIGNUP_UNAVAILABLE", error.getCode());
        assertEquals(HttpStatus.CONFLICT, error.getStatus());
        noCredentials(); assertEquals(0, count("login_attempt"));
    }

    @Test void staleAdminAuthenticationRollsBackIdentityUpdatesRoleAndSuccessAudits() throws Exception {
        UUID id = seedIdentity("PLATFORM_ADMIN");
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        AuthException error = assertThrows(AuthException.class, () -> auth.exchangeFirebaseToken(
            new FirebaseExchangeRequest(TOKEN, true), new MockHttpServletRequest()));
        assertEquals("ADMIN_REAUTHENTICATION_REQUIRED", error.getCode());
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatus());
        assertEquals(List.of("PLATFORM_ADMIN"), jdbc.queryForList("SELECT role_code FROM auth_identity_role WHERE identity_id=?", String.class, id));
        assertEquals("Original", jdbc.queryForObject("SELECT display_name FROM auth_identity WHERE id=?", String.class, id));
        assertNull(jdbc.queryForObject("SELECT last_login_at FROM auth_identity WHERE id=?", Object.class, id));
        for (String table : List.of("login_attempt", "auth_audit", "refresh_session", "admin_session_family")) assertEquals(0, count(table));
    }

    @Test void rejectionAfterSessionWriteStillRollsBackEverything() throws Exception {
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        doThrow(AuthException.unauthorized("SYNTHETIC_ISSUANCE_REJECTED", "Synthetic rejection"))
            .when(context.getBean(CravesJwtService.class)).issueAccessToken(any(AuthIdentity.class), anyList());
        AuthException error = assertThrows(AuthException.class, () -> auth.exchangeFirebaseToken(
            new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest()));
        assertEquals("SYNTHETIC_ISSUANCE_REJECTED", error.getCode());
        noCredentials(); assertEquals(0, count("login_attempt"));
    }

    @Test void deferredSessionCommitFailureRollsBackIdentityRolesAndSuccessAudits() throws Exception {
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        jdbc.execute("CREATE FUNCTION reject_session_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic session commit failure'; END $$");
        jdbc.execute("CREATE CONSTRAINT TRIGGER reject_session_commit AFTER INSERT ON refresh_session DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_session_commit()");
        try {
            mvc.perform(post("/api/v1/auth/firebase/exchange").contentType("application/json")
                .content("{\"firebaseIdToken\":\"" + TOKEN + "\"}"))
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.code").value("INTERNAL_SERVER_ERROR"))
                .andExpect(jsonPath("$.accessToken").doesNotExist()).andExpect(jsonPath("$.refreshToken").doesNotExist());
            noCredentials(); assertEquals(0, count("login_attempt"));
        } finally {
            jdbc.execute("DROP TRIGGER reject_session_commit ON refresh_session");
            jdbc.execute("DROP FUNCTION reject_session_commit()");
        }
    }

    @Test void successfulLoginAuditFailureRemainsFatalAndRollsBackCredentials() throws Exception {
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        jdbc.execute("ALTER TABLE login_attempt ADD CONSTRAINT reject_successful_test_attempt CHECK (NOT success)");
        try {
            assertThrows(RuntimeException.class, () -> auth.exchangeFirebaseToken(
                new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest()));
            noCredentials(); assertEquals(0, count("login_attempt"));
        } finally { jdbc.execute("ALTER TABLE login_attempt DROP CONSTRAINT reject_successful_test_attempt"); }
    }

    @Test void successfulExchangeStillJoinsCallerTransactionAndRollsBackWithIt() throws Exception {
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        assertThrows(AuthException.class, () -> transaction.execute(status -> {
            auth.exchangeFirebaseToken(new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest());
            throw AuthException.conflict("SYNTHETIC_OUTER_REJECTION", "Synthetic outer rejection");
        }));
        noCredentials(); assertEquals(0, count("login_attempt"));
    }

    @Test void inactiveIdentityRejectionAndExistingAuditScopeRemainUnchanged() throws Exception {
        seedIdentity("CUSTOMER", "CHEF");
        jdbc.update("UPDATE auth_identity SET status='SUSPENDED'");
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        AuthException error = assertThrows(AuthException.class, () -> auth.exchangeFirebaseToken(
            new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest()));
        assertEquals(HttpStatus.FORBIDDEN, error.getStatus()); assertEquals("IDENTITY_NOT_ACTIVE", error.getCode());
        assertEquals("Identity is not active", error.getMessage());
        assertEquals("Original", jdbc.queryForObject("SELECT display_name FROM auth_identity", String.class));
        assertEquals(2, count("auth_identity_role"));
        for (String table : List.of("login_attempt", "auth_audit", "refresh_session", "admin_session_family")) assertEquals(0, count(table));
    }

    @Test void conflictingPhoneRejectionAndExistingAuditScopeRemainUnchanged() throws Exception {
        seedIdentity("CUSTOMER");
        jdbc.update("UPDATE auth_identity SET firebase_uid='different-synthetic-uid'");
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        AuthException error = assertThrows(AuthException.class, () -> auth.exchangeFirebaseToken(
            new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest()));
        assertEquals(HttpStatus.CONFLICT, error.getStatus()); assertEquals("PHONE_ALREADY_LINKED", error.getCode());
        assertEquals("Phone number is already linked to another identity", error.getMessage());
        assertEquals(1, count("auth_identity")); assertEquals(1, count("auth_identity_role"));
        for (String table : List.of("login_attempt", "auth_audit", "refresh_session", "admin_session_family")) assertEquals(0, count(table));
    }

    @Test void validCustomerLoginRetainsTokensLifetimeAndAtomicSuccessAudit() throws Exception {
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        Instant before = Instant.now();
        AuthTokenResponse response = auth.exchangeFirebaseToken(new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest());
        assertEquals(List.of("CUSTOMER"), response.identity().roles());
        assertEquals(900, response.expiresIn());
        assertTrue(response.refreshTokenExpiresAt().isAfter(before.plus(Duration.ofDays(30)).minusSeconds(1)));
        assertTrue(response.refreshTokenExpiresAt().isBefore(Instant.now().plus(Duration.ofDays(30)).plusSeconds(1)));
        assertEquals(response.identity().id(), context.getBean(CravesJwtService.class).verifyAccessToken(response.accessToken()).identityId());
        assertEquals(1, count("auth_identity")); assertEquals(1, count("auth_identity_role"));
        assertEquals(1, count("login_attempt")); assertEquals(1, count("auth_audit")); assertEquals(1, count("refresh_session"));
        assertEquals(true, jdbc.queryForObject("SELECT success FROM login_attempt", Boolean.class));
        assertEquals(context.getBean(TokenHasher.class).sha256Base64Url(response.refreshToken()), jdbc.queryForObject("SELECT refresh_token_hash FROM refresh_session", String.class));
        assertEquals(0, count("admin_session_family"));
        verify(firebase).verifyIdToken(TOKEN, true);
    }

    @Test void chefConsumerLoginPreservesVerifiedEmailAndRolesWithoutAdminElevation() throws Exception {
        seedIdentity("CUSTOMER", "CHEF", "PLATFORM_ADMIN");
        doReturn(token(true, false)).when(firebase).verifyIdToken(TOKEN, true);
        AuthTokenResponse response = auth.exchangeFirebaseToken(new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest());
        assertEquals(Set.of("CUSTOMER", "CHEF"), Set.copyOf(response.identity().roles()));
        assertEquals("verified@example.test", response.identity().email()); assertTrue(response.identity().emailVerified());
        assertEquals(Set.of("CUSTOMER", "CHEF"), Set.copyOf(context.getBean(CravesJwtService.class).verifyAccessToken(response.accessToken()).roles()));
        assertEquals(900, response.expiresIn()); assertEquals(0, count("admin_session_family"));
        assertEquals(3, count("auth_identity_role")); assertEquals(1, count("login_attempt"));
    }

    @Test void validAdminLoginRetainsBoundedSessionAndExistingRoles() throws Exception {
        seedIdentity("CUSTOMER", "PLATFORM_ADMIN");
        doReturn(token(true, true)).when(firebase).verifyIdToken(TOKEN, true);
        AuthTokenResponse response = auth.exchangeFirebaseToken(new FirebaseExchangeRequest(TOKEN, true), new MockHttpServletRequest());
        assertEquals(NOW.plus(Duration.ofHours(8)), response.refreshTokenExpiresAt());
        assertTrue(response.identity().roles().contains("PLATFORM_ADMIN"));
        assertEquals(1, count("admin_session_family")); assertEquals(1, count("refresh_session"));
        assertEquals(1, count("login_attempt")); assertEquals(1, count("auth_audit"));
        assertNotNull(context.getBean(CravesJwtService.class).verifyAccessToken(response.accessToken()).adminSessionId());
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void fiveConcurrentRejectionsUseOneConnectionEachAndAllAuditRowsSurvive(boolean invalid) throws Exception {
        var barrier = new CyclicBarrier(5);
        var data = context.getBean(FailingConnectionDataSource.class);
        when(firebase.verifyIdToken(TOKEN, true)).thenAnswer(call -> {
            barrier.await(10, TimeUnit.SECONDS);
            if (invalid) throw mock(FirebaseAuthException.class);
            return token(false, false);
        });
        long start = System.nanoTime();
        try (var executor = Executors.newFixedThreadPool(5)) {
            List<Future<AuthException>> futures = new ArrayList<>();
            for (int i = 0; i < 5; i++) futures.add(executor.submit(() -> {
                try (MockedStatic<FirebaseAuth> scoped = mockStatic(FirebaseAuth.class)) {
                    scoped.when(() -> FirebaseAuth.getInstance(context.getBean(FirebaseApp.class))).thenReturn(firebase);
                    AuthException error = assertThrows(AuthException.class, () -> auth.exchangeFirebaseToken(
                        new FirebaseExchangeRequest(TOKEN, null), new MockHttpServletRequest()));
                    assertEquals(HttpStatus.UNAUTHORIZED, error.getStatus());
                    assertEquals(code(invalid), error.getCode()); assertEquals(message(invalid), error.getMessage());
                    return error;
                }
            }));
            for (Future<AuthException> future : futures) future.get(15, TimeUnit.SECONDS);
        }
        assertEquals(5, data.pool.getMaximumPoolSize());
        assertEquals(5, count("login_attempt")); noCredentials();
        assertEquals(0, data.pool.getHikariPoolMXBean().getActiveConnections());
        System.out.println("AUTH03_POOL: rejected=" + invalid + " attempts=5 durable=5 elapsedMs=" + TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start));
    }

    static class FailingConnectionDataSource extends AbstractDataSource implements AutoCloseable {
        final AtomicBoolean failNext = new AtomicBoolean();
        final HikariDataSource pool;
        FailingConnectionDataSource(String url) {
            pool = new HikariDataSource();
            pool.setJdbcUrl(url); pool.setUsername(System.getenv("AUTH_AUDIT_TEST_DB_USER"));
            pool.setPassword(System.getenv("AUTH_AUDIT_TEST_DB_PASSWORD"));
            pool.setMaximumPoolSize(5); pool.setMinimumIdle(5);
            // Test-only short wait detects nested-transaction starvation without a 30-second production wait.
            pool.setConnectionTimeout(1000); pool.setPoolName("auth03-disposable-test");
        }
        @Override public Connection getConnection() throws SQLException {
            if (failNext.getAndSet(false)) throw new SQLException("Synthetic unavailable audit connection");
            return pool.getConnection();
        }
        @Override public Connection getConnection(String username, String password) throws SQLException { return getConnection(); }
        @Override public void close() { pool.close(); }
    }

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = AuthIdentityRepository.class)
    @ComponentScan(basePackageClasses = AuthService.class, useDefaultFilters = false,
        includeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = "in\\.craves\\.auth\\.service\\.(AuthService|FailedLoginAuditService)"))
    static class Config {
        @Bean FailingConnectionDataSource dataSource() {
            String url = System.getenv("AUTH_AUDIT_TEST_JDBC_URL");
            assertTrue(url.matches("jdbc:postgresql://127[.]0[.]0[.]1:[0-9]+/auth_audit_test"));
            var source = new FailingConnectionDataSource(url);
            assertEquals("auth_audit_test", new JdbcTemplate(source).queryForObject("SELECT current_database()", String.class));
            Flyway.configure().dataSource(source).load().migrate();
            return source;
        }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource source) {
            var factory = new LocalContainerEntityManagerFactoryBean();
            factory.setDataSource(source); factory.setPackagesToScan("in.craves.auth.domain");
            factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "validate"));
            return factory;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory factory) { return new JpaTransactionManager(factory); }
        @Bean JdbcTemplate jdbc(DataSource source) { return new JdbcTemplate(source); }
        @Bean FirebaseApp firebaseApp() { return mock(FirebaseApp.class); }
        @Bean JwtProperties properties() { var props = new JwtProperties(); props.setAllowGeneratedLocalKeys(true); return props; }
        @Bean CravesJwtService jwt(JwtProperties props) { return spy(new CravesJwtService(props, new RsaKeyProvider(props), new ObjectMapper(), Clock.fixed(NOW, ZoneOffset.UTC))); }
        @Bean RefreshTokenGenerator generator() { return new RefreshTokenGenerator(); }
        @Bean TokenHasher hasher() { return new TokenHasher(); }
        @Bean AdminSessionService admin(JdbcTemplate jdbc, AuthIdentityRepository identities, AuthIdentityRoleRepository roles,
            CravesJwtService jwt, JwtProperties props, RefreshTokenGenerator generator, TokenHasher hasher) {
            return new AdminSessionService(jdbc, identities, roles, jwt, props, generator, hasher, Clock.fixed(NOW, ZoneOffset.UTC));
        }
    }
}
