package in.craves.auth.admin;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

@EnabledIfEnvironmentVariable(named = "ADMIN_SESSION_TEST_JDBC_URL", matches = ".+/craves_admin_session_ci")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StaffRoleGrantDatabaseTest {
    static final String REASON = "Synthetic staff role change for CH-08";
    JdbcTemplate jdbc;
    TransactionTemplate tx;
    StaffRoleGrantService grants;
    InternalAdminRoleRepository repository;
    UUID actor;

    @BeforeAll void database() {
        String url = System.getenv("ADMIN_SESSION_TEST_JDBC_URL");
        assertTrue(url.endsWith("/craves_admin_session_ci"), "Only the disposable CI database is allowed");
        var dataSource = new DriverManagerDataSource(url, System.getenv("ADMIN_SESSION_TEST_DB_USER"), System.getenv("ADMIN_SESSION_TEST_DB_PASSWORD"));
        Flyway.configure().dataSource(dataSource).load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        grants = new StaffRoleGrantService(jdbc);
        repository = new InternalAdminRoleRepository(jdbc);
        actor = identity("PLATFORM_ADMIN");
    }

    @Test void staffGrantAddsOnlyTheRequestedScopedRole() {
        UUID target = identity("CUSTOMER");
        String phone = jdbc.queryForObject("SELECT phone_number FROM auth_identity WHERE id = ?", String.class, target);
        var result = tx.execute(s -> grants.grant(actor, 1, Set.of(phone), false, Set.of("SUPPORT_ADMIN"), REASON, UUID.randomUUID()));
        assertEquals(Set.of("CUSTOMER", "SUPPORT_ADMIN"), roles(target));
        assertEquals(2, result.users().getFirst().newTokenVersion());
    }

    @Test void roleReplacementNeverAddsTheRetiredAdminRole() {
        UUID target = identity("CUSTOMER");
        tx.execute(s -> repository.replaceRoles(actor, 1, target, Set.of("CHEF_ADMIN"), 1, REASON, UUID.randomUUID()));
        assertEquals(Set.of("CUSTOMER", "CHEF_ADMIN"), roles(target));
        tx.execute(s -> repository.replaceRoles(actor, 1, target, Set.of(), 2, REASON, UUID.randomUUID()));
        assertEquals(Set.of("CUSTOMER"), roles(target));
    }

    @Test void everyRoleChangeRetiresAnExistingAdminRow() {
        for (Set<String> next : List.of(Set.of("SUPPORT_ADMIN"), Set.<String>of())) {
            UUID staff = identity("CUSTOMER", "CHEF_ADMIN", "ADMIN");
            tx.execute(s -> repository.replaceRoles(actor, 1, staff, next, 1, REASON, UUID.randomUUID()));
            Set<String> expected = new HashSet<>(next);
            expected.add("CUSTOMER");
            assertEquals(expected, roles(staff));
        }
    }

    UUID identity(String... roles) {
        UUID id = UUID.randomUUID();
        String phone = "+1000" + ThreadLocalRandom.current().nextLong(1_000_000_000L, 10_000_000_000L);
        jdbc.update("INSERT INTO auth_identity(id,firebase_uid,phone_number) VALUES(?,?,?)", id, "synthetic-" + id, phone);
        for (String role : roles) jdbc.update("INSERT INTO auth_identity_role(identity_id,role_code) VALUES(?,?)", id, role);
        return id;
    }

    Set<String> roles(UUID identity) {
        return new HashSet<>(jdbc.queryForList("SELECT role_code FROM auth_identity_role WHERE identity_id = ?", String.class, identity));
    }
}
