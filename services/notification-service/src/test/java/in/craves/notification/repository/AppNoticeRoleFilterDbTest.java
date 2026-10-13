package in.craves.notification.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.notification.api.AppNoticeResponse;
import in.craves.notification.service.ImportantEmailPolicyProperties;
import in.craves.notification.service.NotificationService;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Real PostgreSQL. Drops notification_schema, so it only runs against the disposable
 * pdf_module_test database that CI already provides for the other notification DB tests.
 */
@EnabledIfEnvironmentVariable(named = "DOCUMENT_TEST_JDBC_URL", matches = ".+")
class AppNoticeRoleFilterDbTest {
    private JdbcTemplate jdbc;
    private NotificationService service;
    private final UUID me = UUID.randomUUID();
    private final UUID someoneElse = UUID.randomUUID();
    private UUID chefNewest;

    @BeforeEach
    void setUp() {
        String url = System.getenv("DOCUMENT_TEST_JDBC_URL");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") && url.endsWith("/pdf_module_test"),
            "Refusing any database except the disposable local pdf_module_test");
        var data = new DriverManagerDataSource(
            url, System.getenv("DOCUMENT_TEST_DB_USER"), System.getenv("DOCUMENT_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(data);
        jdbc.execute("DROP SCHEMA IF EXISTS notification_schema CASCADE");
        jdbc.execute("DROP TABLE IF EXISTS public.flyway_schema_history");
        Flyway.configure().dataSource(data).locations("classpath:db/migration").load().migrate();
        service = new NotificationService(
            new NotificationRepository(new NamedParameterJdbcTemplate(data), new ObjectMapper()),
            mock(ImportantEmailPolicyProperties.class));

        // newest first: chef, customer, lower-case chef (old row), null role (old row)
        chefNewest = seed(me, "CHEF", "chef", 1);
        seed(me, "CUSTOMER", "customer", 2);
        seed(me, "chef", "chef-lowercase", 3);
        seed(me, null, "no-role", 4);
        seed(someoneElse, "CHEF", "other-identity", 1);
    }

    private UUID seed(UUID identity, String role, String title, int minutesAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO notification_schema.in_app_notification(
                id, recipient_identity_id, recipient_role, title, body, notification_type, created_at)
            VALUES (?, ?, ?, ?, 'body', 'TEST', now() - make_interval(mins => ?))
            """, id, identity, role, title, minutesAgo);
        return id;
    }

    private static List<String> titles(List<AppNoticeResponse> notices) {
        return notices.stream().map(AppNoticeResponse::title).toList();
    }

    @Test
    void listFiltersByRoleCaseInsensitivelyAndKeepsTodaysBehaviourWithoutOne() {
        assertThat(titles(service.appNotices(me, 50, "CHEF"))).containsExactly("chef", "chef-lowercase");
        assertThat(titles(service.appNotices(me, 50, "chef"))).containsExactly("chef", "chef-lowercase");
        assertThat(titles(service.appNotices(me, 50, "CUSTOMER"))).containsExactly("customer");
        // no role: every row of the identity, including the one with a null role, and nobody else's
        assertThat(titles(service.appNotices(me, 50, null)))
            .containsExactly("chef", "customer", "chef-lowercase", "no-role");
    }

    @Test
    void pageFiltersByRoleAcrossCursorsAndUnreadOnly() {
        var first = service.appNoticePage(me, 1, null, false, "CHEF");
        assertThat(titles(first.notices())).containsExactly("chef");
        assertThat(first.hasMore()).isTrue();
        var second = service.appNoticePage(me, 1, first.nextCursor(), false, "CHEF");
        assertThat(titles(second.notices())).containsExactly("chef-lowercase");
        assertThat(second.hasMore()).isFalse();

        jdbc.update("UPDATE notification_schema.in_app_notification SET read_at = now() WHERE id = ?", chefNewest);
        assertThat(titles(service.appNoticePage(me, 10, null, true, "CHEF").notices()))
            .containsExactly("chef-lowercase");
        assertThat(titles(service.appNoticePage(me, 10, null, true, null).notices()))
            .containsExactly("customer", "chef-lowercase", "no-role");
    }

    @Test
    void unreadCountFiltersByRole() {
        assertThat(service.unreadCount(me, "CHEF").unreadCount()).isEqualTo(2);
        assertThat(service.unreadCount(me, "CUSTOMER").unreadCount()).isEqualTo(1);
        assertThat(service.unreadCount(me, null).unreadCount()).isEqualTo(4);
    }

    @Test
    void readAllWithRoleLeavesOtherRolesAndRoleLessRowsUnread() {
        service.markAllRead(me, "CHEF");

        assertThat(service.unreadCount(me, "CHEF").unreadCount()).isZero();
        assertThat(service.unreadCount(me, "CUSTOMER").unreadCount()).isEqualTo(1);
        assertThat(service.unreadCount(me, null).unreadCount()).isEqualTo(2); // customer + null-role
        assertThat(service.unreadCount(someoneElse, null).unreadCount()).isEqualTo(1);
    }

    @Test
    void readAllWithoutRoleMarksEveryNoticeOfTheIdentityOnly() {
        service.markAllRead(me, null);

        assertThat(service.unreadCount(me, null).unreadCount()).isZero();
        assertThat(service.unreadCount(someoneElse, null).unreadCount()).isEqualTo(1);
    }
}
