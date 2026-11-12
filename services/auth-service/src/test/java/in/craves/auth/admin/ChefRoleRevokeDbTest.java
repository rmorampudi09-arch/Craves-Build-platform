package in.craves.auth.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/** Handbook 008: a platform admin takes the Chef role away; customer sign-in stays and the change is audited. */
@EnabledIfEnvironmentVariable(named = "EMAIL_TEST_DB_URL", matches = ".+")
class ChefRoleRevokeDbTest {
    static JdbcTemplate jdbc;
    static InternalAdminRoleRepository repository;
    static TransactionTemplate tx;

    @BeforeAll
    static void schema() {
        String url = System.getenv("EMAIL_TEST_DB_URL");
        URI uri = URI.create(url.substring("jdbc:".length()));
        if (!("true".equals(System.getenv("GITHUB_ACTIONS")) || "True".equalsIgnoreCase(System.getenv("TF_BUILD")))
            || !"true".equals(System.getenv("EMAIL_TEST_DISPOSABLE")) || !"postgresql".equals(uri.getScheme())
            || !List.of("localhost", "127.0.0.1").contains(uri.getHost()) || !"/craves_email_test".equals(uri.getPath())
            || uri.getQuery() != null || uri.getUserInfo() != null) {
            throw new IllegalStateException("Only the explicitly disposable CI PostgreSQL service is allowed");
        }
        String user = System.getenv("EMAIL_TEST_DB_USER");
        String password = System.getenv("EMAIL_TEST_DB_PASSWORD");
        var admin = new JdbcTemplate(new DriverManagerDataSource(url, user, password));
        // V7 and V9 own objects outside Flyway's schema (as in AccountDeletionRepositoryDbTest).
        admin.execute("DROP SCHEMA IF EXISTS academy_schema CASCADE");
        admin.execute("DROP TABLE IF EXISTS public.admin_explorer_admission CASCADE");
        admin.execute("DROP TABLE IF EXISTS public.admin_explorer_audit CASCADE");
        admin.execute("DROP FUNCTION IF EXISTS public.reject_admin_explorer_audit_mutation()");
        admin.execute("DROP SCHEMA IF EXISTS chef_role_revoke_test CASCADE");
        admin.execute("CREATE SCHEMA chef_role_revoke_test");
        var source = new DriverManagerDataSource(url + "?currentSchema=chef_role_revoke_test", user, password);
        Flyway.configure().dataSource(source).schemas("chef_role_revoke_test").defaultSchema("chef_role_revoke_test").load().migrate();
        jdbc = new JdbcTemplate(source);
        repository = new InternalAdminRoleRepository(jdbc);
        tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    }

    @Test
    void revokingRemovesOnlyChefMovesTheTokenOnKeepsSessionsAndAuditsEveryCall() {
        UUID admin = identity("PLATFORM_ADMIN");
        UUID chef = identity("CUSTOMER", "CHEF");
        jdbc.update("INSERT INTO refresh_session(identity_id, refresh_token_hash, expires_at) VALUES (?, ?, now() + interval '30 days')",
            chef, "hash-" + chef);
        UUID correlation = UUID.randomUUID();

        // In production the Spring proxy opens this transaction; here the lock and FOR UPDATE run inside one too.
        var revoked = tx.execute(status ->
            repository.revokeChefRole(admin, 1, chef, "Kitchen closed after repeated hygiene complaints", correlation));

        assertThat(revoked.changed()).isTrue();
        assertThat(revoked.previousTokenVersion()).isEqualTo(1);
        assertThat(revoked.newTokenVersion()).isEqualTo(2);
        assertThat(revoked.correlationId()).isEqualTo(correlation);
        assertThat(roles(chef)).containsExactly("CUSTOMER");
        assertThat(jdbc.queryForObject("SELECT token_version FROM auth_identity WHERE id = ?", Long.class, chef)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_session WHERE identity_id = ? AND revoked_at IS NULL", Long.class, chef))
            .isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_token_revocation_outbox WHERE identity_id = ?", Long.class, chef))
            .isEqualTo(1);

        var again = repository.revokeChefRole(admin, 1, chef, "Second click on the same revoke button", UUID.randomUUID());
        assertThat(again.changed()).isFalse();
        assertThat(again.newTokenVersion()).isEqualTo(2);
        assertThat(jdbc.queryForList(
            "SELECT details FROM auth_audit WHERE identity_id = ? AND action = 'CHEF_ROLE_REVOKED' AND actor_identity_id = ? ORDER BY details",
            String.class, chef, admin)).containsExactly(
            "changed=false;reason=Second click on the same revoke button",
            "changed=true;reason=Kitchen closed after repeated hygiene complaints");
    }

    @Test
    void onlyACurrentPlatformAdminActsAndAnUnknownIdentityIsNotFound() {
        UUID admin = identity("PLATFORM_ADMIN");
        UUID support = identity("SUPPORT_ADMIN");
        UUID chef = identity("CUSTOMER", "CHEF");

        assertThatThrownBy(() -> repository.revokeChefRole(admin, 7, chef, "Stale token of a demoted admin", UUID.randomUUID()))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        assertThatThrownBy(() -> repository.revokeChefRole(support, 1, chef, "Support admin trying to revoke", UUID.randomUUID()))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("403");
        assertThatThrownBy(() -> repository.revokeChefRole(admin, 1, UUID.randomUUID(), "No such identity anywhere", UUID.randomUUID()))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");
        assertThat(roles(chef)).containsExactly("CHEF", "CUSTOMER");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_audit WHERE identity_id = ?", Long.class, chef)).isZero();

        UUID chefOnly = identity("CHEF");
        assertThatThrownBy(() -> repository.revokeChefRole(admin, 1, chefOnly, "Customer side already deleted", UUID.randomUUID()))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("409");
        assertThat(roles(chefOnly)).containsExactly("CHEF");
    }

    @Test
    void theRevokeRunsInOneTransaction() throws Exception {
        assertThat(InternalAdminRoleRepository.class.getMethod("revokeChefRole", UUID.class, long.class, UUID.class, String.class, UUID.class)
            .isAnnotationPresent(Transactional.class)).isTrue();
    }

    private static UUID identity(String... roles) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO auth_identity(id, firebase_uid, phone_number) VALUES (?, ?, ?)", id, "synthetic-" + id,
            "s-" + id.toString().substring(0, 25));
        for (String role : roles) {
            jdbc.update("INSERT INTO auth_identity_role(identity_id, role_code) VALUES (?, ?)", id, role);
        }
        return id;
    }

    private static List<String> roles(UUID id) {
        return jdbc.queryForList("SELECT role_code FROM auth_identity_role WHERE identity_id = ? ORDER BY role_code", String.class, id);
    }
}
