package in.craves.integration.refund;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="REFUND_TEST_JDBC_URL",matches=".+")
class RefundMigrationDatabaseTest {
    @Test void upgradePreservesAttemptedDeadLetterErrorAndPublishedFailureWithoutGrantingDispatch() {
        String url=System.getenv("REFUND_TEST_JDBC_URL");
        assertEquals("true",System.getenv("CRAVES_REFUND_DISPOSABLE_DATABASE"));
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/craves_refund_test"));
        var ds=new DriverManagerDataSource(url,System.getenv("REFUND_TEST_DB_USER"),System.getenv("REFUND_TEST_DB_PASSWORD"));
        var jdbc=new JdbcTemplate(ds);assertEquals("craves_refund_test",jdbc.queryForObject("SELECT current_database()",String.class));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema")
            .locations("classpath:db/migration").target("133").load().migrate();
        UUID id=UUID.randomUUID(),event=UUID.randomUUID();
        jdbc.update("INSERT INTO payment_schema.refund(id,refund_ref,amount,currency,status,attempt_count,last_error,provider) VALUES (?, ?, 12.34,'INR','DEAD_LETTER',8,'Historical unknown HTTP 400','RAZORPAY')",id,"CRV"+id.toString().replace("-",""));
        String oldKey="REFUND_STATUS_CHANGED:"+id+":REFUND_FAILED:FAILED";
        jdbc.update("""
            INSERT INTO payment_schema.refund_status_outbox(id,event_key,aggregate_id,event_type,event_version,
              correlation_id,causation_id,subject,payload,status,published_at)
            VALUES (?, ?, ?, 'REFUND_STATUS_CHANGED','1.0',?,?,?,'{"data":{"status":"REFUND_FAILED"}}','PUBLISHED',now())
            """,event,oldKey,id,UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID());
        var before=jdbc.queryForMap("SELECT status,attempt_count,last_error,provider_payload,created_at,updated_at FROM payment_schema.refund WHERE id=?",id);
        var beforeEvent=jdbc.queryForMap("SELECT * FROM payment_schema.refund_status_outbox WHERE id=?",event);
        var latest=Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema").locations("classpath:db/migration").load();
        assertEquals("133",latest.info().current().getVersion().getVersion());
        var pending=java.util.Arrays.stream(latest.info().pending()).map(m->m.getVersion().getVersion()).toList();
        // V134 is the separately reviewed manual channel; V135 has never existed.
        // Both the isolated refund branch and the combined release start from real production V133.
        assertTrue(pending.equals(java.util.List.of("136")) || pending.equals(java.util.List.of("134","136")),pending.toString());
        assertEquals(pending.size(),latest.migrate().migrationsExecuted);latest.validate();assertEquals(0,latest.migrate().migrationsExecuted);
        assertEquals(before,jdbc.queryForMap("SELECT status,attempt_count,last_error,provider_payload,created_at,updated_at FROM payment_schema.refund WHERE id=?",id));
        assertEquals(beforeEvent,jdbc.queryForMap("SELECT * FROM payment_schema.refund_status_outbox WHERE id=?",event));
        assertNull(jdbc.queryForObject("SELECT dispatch_protocol FROM payment_schema.refund WHERE id=?",String.class,id));
        assertThrows(RuntimeException.class,()->jdbc.update("""
            UPDATE payment_schema.refund SET dispatch_protocol='RAZORPAY_REFUND_IDEMPOTENCY_V1',dispatch_request_body='{}',
             dispatch_request_sha256=encode(sha256(convert_to('{}','UTF8')),'hex'),dispatch_started_at=now() WHERE id=?
            """,id));
    }
}
