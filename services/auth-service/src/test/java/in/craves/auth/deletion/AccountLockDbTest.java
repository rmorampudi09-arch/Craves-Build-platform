package in.craves.auth.deletion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import in.craves.auth.api.FirebaseExchangeRequest;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.Via;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.domain.AuthIdentityRole;
import in.craves.auth.repository.AuthAuditRepository;
import in.craves.auth.repository.AuthIdentityRepository;
import in.craves.auth.repository.AuthIdentityRoleRepository;
import in.craves.auth.repository.AuthRoleRepository;
import in.craves.auth.repository.LoginAttemptRepository;
import in.craves.auth.repository.RefreshSessionRepository;
import in.craves.auth.security.CravesJwtService;
import in.craves.auth.security.RefreshTokenGenerator;
import in.craves.auth.security.TokenHasher;
import in.craves.auth.service.AdminSessionService;
import in.craves.auth.service.AuthService;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/** Real PostgreSQL: what the day-30 lock does to the login, and that signing in does not undo it. */
@EnabledIfEnvironmentVariable(named="EMAIL_TEST_DB_URL", matches=".+")
@ResourceLock("disposable-email-auth-migration-schemas")
class AccountLockDbTest {
    static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");
    static JdbcTemplate jdbc;
    static DataSourceTransactionManager transactions;
    static TransactionTemplate tx;
    static AccountDeletionRepository deletions;
    static AccountLock lock;

    @BeforeAll static void database() {
        var source = AccountDeletionRepositoryDbTest.migratedSchema("account_lock_test");
        jdbc = new JdbcTemplate(source);
        transactions = new DataSourceTransactionManager(source);
        tx = new TransactionTemplate(transactions);
        deletions = new AccountDeletionRepository(jdbc);
        lock = new AccountLock(jdbc);
    }

    @Test void lockAllSuspendsAndRevokesSessions() {
        UUID id = identity("CUSTOMER", "CHEF"), bystander = identity("CUSTOMER");
        session(id, null);
        session(id, "USER_LOGOUT");
        session(bystander, null);

        tx.executeWithoutResult(s -> lock.lock(request(id, Scope.ALL, RequestStatus.SCHEDULED)));

        assertEquals("SUSPENDED 2", login(id));
        assertEquals(List.of("ACCOUNT_DELETION", "USER_LOGOUT"), revoked(id));
        assertEquals(List.of("CHEF", "CUSTOMER"), roles(id), "roles stay until the login is wiped");
        assertEquals("SUSPENDED 2", jdbc.queryForObject("SELECT account_status || ' ' || minimum_token_version "
            + "FROM auth_token_revocation_outbox WHERE identity_id = ?", String.class, id), "Redis revocation hears of it");
        assertEquals("ACTIVE 1", login(bystander));
        assertEquals(List.of(), revoked(bystander));
    }

    @Test void lockCustomerRemovesOnlyTheCustomerRole() {
        UUID customerSide = identity("CUSTOMER", "CHEF"), chefSide = identity("CUSTOMER", "CHEF");
        session(customerSide, null);

        tx.executeWithoutResult(s -> lock.lock(request(customerSide, Scope.CUSTOMER, RequestStatus.SCHEDULED)));
        tx.executeWithoutResult(s -> lock.lock(request(chefSide, Scope.CHEF, RequestStatus.SCHEDULED)));

        assertEquals(List.of("CHEF"), roles(customerSide));
        assertEquals("ACTIVE 2", login(customerSide), "the chef side keeps signing in; old tokens are stale");
        assertEquals(List.of(), revoked(customerSide));
        assertEquals(List.of("CUSTOMER"), roles(chefSide));
        assertEquals("ACTIVE 2", login(chefSide));
    }

    @Test void signInDuringCustomerErasingDoesNotRestoreTheRole() throws Exception {
        UUID id = identity("CUSTOMER", "CHEF");
        DeletionRequest request = deletions.insert(id, Scope.CUSTOMER, RequestStatus.SCHEDULED, Via.APP,
            NOW.minus(Duration.ofDays(30)), NOW);
        // What the worker commits on day 30.
        tx.executeWithoutResult(s -> {
            assertTrue(deletions.transition(request.id(), RequestStatus.SCHEDULED, RequestStatus.ERASING, m -> m.put("locked_at", NOW)));
            lock.lock(request);
        });

        assertEquals(List.of("CHEF"), signIn(id), "the chef signs in without getting the customer side back");
        assertEquals(List.of("CHEF"), roles(id));

        deletions.transition(request.id(), RequestStatus.ERASING, RequestStatus.COMPLETED, m -> m.put("completed_at", NOW));
        assertEquals(List.of("CHEF", "CUSTOMER"), signIn(id), "once erased, signing in starts a new customer side");
    }

