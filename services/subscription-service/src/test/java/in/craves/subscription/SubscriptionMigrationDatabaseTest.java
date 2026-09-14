package in.craves.subscription;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Date;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer.OrderAnnotation;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Full real-PostgreSQL migration parity; destructive work is confined to the explicitly disposable CI database. */
@EnabledIfEnvironmentVariable(named = "SUBSCRIPTION_TEST_JDBC_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(OrderAnnotation.class)
@ResourceLock("disposable-subscription-migration-schema")
class SubscriptionMigrationDatabaseTest {
    private static final String HISTORY = "subscription_service_flyway_schema_history";
    private static final int MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
    private static final ObjectMapper JSON = new ObjectMapper();
    private DriverManagerDataSource data;
    private JdbcTemplate jdbc;
    private String auditSql;
    private JsonNode cleanManifest;

    @BeforeAll void strictlyDisposableDatabaseOnly() throws IOException {
        assertEquals("true", System.getenv("GITHUB_ACTIONS"), "Only disposable GitHub CI may run migration parity");
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url = System.getenv("SUBSCRIPTION_TEST_JDBC_URL");
        assertNotNull(url);
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"),
            "Only the exact loopback subscription_schema_test database is permitted; queries and tunnels are refused");
        data = new DriverManagerDataSource(url, System.getenv("SUBSCRIPTION_TEST_DB_USER"),
            System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(data);
        try (var input = getClass().getResourceAsStream("/subscription-schema-audit.sql")) {
            assertNotNull(input, "The shared read-only structural audit SQL must be packaged as a test resource");
            auditSql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private Flyway flyway(String target, String baseline) {
        var configuration = Flyway.configure().dataSource(data).defaultSchema("public").schemas("public")
            .table(HISTORY).locations("classpath:db/migration").baselineVersion(baseline);
        if (target != null) configuration.target(target);
        return configuration.load();
    }

    private void resetFixtureOnly() {
        // The class-level guard has run before either ordered test. Never reset public or unrelated service schemas.
        jdbc.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");
        jdbc.execute("DROP TABLE IF EXISTS public." + HISTORY);
    }

    private JsonNode readManifest() throws IOException {
        String raw = jdbc.execute((ConnectionCallback<String>) connection -> {
            connection.setReadOnly(true);
            connection.setAutoCommit(false);
            try (var statement = connection.createStatement()) {
                statement.setQueryTimeout(15);
                statement.execute("SET LOCAL search_path = pg_catalog");
                try (var rows = statement.executeQuery(auditSql)) {
                    assertTrue(rows.next(), "Structural audit must return exactly one row");
                    StringBuilder output = new StringBuilder();
                    try (var reader = rows.getCharacterStream(1)) {
                        assertNotNull(reader);
                        char[] chunk = new char[8192];
                        for (int count; (count = reader.read(chunk)) != -1;) {
                            if (output.length() + count > MAX_MANIFEST_BYTES) throw new SQLException("Structural audit exceeds the output bound");
                            output.append(chunk, 0, count);
                        }
                    } catch (IOException failure) {
                        throw new SQLException("Structural audit could not be read", failure);
                    }
                    assertFalse(rows.next(), "Structural audit must return exactly one row");
                    if (output.toString().getBytes(StandardCharsets.UTF_8).length > MAX_MANIFEST_BYTES)
                        throw new SQLException("Structural audit exceeds the output bound");
                    return output.toString();
                }
            } finally {
                connection.rollback();
            }
        });
        assertNotNull(raw);
        JsonNode manifest = JSON.readTree(raw);
        assertTrue(manifest.isObject(), "Structural audit must return one JSON object");
        assertFalse(manifest.isEmpty(), "An empty audit cannot establish migration parity");
        assertTrue(manifest.path("schemaExists").asBoolean());
        assertEquals(31, manifest.path("relations").size());
        assertEquals(5, manifest.path("functions").size());
        assertEquals(6, manifest.path("triggers").size());
        assertTrue(manifest.path("policies").isArray());
        assertEquals(0, manifest.path("policies").size());
        assertTrue(manifest.path("sequences").isArray());
        assertEquals(0, manifest.path("sequences").size());
        return manifest;
    }

    private JsonNode exportManifest(String name) throws IOException {
        JsonNode manifest = readManifest();
        var envelope = JSON.createObjectNode();
        String sourceSha = System.getenv("EXPECTED_RELEASE_SHA");
        if (sourceSha != null) {
            assertTrue(sourceSha.matches("[0-9a-fA-F]{40}"), "Expected release SHA must be exact when provided");
            envelope.put("sourceSha", sourceSha);
        }
        String serverVersion = jdbc.queryForObject("SELECT current_setting('server_version_num')", String.class);
        envelope.put("serverVersionNum", serverVersion);
        envelope.put("serverMajor", Integer.parseInt(serverVersion) / 10000);
        envelope.put("observedAt", Instant.now().toString());
        try {
            envelope.put("auditSqlSha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(auditSql.getBytes(StandardCharsets.UTF_8))));
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("SHA-256 is required", unavailable);
        }
        envelope.set("schema", manifest);
        Path directory = Path.of("target", "subscription-schema");
        Files.createDirectories(directory);
        JSON.writerWithDefaultPrettyPrinter().writeValue(directory.resolve(name + ".json").toFile(), envelope);
        return manifest;
    }

    private List<String> sqlVersions() {
        return jdbc.query("SELECT version FROM public." + HISTORY + " WHERE success AND type='SQL' ORDER BY installed_rank",
            (row, index) -> row.getString(1));
    }

    private List<String> expectedVersions(boolean includeOne) {
        List<String> versions = new ArrayList<>();
        if (includeOne) versions.add("1");
        versions.add("1.1");
        for (int version = 2; version <= 17; version++) versions.add(Integer.toString(version));
        return versions;
    }

    @Test @Order(1)
    void cleanV1ThroughV17ApplyAllEighteenSqlMigrationsAndReplayWithoutSchemaChanges() throws IOException {
        resetFixtureOnly();
        Flyway clean = flyway(null, "0");
        assertEquals(18, clean.migrate().migrationsExecuted);
        clean.validate();
        assertEquals(expectedVersions(true), sqlVersions());
        assertEquals(18, jdbc.queryForObject("SELECT count(*) FROM public." + HISTORY + " WHERE success", Integer.class));
        cleanManifest = exportManifest("clean");
        assertEquals(0, clean.migrate().migrationsExecuted);
        clean.validate();
        assertEquals(cleanManifest, readManifest());
    }

    @Test @Order(2)
    void historicalBaselineOneRepairsMissingCoreAndConvergesWithoutRewritingHistoryOrRecords() throws IOException {
        assertNotNull(cleanManifest, "The ordered clean migration is the independent parity reference");
        resetFixtureOnly();
        assertNull(jdbc.queryForObject("SELECT to_regnamespace('subscription_schema')::text", String.class));
        // This explicit baseline models the historic release. It is never used for production repair.
        flyway(null, "1").baseline();
        var baselineRow = jdbc.queryForMap("SELECT * FROM public." + HISTORY + " WHERE type='BASELINE'");
        assertEquals("1", jdbc.queryForObject("SELECT version FROM public." + HISTORY + " WHERE type='BASELINE'", String.class));
        assertEquals(1, flyway("1.1", "1").migrate().migrationsExecuted);
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('subscription_schema.subscription_plan')::text", String.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('subscription_schema.customer_subscription')::text", String.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('subscription_schema.subscription_status_history')::text", String.class));

        UUID plan = UUID.randomUUID(), subscription = UUID.randomUUID(), customer = UUID.randomUUID();
        jdbc.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,name,billing_period,amount) VALUES (?,?,'Historical synthetic plan','WEEKLY',123.45)",
            plan, "parity-fixture-" + plan);
        jdbc.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,start_date) VALUES (?,?,?,'2026-09-01')",
            subscription, customer, plan);
        Flyway upgraded = flyway(null, "0");
        assertEquals(16, upgraded.migrate().migrationsExecuted);
        upgraded.validate();
        assertEquals(expectedVersions(false), sqlVersions());
        assertEquals(18, jdbc.queryForObject("SELECT count(*) FROM public." + HISTORY + " WHERE success", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM public." + HISTORY + " WHERE success AND type='BASELINE' AND version='1'", Integer.class));
        assertEquals(baselineRow, jdbc.queryForMap("SELECT * FROM public." + HISTORY + " WHERE type='BASELINE'"),
            "Repair and upgrades must preserve every historical baseline field");
        assertEquals("Historical synthetic plan", jdbc.queryForObject("SELECT name FROM subscription_schema.subscription_plan WHERE id=?", String.class, plan));
        assertEquals("123.45", jdbc.queryForObject("SELECT amount::text FROM subscription_schema.subscription_plan WHERE id=?", String.class, plan));
        assertEquals(customer, jdbc.queryForObject("SELECT customer_identity_id FROM subscription_schema.customer_subscription WHERE id=?", UUID.class, subscription));
        assertEquals(Date.valueOf("2026-09-01"), jdbc.queryForObject("SELECT next_billing_date FROM subscription_schema.customer_subscription WHERE id=?", Date.class, subscription));
        JsonNode baselineManifest = exportManifest("baseline1");
        assertEquals(cleanManifest, baselineManifest, "Clean V1 and historical BASELINE1+V1.1 must converge structurally");
        assertEquals(0, upgraded.migrate().migrationsExecuted);
        upgraded.validate();
        assertEquals(baselineManifest, readManifest());
    }
}
