package in.craves.notification.documents;

import static org.junit.jupiter.api.Assertions.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@EnabledIfEnvironmentVariable(named="DOCUMENT_TEST_JDBC_URL",matches=".+")
class DocumentMigrationDbTest {
    @Test void allNotificationMigrationsApplyAndValidateTogether() {
        String url=System.getenv("DOCUMENT_TEST_JDBC_URL");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") && url.endsWith("/pdf_module_test"));
        var data=new DriverManagerDataSource(url,System.getenv("DOCUMENT_TEST_DB_USER"),System.getenv("DOCUMENT_TEST_DB_PASSWORD"));
        var jdbc=new JdbcTemplate(data);
        jdbc.execute("DROP SCHEMA IF EXISTS notification_schema CASCADE");
        var flyway=Flyway.configure().dataSource(data).schemas("notification_schema").locations("classpath:db/migration").load();
        assertEquals(6,flyway.migrate().migrationsExecuted);
        flyway.validate();
        assertEquals(0,flyway.migrate().migrationsExecuted);
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('notification_schema.pdf_document')::text",String.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('notification_schema.notification_request')::text",String.class));
    }
}