    /** The real sign-in path with Firebase stubbed and the role and deletion tables in PostgreSQL. */
    List<String> signIn(UUID id) throws Exception {
        String uid = "synthetic-" + id, phone = phone(id);
        var identity = new AuthIdentity(uid, phone);
        ReflectionTestUtils.setField(identity, "id", id);
        identity.setStatus("ACTIVE");
        var identities = mock(AuthIdentityRepository.class);
        when(identities.findByFirebaseUid(uid)).thenReturn(Optional.of(identity));
        when(identities.findByPhoneNumber(phone)).thenReturn(Optional.of(identity));
        when(identities.save(any())).thenAnswer(call -> call.getArgument(0));
        var roleCatalog = mock(AuthRoleRepository.class);
        when(roleCatalog.existsById(anyString())).thenReturn(true);
        var roleRows = mock(AuthIdentityRoleRepository.class);
        when(roleRows.existsByIdentityIdAndRoleCode(any(), anyString())).thenAnswer(call ->
            roles(call.getArgument(0)).contains(call.<String>getArgument(1)));
        when(roleRows.save(any())).thenAnswer(call -> {
            AuthIdentityRole row = call.getArgument(0);
            jdbc.update("INSERT INTO auth_identity_role (identity_id, role_code) VALUES (?, ?)", row.getIdentityId(), row.getRoleCode());
            return row;
        });
        when(roleRows.findRoleCodesByIdentityId(any())).thenAnswer(call -> roles(call.getArgument(0)));
        var jwt = mock(CravesJwtService.class);
        when(jwt.issueAccessToken(any(AuthIdentity.class), anyList(), nullable(String.class))).thenReturn("synthetic-access");
        var generator = mock(RefreshTokenGenerator.class);
        when(generator.generate()).thenReturn("synthetic-refresh");
        var accountDeletions = new AccountDeletionService(deletions, identities, roleRows, mock(DeletionNotices.class),
            new AccountDeletionProperties(), transactions, Clock.fixed(NOW, ZoneOffset.UTC), Runnable::run);
        FirebaseApp app = mock(FirebaseApp.class);
        var auth = new AuthService(app, new JwtProperties(), identities, roleCatalog, roleRows, mock(RefreshSessionRepository.class),
            mock(LoginAttemptRepository.class), mock(AuthAuditRepository.class), jwt, generator, new TokenHasher(),
            mock(AdminSessionService.class), accountDeletions);
        FirebaseToken token = mock(FirebaseToken.class);
        when(token.getUid()).thenReturn(uid);
        when(token.getClaims()).thenReturn(Map.of("phone_number", phone));
        FirebaseAuth firebase = mock(FirebaseAuth.class);
        when(firebase.verifyIdToken("synthetic-id-token", true)).thenReturn(token);
        try (var firebaseAuth = mockStatic(FirebaseAuth.class)) {
            firebaseAuth.when(() -> FirebaseAuth.getInstance(app)).thenReturn(firebase);
            return auth.exchangeFirebaseToken(new FirebaseExchangeRequest("synthetic-id-token", false), new MockHttpServletRequest())
                .identity().roles();
        }
    }

    static UUID identity(String... roles) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth_identity (id, firebase_uid, phone_number) VALUES (?, ?, ?)", id, "synthetic-" + id, phone(id));
        for (String role : roles) jdbc.update("INSERT INTO auth_identity_role (identity_id, role_code) VALUES (?, ?)", id, role);
        return id;
    }

    static String phone(UUID id) {
        return "s-" + id.toString().substring(0, 25);
    }

    static void session(UUID id, String revokeReason) {
        jdbc.update("INSERT INTO refresh_session (identity_id, refresh_token_hash, expires_at, revoked_at, revoke_reason) "
                + "VALUES (?, ?, now() + interval '1 day', ?, ?)",
            id, "synthetic-" + UUID.randomUUID(), revokeReason == null ? null : Timestamp.from(NOW), revokeReason);
    }

    static DeletionRequest request(UUID identityId, Scope scope, RequestStatus status) {
        return new DeletionRequest(UUID.randomUUID(), identityId, scope, status, Via.APP, NOW, NOW, null, null, null, null, null,
            null, null, null, null, null);
    }

    static String login(UUID id) {
        return jdbc.queryForObject("SELECT status || ' ' || token_version FROM auth_identity WHERE id = ?", String.class, id);
    }

    static List<String> roles(UUID id) {
        return jdbc.queryForList("SELECT role_code FROM auth_identity_role WHERE identity_id = ? ORDER BY role_code", String.class, id);
    }

    static List<String> revoked(UUID id) {
        return jdbc.queryForList("SELECT revoke_reason FROM refresh_session WHERE identity_id = ? AND revoked_at IS NOT NULL "
            + "ORDER BY revoke_reason", String.class, id);
    }
}
