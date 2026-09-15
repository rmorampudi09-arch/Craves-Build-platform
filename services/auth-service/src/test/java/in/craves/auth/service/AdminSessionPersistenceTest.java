package in.craves.auth.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.api.AuthTokenResponse;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.exception.AuthException;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

@EnabledIfEnvironmentVariable(named = "ADMIN_SESSION_TEST_JDBC_URL", matches = ".+/craves_admin_session_ci")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AdminSessionPersistenceTest {
    JdbcTemplate jdbc;
    TransactionTemplate transaction;
    AdminSessionService sessions;
    CravesJwtService jwt;
    MutableClock clock;
    AuthIdentity identity;
    TokenHasher hasher = new TokenHasher();

    @BeforeAll void database() {
        String url = System.getenv("ADMIN_SESSION_TEST_JDBC_URL");
        assertTrue(url.endsWith("/craves_admin_session_ci"), "Only the disposable CI database is allowed");
        var dataSource = new DriverManagerDataSource(url, System.getenv("ADMIN_SESSION_TEST_DB_USER"), System.getenv("ADMIN_SESSION_TEST_DB_PASSWORD"));
        Flyway.configure().dataSource(dataSource).load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    @BeforeEach void setup() {
        clock = new MutableClock(Instant.parse("2026-09-12T10:00:00Z"));
        identity = new AuthIdentity("synthetic-" + UUID.randomUUID(), "synthetic-" + UUID.randomUUID().toString().substring(0, 20));
        ReflectionTestUtils.setField(identity, "id", UUID.randomUUID());
        jdbc.update("INSERT INTO auth_identity(id,firebase_uid,phone_number) VALUES(?,?,?)", identity.getId(), identity.getFirebaseUid(), identity.getPhoneNumber());
        jdbc.update("INSERT INTO auth_identity_role(identity_id,role_code) VALUES(?, 'PLATFORM_ADMIN')", identity.getId());
        var identities = mock(AuthIdentityRepository.class);
        when(identities.findById(any())).thenAnswer(call -> {
            UUID id = call.getArgument(0);
            identity.setStatus(jdbc.queryForObject("SELECT status FROM auth_identity WHERE id = ?", String.class, id));
            identity.setTokenVersion(jdbc.queryForObject("SELECT token_version FROM auth_identity WHERE id = ?", Long.class, id));
            return Optional.of(identity);
        });
        var roles = mock(AuthIdentityRoleRepository.class);
        when(roles.findRoleCodesByIdentityId(any())).thenAnswer(call -> jdbc.queryForList("SELECT role_code FROM auth_identity_role WHERE identity_id = ?", String.class, (UUID) call.getArgument(0)));
        var properties = new JwtProperties(); properties.setAllowGeneratedLocalKeys(true);
        jwt = new CravesJwtService(properties, new RsaKeyProvider(properties), new ObjectMapper(), clock);
        sessions = new AdminSessionService(jdbc, identities, roles, jwt, properties, new RefreshTokenGenerator(), hasher, clock);
    }

    // Real transactions; expected authentication rejection still commits replay/revocation evidence.
    <T> T tx(Supplier<T> operation) {
        final AuthException[] error = {null};
        T result = transaction.execute(status -> { try { return operation.get(); } catch (AuthException ex) { error[0] = ex; return null; } });
        if (error[0] != null) throw error[0];
        return result;
    }
    AuthTokenResponse signIn() { return tx(() -> sessions.create(identity, List.of("PLATFORM_ADMIN"), clock.instant().getEpochSecond())); }
    AuthTokenResponse refresh(AuthTokenResponse current, UUID receipt) { return tx(() -> sessions.refresh(current.refreshToken(), receipt)); }
    void logout(AuthTokenResponse current) { tx(() -> { sessions.logout(hasher.sha256Base64Url(current.refreshToken())); return null; }); }

    @Test void rotationKeepsOriginalDeadlineAndTruncatesLastAccessCredential() {
        AuthTokenResponse first = signIn();
        clock.advance(900); AuthTokenResponse second = refresh(first, UUID.randomUUID());
        assertEquals(first.refreshTokenExpiresAt(), second.refreshTokenExpiresAt());
        assertEquals(900, second.expiresIn());
        clock.advance(27899); AuthTokenResponse last = refresh(second, UUID.randomUUID());
        assertEquals(1, last.expiresIn());
        assertEquals(first.refreshTokenExpiresAt(), jwt.verifyAccessToken(last.accessToken()).expiresAt());
        clock.advance(1);
        assertThrows(AuthException.class, () -> refresh(last, UUID.randomUUID()));
        assertThrows(AuthException.class, () -> jwt.verifyAccessToken(last.accessToken()));
        clock.advance(1); assertThrows(AuthException.class, () -> refresh(last, UUID.randomUUID()));
    }

    @Test void sameAmbiguousAttemptReturnsSameCredentialButOtherReceiptRevokesItsFamily() {
        AuthTokenResponse first = signIn(); UUID receipt = UUID.randomUUID();
        AuthTokenResponse second = refresh(first, receipt);
        assertEquals(second.refreshToken(), refresh(first, receipt).refreshToken());
        assertThrows(AuthException.class, () -> refresh(first, UUID.randomUUID()));
        assertThrows(AuthException.class, () -> refresh(second, UUID.randomUUID()));
        assertThrows(AuthException.class, () -> sessions.validate(jwt.verifyAccessToken(second.accessToken())));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM auth_token_revocation_outbox WHERE identity_id = ?", Integer.class, identity.getId()));
    }

    @Test void twentyConcurrentCopiesOfOneAttemptHaveExactlyOneReplacement() throws Exception {
        AuthTokenResponse first = signIn(); UUID receipt = UUID.randomUUID();
        try (var executor = Executors.newFixedThreadPool(8)) {
            var futures = new ArrayList<Future<String>>();
            for (int i = 0; i < 20; i++) futures.add(executor.submit(() -> refresh(first, receipt).refreshToken()));
            Set<String> credentials = new HashSet<>();
            for (var future : futures) credentials.add(future.get(20, TimeUnit.SECONDS));
            assertEquals(1, credentials.size());
        }
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM refresh_session WHERE identity_id = ?", Integer.class, identity.getId()));
    }

    @Test void logoutUsingOldCookieRevokesRotatedReplacementAndAccessToken() {
        AuthTokenResponse first = signIn(); AuthTokenResponse second = refresh(first, UUID.randomUUID());
        logout(first);
        assertThrows(AuthException.class, () -> refresh(second, UUID.randomUUID()));
        assertThrows(AuthException.class, () -> sessions.validate(jwt.verifyAccessToken(second.accessToken())));
        assertThrows(AuthException.class, this::signIn); // same Firebase auth_time cannot undo logout
    }

    @Test void simultaneousLogoutAndRefreshNeverLeaveAUsableCredential() throws Exception {
        AuthTokenResponse first = signIn();
        try (var executor = Executors.newFixedThreadPool(2)) {
            Future<AuthTokenResponse> refreshed = executor.submit(() -> { try { return refresh(first, UUID.randomUUID()); } catch (AuthException expected) { return null; } });
            Future<?> signedOut = executor.submit(() -> logout(first));
            signedOut.get(20, TimeUnit.SECONDS);
            AuthTokenResponse result = refreshed.get(20, TimeUnit.SECONDS);
            if (result != null) assertThrows(AuthException.class, () -> sessions.validate(jwt.verifyAccessToken(result.accessToken())));
        }
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM refresh_session WHERE identity_id = ? AND revoked_at IS NULL", Integer.class, identity.getId()));
    }

    @Test void removedRolesAndDisabledAccountsInvalidateExistingAccessAndRenewal() {
        AuthTokenResponse first = signIn();
        jdbc.update("DELETE FROM auth_identity_role WHERE identity_id = ?", identity.getId());
        assertThrows(AuthException.class, () -> sessions.validate(jwt.verifyAccessToken(first.accessToken())));
        assertThrows(AuthException.class, () -> refresh(first, UUID.randomUUID()));
    }

    @Test void suspensionAndTokenVersionChangesAreCheckedAgainstLiveDatabase() {
        AuthTokenResponse first = signIn();
        jdbc.update("UPDATE auth_identity SET status = 'SUSPENDED', token_version = token_version + 1 WHERE id = ?", identity.getId());
        assertThrows(AuthException.class, () -> sessions.validate(jwt.verifyAccessToken(first.accessToken())));
        assertThrows(AuthException.class, () -> refresh(first, UUID.randomUUID()));
    }

    @Test void oldLogoutCannotInvalidateLaterInteractiveSignIn() {
        AuthTokenResponse first = signIn(); logout(first);
        identity.setTokenVersion(jdbc.queryForObject("SELECT token_version FROM auth_identity WHERE id = ?", Long.class, identity.getId()));
        clock.advance(60); AuthTokenResponse later = signIn(); logout(first);
        assertDoesNotThrow(() -> sessions.validate(jwt.verifyAccessToken(later.accessToken())));
    }

    static final class MutableClock extends Clock {
        private Instant now;
        MutableClock(Instant now) { this.now = now; }
        void advance(long seconds) { now = now.plusSeconds(seconds); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
