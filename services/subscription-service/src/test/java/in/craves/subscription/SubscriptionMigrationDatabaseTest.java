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
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import in.craves.subscription.policy.DefaultSubscriptionPolicyService;
import in.craves.subscription.policy.SubscriptionPolicyRepository;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer.OrderAnnotation;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.dao.DataIntegrityViolationException;
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
        assertTrue("true".equals(System.getenv("GITHUB_ACTIONS")) || "True".equals(System.getenv("TF_BUILD"))
            || "YES_LOCAL_DISPOSABLE_SUBSCRIPTION_ONLY".equals(System.getenv("CRAVES_LOCAL_DISPOSABLE_PARITY")),
            "Only CI or explicitly acknowledged local disposable parity may run");
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
        assertEquals(32, manifest.path("relations").size());
        assertEquals(5, manifest.path("functions").size());
        assertEquals(6, manifest.path("triggers").size());
        assertTrue(manifest.path("policies").isArray());
        assertEquals(0, manifest.path("policies").size());
        assertTrue(manifest.path("sequences").isArray());
        assertEquals(0, manifest.path("sequences").size());
        return SubscriptionSchemaSnapshot.canonical(manifest);
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
        for (int version = 2; version <= 18; version++) versions.add(Integer.toString(version));
        return versions;
    }

    @Test @Order(1)
    void cleanV1ThroughV18ApplyAllNineteenSqlMigrationsAndReplayWithoutSchemaChanges() throws IOException {
        resetFixtureOnly();
        Flyway clean = flyway(null, "0");
        assertEquals(19, clean.migrate().migrationsExecuted);
        clean.validate();
        assertEquals(expectedVersions(true), sqlVersions());
        assertEquals(19, jdbc.queryForObject("SELECT count(*) FROM public." + HISTORY + " WHERE success", Integer.class));
        assertEquals("true", jdbc.queryForObject(
            "SELECT column_default FROM information_schema.columns WHERE table_schema='subscription_schema' "
                + "AND table_name='subscription_plan' AND column_name='accepting_subscribers'", String.class));
        assertEquals("NO", jdbc.queryForObject(
            "SELECT is_nullable FROM information_schema.columns WHERE table_schema='subscription_schema' "
                + "AND table_name='subscription_plan' AND column_name='accepting_subscribers'", String.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('subscription_schema.subscription_plan_image')::text", String.class));
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
        assertEquals(17, upgraded.migrate().migrationsExecuted);
        upgraded.validate();
        assertEquals(expectedVersions(false), sqlVersions());
        assertEquals(19, jdbc.queryForObject("SELECT count(*) FROM public." + HISTORY + " WHERE success", Integer.class));
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

    private static final String OLD_DEFAULT_NOTE =
        "Craves platform default: customer self-service pause, resume, cancel and skip are disabled until explicitly configured.";
    private static final String NEW_DEFAULT_NOTE =
        "Craves platform default: customer self-service pause, resume, cancel and skip are enabled. "
            + "Pause and cancel apply to meals not yet sent to the kitchen; skip and resume need 24 hours notice.";

    private UUID insertPlan() {
        UUID plan = UUID.randomUUID();
        jdbc.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,name,billing_period,amount) VALUES (?,?,'Policy fixture plan','WEEKLY',100.00)",
            plan, "policy-fixture-" + plan);
        return plan;
    }

    /** All other flags are off; {@code pauseEnabled} also sets a 90 minute pause cutoff so the row is a customised policy. */
    private void insertPolicy(UUID plan, String status, String notes, UUID actor, boolean pauseEnabled) {
        jdbc.update("INSERT INTO subscription_schema.subscription_plan_policy (id, plan_id, version, status, "
                + "customer_pause_enabled, customer_resume_enabled, customer_cancel_enabled, customer_skip_enabled, "
                + "pause_cutoff_minutes, resume_lead_minutes, cancel_cutoff_minutes, skip_cutoff_minutes, notes, "
                + "created_by_identity_id, activated_at) VALUES (?, ?, 1, ?, ?, FALSE, FALSE, FALSE, "
                + (pauseEnabled ? "90" : "NULL") + ", NULL, NULL, NULL, ?, ?, now())",
            UUID.randomUUID(), plan, status, pauseEnabled, notes, actor);
    }

    /**
     * An ACTIVE, all-flags-off policy still carrying the old default note that differs from the untouched default in exactly
     * one column (what an admin-saved policy that kept the pre-filled note looks like), so it must never be rewritten.
     */
    private void insertAllOffPolicy(UUID plan, int version, String differingColumn, Object differingValue, UUID actor) {
        jdbc.update("INSERT INTO subscription_schema.subscription_plan_policy (id, plan_id, version, status, "
                + "customer_pause_enabled, customer_resume_enabled, customer_cancel_enabled, customer_skip_enabled, notes, "
                + "created_by_identity_id, activated_at, " + differingColumn + ") VALUES (?, ?, ?, 'ACTIVE', FALSE, FALSE, FALSE, FALSE, ?, ?, now(), ?)",
            UUID.randomUUID(), plan, version, OLD_DEFAULT_NOTE, actor, differingValue);
    }

    private Map<String, Object> activePolicyRow(UUID plan) {
        return jdbc.queryForMap("SELECT * FROM subscription_schema.subscription_plan_policy WHERE plan_id=? AND status='ACTIVE'", plan);
    }

    private List<Object> policyShape(UUID plan, String status) {
        var row = jdbc.queryForMap("SELECT customer_pause_enabled, customer_resume_enabled, customer_cancel_enabled, customer_skip_enabled, "
                + "pause_cutoff_minutes, resume_lead_minutes, cancel_cutoff_minutes, skip_cutoff_minutes, notes "
                + "FROM subscription_schema.subscription_plan_policy WHERE plan_id=? AND status=?", plan, status);
        return Arrays.asList(row.get("customer_pause_enabled"), row.get("customer_resume_enabled"),
            row.get("customer_cancel_enabled"), row.get("customer_skip_enabled"), row.get("pause_cutoff_minutes"),
            row.get("resume_lead_minutes"), row.get("cancel_cutoff_minutes"), row.get("skip_cutoff_minutes"), row.get("notes"));
    }

    private int auditCount(UUID plan, String action) {
        return jdbc.queryForObject("SELECT count(*) FROM subscription_schema.subscription_plan_policy_audit WHERE plan_id=? AND action=?",
            Integer.class, plan, action);
    }

    @Test @Order(3)
    void defaultPolicyIsSelfServiceForNewPlansAndUntouchedExistingPlansOnly() {
        resetFixtureOnly();
        assertEquals(18, flyway("17", "0").migrate().migrationsExecuted);

        UUID creator = UUID.randomUUID(), admin = UUID.randomUUID();
        UUID untouched = insertPlan(), customised = insertPlan(), editedDefault = insertPlan(), retired = insertPlan();
        insertPolicy(untouched, "ACTIVE", OLD_DEFAULT_NOTE, creator, false);
        insertPolicy(customised, "ACTIVE", "Admin tuned lifecycle policy", admin, true);
        insertPolicy(editedDefault, "ACTIVE", OLD_DEFAULT_NOTE, admin, true);
        insertPolicy(retired, "INACTIVE", OLD_DEFAULT_NOTE, admin, false);
        // Later version with one cutoff set, and a version 1 row with one reference set: both all-off with the old note.
        UUID laterVersion = insertPlan(), withReference = insertPlan();
        insertAllOffPolicy(laterVersion, 2, "resume_lead_minutes", 60, admin);
        insertAllOffPolicy(withReference, 1, "holiday_policy_reference", "Closed on public holidays", admin);
        Map<String, Object> laterVersionBefore = activePolicyRow(laterVersion);
        Map<String, Object> withReferenceBefore = activePolicyRow(withReference);
        List<Object> customisedBefore = policyShape(customised, "ACTIVE");
        List<Object> editedDefaultBefore = policyShape(editedDefault, "ACTIVE");
        List<Object> retiredBefore = policyShape(retired, "INACTIVE");

        assertEquals(1, flyway(null, "0").migrate().migrationsExecuted);

        // The untouched platform default is switched on and audited once, attributed to the policy creator.
        assertEquals(Arrays.asList(true, true, true, true, 0, 1440, 0, 1440, NEW_DEFAULT_NOTE), policyShape(untouched, "ACTIVE"));
        assertEquals(1, auditCount(untouched, "PLATFORM_DEFAULT_UPDATE"));
        var audit = jdbc.queryForMap("SELECT actor_identity_id, policy_version, reason FROM subscription_schema.subscription_plan_policy_audit "
            + "WHERE plan_id=? AND action='PLATFORM_DEFAULT_UPDATE'", untouched);
        assertEquals(creator, audit.get("actor_identity_id"));
        assertEquals(1, audit.get("policy_version"));
        assertEquals(NEW_DEFAULT_NOTE, audit.get("reason"));
        // Customised, edited-default and retired policies are left alone.
        assertEquals(customisedBefore, policyShape(customised, "ACTIVE"));
        assertEquals(editedDefaultBefore, policyShape(editedDefault, "ACTIVE"));
        assertEquals(retiredBefore, policyShape(retired, "INACTIVE"));
        // A later-version policy with a cutoff, and a version 1 policy with a reference, are untouched row for row (even updated_at).
        assertEquals(laterVersionBefore, activePolicyRow(laterVersion));
        assertEquals(withReferenceBefore, activePolicyRow(withReference));
        assertEquals(Arrays.asList(false, false, false, false, null, 60, null, null, OLD_DEFAULT_NOTE), policyShape(laterVersion, "ACTIVE"));
        for (UUID plan : List.of(customised, editedDefault, retired, laterVersion, withReference)) assertEquals(0, auditCount(plan, "PLATFORM_DEFAULT_UPDATE"));
        // Existing plans accept subscribers after the column is added.
        assertEquals(Boolean.TRUE, jdbc.queryForObject("SELECT accepting_subscribers FROM subscription_schema.subscription_plan WHERE id=?", Boolean.class, untouched));

        // A policy created for a new plan has the same values and note.
        UUID fresh = insertPlan();
        new DefaultSubscriptionPolicyService(jdbc, new SubscriptionPolicyRepository(jdbc)).ensureActiveDefault(fresh, creator);
        assertEquals(Arrays.asList(true, true, true, true, 0, 1440, 0, 1440, NEW_DEFAULT_NOTE), policyShape(fresh, "ACTIVE"));
        assertEquals(1, auditCount(fresh, "PLATFORM_DEFAULT_ACTIVATE"));

        // The plan image table accepts a valid image and rejects an unsupported type or an empty body.
        jdbc.update("INSERT INTO subscription_schema.subscription_plan_image(plan_id,content_type,image_bytes,size_bytes,updated_by_identity_id) VALUES (?,'image/png',?,3,?)",
            fresh, new byte[] {1, 2, 3}, creator);
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
            "INSERT INTO subscription_schema.subscription_plan_image(plan_id,content_type,image_bytes,size_bytes,updated_by_identity_id) VALUES (?,'image/gif',?,3,?)",
            untouched, new byte[] {1, 2, 3}, creator));
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update(
            "INSERT INTO subscription_schema.subscription_plan_image(plan_id,content_type,image_bytes,size_bytes,updated_by_identity_id) VALUES (?,'image/png',?,0,?)",
            untouched, new byte[0], creator));
    }
}
