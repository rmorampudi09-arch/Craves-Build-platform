package in.craves.auth.deletion;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
import in.craves.auth.admin.AdminAccountInterventionRepository;
import in.craves.auth.api.FirebaseExchangeRequest;
import in.craves.auth.api.IdentityResponse;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.Via;
import in.craves.auth.domain.AuthIdentity;
import in.craves.auth.domain.AuthIdentityRole;
import in.craves.auth.exception.AuthException;
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
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/** Real PostgreSQL: what the day-30 lock does to the login, and that signing in does not undo it. */
@EnabledIfEnvironmentVariable(named="EMAIL_TEST_DB_URL", matches=".+")
@ResourceLock("disposable-email-auth-migration-schemas")
class AccountLockDbTest {
    static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");
    static DriverManagerDataSource source;
    static JdbcTemplate jdbc;
    static DataSourceTransactionManager transactions;
    static TransactionTemplate tx;
    static AccountDeletionRepository deletions;
    static AccountLock lock;

    @BeforeAll static void database() {
        source = AccountDeletionRepositoryDbTest.migratedSchema("account_lock_test");
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

    /**
     * Real Hibernate: a sign-in that read the login before the day-30 lock committed writes back only the columns it changed
     * (AuthIdentity is @DynamicUpdate), so it can neither reactivate the account nor restore the old token_version.
     */
    @Test void aSignInThatReadTheLoginBeforeTheLockLeavesItLocked() {
        UUID id = identity("CUSTOMER");
        var factory = new LocalContainerEntityManagerFactoryBean();
        factory.setDataSource(source);
        factory.setManagedTypes(PersistenceManagedTypes.of(AuthIdentity.class.getName()));
        factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        factory.afterPropertiesSet();
        try {
            var emf = factory.getObject();
            var identities = new JpaRepositoryFactory(SharedEntityManagerCreator.createSharedEntityManager(emf))
                .getRepository(AuthIdentityRepository.class);
            Instant lockedAt = new TransactionTemplate(new JpaTransactionManager(emf)).execute(status -> {
                AuthIdentity signingIn = identities.findById(id).orElseThrow();
                // The lock commits on another connection between the sign-in's read and its write.
                Instant locked = CompletableFuture.supplyAsync(() -> {
                    tx.executeWithoutResult(t -> lock.lock(request(id, Scope.ALL, RequestStatus.ERASING)));
                    return jdbc.queryForObject("SELECT updated_at FROM auth_identity WHERE id = ?", Timestamp.class, id).toInstant();
                }).join();
                signingIn.setLastLoginAt(Instant.now());
                identities.save(signingIn);
                return locked;
            });

            assertEquals("SUSPENDED 2", login(id), "the sign-in wrote back neither the old status nor the old token_version");
            var row = jdbc.queryForMap("SELECT last_login_at, updated_at FROM auth_identity WHERE id = ?", id);
            assertNotNull(row.get("last_login_at"));
            assertTrue(((Timestamp) row.get("updated_at")).toInstant().isAfter(lockedAt), "@PreUpdate still dates the write");
        } finally {
            factory.destroy();
        }
    }

    @Test void staffCannotReactivateAWholeAccountBeingErasedOrErased() {
        var interventions = new AdminAccountInterventionRepository(jdbc);
        UUID admin = identity(), id = identity("CUSTOMER", "CHEF");
        DeletionRequest request = deletions.insert(id, Scope.ALL, RequestStatus.SCHEDULED, Via.APP, NOW.minus(Duration.ofDays(30)), NOW);
        tx.executeWithoutResult(s -> {
            assertTrue(deletions.transition(request.id(), RequestStatus.SCHEDULED, RequestStatus.ERASING, m -> m.put("locked_at", NOW)));
            lock.lock(request);
        });
        Runnable reactivate = () -> interventions.request(admin, id, "REACTIVATE", "Synthetic support escalation", UUID.randomUUID());

        assertRefused(reactivate, "ACCOUNT_DELETION_IN_PROGRESS");
        deletions.transition(request.id(), RequestStatus.ERASING, RequestStatus.COMPLETED, m -> m.put("completed_at", NOW));
        assertRefused(reactivate, "ACCOUNT_DELETION_IN_PROGRESS");

        assertEquals("SUSPENDED 2", login(id), "the tombstone stays locked");
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM auth_admin_intervention WHERE identity_id = ?", Integer.class, id));
        // Only the whole-account lock is guarded: staff still lift their own suspension of a chef whose chef side is erasing.
        UUID chef = identity("CUSTOMER", "CHEF");
        deletions.insert(chef, Scope.CHEF, RequestStatus.ERASING, Via.APP, NOW, NOW);
        interventions.request(admin, chef, "SUSPEND", "Synthetic support escalation", UUID.randomUUID());
        assertEquals("ACTIVE", interventions.request(admin, chef, "REACTIVATE", "Synthetic support escalation", UUID.randomUUID()).status());
    }

    static void assertRefused(Runnable call, String code) {
        AuthException refused = assertThrows(AuthException.class, call::run);
        assertEquals(HttpStatus.CONFLICT, refused.getStatus());
        assertEquals(code, refused.getCode());
    }

    List<String> signIn(UUID id) throws Exception {
        return signIn(jdbc, transactions, "synthetic-" + id, phone(id)).roles();
    }

    /**
     * The real sign-in path with Firebase stubbed and the identity, role and deletion tables in PostgreSQL.
     * A phone and uid found in no identity sign up a new one.
     */
    static IdentityResponse signIn(JdbcTemplate jdbc, DataSourceTransactionManager transactions, String uid, String phone) throws Exception {
        var identities = mock(AuthIdentityRepository.class);
        when(identities.findByFirebaseUid(anyString())).thenAnswer(call -> stored(jdbc, "firebase_uid", call.getArgument(0)));
        when(identities.findByPhoneNumber(anyString())).thenAnswer(call -> stored(jdbc, "phone_number", call.getArgument(0)));
        when(identities.save(any())).thenAnswer(call -> {
            AuthIdentity identity = call.getArgument(0);
            if (identity.getId() == null) {
                ReflectionTestUtils.setField(identity, "id", UUID.randomUUID());
                jdbc.update("INSERT INTO auth_identity (id, firebase_uid, phone_number) VALUES (?, ?, ?)",
                    identity.getId(), identity.getFirebaseUid(), identity.getPhoneNumber());
            }
            return identity;
        });
        var roleCatalog = mock(AuthRoleRepository.class);
        when(roleCatalog.existsById(anyString())).thenReturn(true);
        var roleRows = mock(AuthIdentityRoleRepository.class);
        String roles = "SELECT role_code FROM auth_identity_role WHERE identity_id = ? ORDER BY role_code";
        when(roleRows.existsByIdentityIdAndRoleCode(any(), anyString())).thenAnswer(call ->
            jdbc.queryForList(roles, String.class, call.<UUID>getArgument(0)).contains(call.<String>getArgument(1)));
        when(roleRows.save(any())).thenAnswer(call -> {
            AuthIdentityRole row = call.getArgument(0);
            jdbc.update("INSERT INTO auth_identity_role (identity_id, role_code) VALUES (?, ?)", row.getIdentityId(), row.getRoleCode());
            return row;
        });
        when(roleRows.findRoleCodesByIdentityId(any())).thenAnswer(call -> jdbc.queryForList(roles, String.class, call.<UUID>getArgument(0)));
        var jwt = mock(CravesJwtService.class);
        when(jwt.issueAccessToken(any(AuthIdentity.class), anyList(), nullable(String.class))).thenReturn("synthetic-access");
        var generator = mock(RefreshTokenGenerator.class);
        when(generator.generate()).thenReturn("synthetic-refresh");
        var accountDeletions = new AccountDeletionService(new AccountDeletionRepository(jdbc), identities, roleRows, mock(DeletionNotices.class),
            mock(AccountErasureClient.class), new AccountDeletionProperties(), transactions, Clock.fixed(NOW, ZoneOffset.UTC), Runnable::run);
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
                .identity();
        }
    }

    static Optional<AuthIdentity> stored(JdbcTemplate jdbc, String column, String value) {
        return jdbc.query("SELECT id, firebase_uid, phone_number, status FROM auth_identity WHERE " + column + " = ?", (rs, n) -> {
            var identity = new AuthIdentity(rs.getString("firebase_uid"), rs.getString("phone_number"));
            ReflectionTestUtils.setField(identity, "id", rs.getObject("id", UUID.class));
            identity.setStatus(rs.getString("status"));
            return identity;
        }, value).stream().findFirst();
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
