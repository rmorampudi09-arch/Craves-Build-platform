package in.craves.catalog.service;

import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.finance.CatalogFinanceEligibility;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.web.ApiDtos.KitchenProfileRequest;
import in.craves.catalog.web.ApiDtos.KitchenStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Handbook 008 on PostgreSQL. Destructive fixtures only in the dedicated disposable CI service container. */
@EnabledIfEnvironmentVariable(named = "CRAVES_CATALOG_DISPOSABLE_DATABASE", matches = "true")
class KitchenSuspensionDatabaseTest {
    JdbcTemplate jdbc; TransactionTemplate tx; CatalogFinanceEligibility finance; CatalogService catalog; KitchenSuspensionService suspensions;
    final UUID chef = UUID.randomUUID(), kitchen = UUID.randomUUID(), dish = UUID.randomUUID();
    final CravesPrincipal owner = new CravesPrincipal(chef, "", Set.of("CHEF"));
    final CravesPrincipal ops = new CravesPrincipal(UUID.randomUUID(), "", Set.of("OPERATIONS_ADMIN"));
    final CravesPrincipal auditor = new CravesPrincipal(UUID.randomUUID(), "", Set.of("AUDIT_ADMIN"));
    final BigDecimal lat = new BigDecimal("17.4400000"), lng = new BigDecimal("78.3900000");

    @BeforeEach void setup() {
        assertEquals("true", System.getenv("GITHUB_ACTIONS"), "Disposable CI only; never a local production tunnel");
        String url = System.getenv("CATALOG_TEST_JDBC_URL");
        assertEquals("jdbc:postgresql://localhost:5432/catalog_finance_test", url);
        var ds = new DriverManagerDataSource(url, "postgres", System.getenv("CATALOG_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds); tx = new TransactionTemplate(new DataSourceTransactionManager(ds)); jdbc.execute("DROP SCHEMA IF EXISTS catalog_schema CASCADE");
        Flyway.configure().dataSource(ds).schemas("catalog_schema").defaultSchema("catalog_schema").locations("classpath:db/migration").load().migrate();
        finance = mock(CatalogFinanceEligibility.class);
        when(finance.current()).thenReturn(new CatalogFinanceEligibility.Snapshot(UUID.randomUUID(), Instant.now(), true, UUID.randomUUID(), 1,
            UUID.randomUUID().toString().replace("-", "").repeat(2), List.of(chef)));
        catalog = new CatalogService(jdbc, mock(MediaStorageService.class), new CatalogDiscoveryProperties(), finance);
        suspensions = new KitchenSuspensionService(jdbc, finance);
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id,identity_id,kitchen_name,address_line1,city,state,latitude,longitude,status) VALUES (?,?,'Chef kitchen','Test fixture address','Hyderabad','Telangana',?,?,'ACTIVE')", kitchen, chef, lat, lng);
        jdbc.update("INSERT INTO catalog_schema.menu_item(id,kitchen_id,item_name,category,food_type,price,is_available,status,unit_package_weight_grams,thermobox_required) VALUES (?,?,'Fixture meal','Lunch','VEG',100,true,'ACTIVE',500,false)", dish, kitchen);
    }

    String status() { return jdbc.queryForObject("SELECT status FROM catalog_schema.kitchen_profile WHERE id=?", String.class, kitchen); }
    List<String> hold() { return jdbc.queryForList("SELECT prior_status FROM catalog_schema.kitchen_suspension_hold WHERE kitchen_id=?", String.class, kitchen); }
    KitchenProfileRequest save(KitchenStatus status) {
        return new KitchenProfileRequest("Chef kitchen", null, null, null, null, "Test fixture address", null, null, null, "Hyderabad", "Telangana", null, lat, lng, status, null, null, null);
    }

    /**
     * Runs {@code first} in a transaction and keeps it open until {@code second}, started in its own transaction on another
     * connection, waits for a lock that {@code first} holds; then commits {@code first}. Returns {@code second}'s outcome.
     */
    Future<?> whileLocked(Runnable first, Runnable second) {
        ExecutorService other = Executors.newSingleThreadExecutor();
        try {
            return tx.execute(s -> {
                first.run();
                Future<?> waiting = other.submit(() -> tx.executeWithoutResult(t -> second.run()));
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                // pg_locks is read afresh by every query, also inside this transaction.
                while (!jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted AND pg_backend_pid() = ANY (pg_blocking_pids(pid)))", Boolean.class))
                    assertFalse(waiting.isDone() || System.nanoTime() > deadline, "the second call never waited for the first call's lock");
                return waiting;
            });
        } finally {
            other.shutdown();
        }
    }

    @Test void chefSaveThatWaitedForASuspendKeepsTheKitchenSuspended() throws Exception {
        whileLocked(() -> suspensions.suspend(ops, kitchen, "Hygiene check"), () -> catalog.upsertMyKitchen(owner, save(KitchenStatus.ACTIVE))).get(10, TimeUnit.SECONDS);
        assertEquals("SUSPENDED", status()); assertEquals(List.of("ACTIVE"), hold());
    }

    @Test void chefSaveThatWaitedForALiftIsNotSuspendedAgain() throws Exception {
        suspensions.suspend(ops, kitchen, "Hygiene check");
        whileLocked(() -> suspensions.reinstate(ops, kitchen, "Check passed"), () -> catalog.upsertMyKitchen(owner, save(KitchenStatus.INACTIVE))).get(10, TimeUnit.SECONDS);
        assertEquals("INACTIVE", status()); assertEquals(List.of(), hold());
    }

    @Test void liftThatWaitedForAChefSaveRestoresTheStatusTheChefChose() throws Exception {
        suspensions.suspend(ops, kitchen, "Hygiene check");
        whileLocked(() -> catalog.upsertMyKitchen(owner, save(KitchenStatus.INACTIVE)), () -> suspensions.reinstate(ops, kitchen, "Check passed")).get(10, TimeUnit.SECONDS);
        assertEquals("INACTIVE", status()); assertEquals(List.of(), hold());
    }

    @Test void secondOfTwoConcurrentSuspendsIsAConflictNotAServerError() {
        var second = whileLocked(() -> suspensions.suspend(ops, kitchen, "First hold"), () -> suspensions.suspend(ops, kitchen, "Second hold"));
        var conflict = assertInstanceOf(ApiException.class, assertThrows(ExecutionException.class, () -> second.get(10, TimeUnit.SECONDS)).getCause());
        assertEquals(409, conflict.getStatus()); assertEquals("KITCHEN_ALREADY_SUSPENDED", conflict.getCode());
        assertEquals("SUSPENDED", status()); assertEquals(List.of("ACTIVE"), hold());
    }

    @Test void suspendHidesKitchenAndDishesAndReinstateRestoresActive() {
        assertEquals(1, catalog.getPublicMenuItems(kitchen).size());
        var held = suspensions.suspend(ops, kitchen, "Food safety complaint under review");
        assertTrue(held.suspended()); assertEquals("SUSPENDED", held.status()); assertEquals("ACTIVE", held.priorStatus());
        assertThrows(ApiException.class, () -> catalog.getPublicKitchen(kitchen));
        assertThrows(ApiException.class, () -> catalog.getPublicMenuItems(kitchen));
        assertThrows(ApiException.class, () -> catalog.getPublicMenuItem(dish));
        var lifted = suspensions.reinstate(ops, kitchen, "Review closed, kitchen cleared");
        assertFalse(lifted.suspended()); assertEquals("ACTIVE", status());
        assertEquals(List.of("SUSPEND", "REINSTATE"), jdbc.queryForList("SELECT action FROM catalog_schema.kitchen_suspension_audit WHERE kitchen_id=? ORDER BY id", String.class, kitchen));
    }

    @Test void chefSaveWhileHeldKeepsSuspendedAndItsStatusIsWhatReinstateRestores() {
        suspensions.suspend(ops, kitchen, "Hygiene check");
        catalog.upsertMyKitchen(owner, save(KitchenStatus.ACTIVE));
        assertEquals("SUSPENDED", status());
        catalog.upsertMyKitchen(owner, save(KitchenStatus.INACTIVE));
        assertEquals("SUSPENDED", status());
        suspensions.reinstate(ops, kitchen, "Check passed");
        assertEquals("INACTIVE", status());
        catalog.upsertMyKitchen(owner, save(KitchenStatus.ACTIVE));
        assertEquals("ACTIVE", status());
    }

    @Test void reinstateKeepsAStatusSomethingElseSetAndChecksFinanceForActive() {
        suspensions.suspend(ops, kitchen, "Hygiene check");
        jdbc.update("UPDATE catalog_schema.kitchen_profile SET status='INACTIVE' WHERE id=?", kitchen); // e.g. account erasure
        suspensions.reinstate(ops, kitchen, "Check passed");
        assertEquals("INACTIVE", status());

        jdbc.update("UPDATE catalog_schema.kitchen_profile SET status='ACTIVE' WHERE id=?", kitchen);
        suspensions.suspend(ops, kitchen, "Hygiene check again");
        doThrow(ApiException.conflict("CHEF_SELLING_NOT_READY", "x")).when(finance).requireChef(chef);
        assertThrows(ApiException.class, () -> suspensions.reinstate(ops, kitchen, "Check passed"));
        assertEquals("SUSPENDED", status());
    }

    @Test void rolesReasonsAndConflicts() {
        assertThrows(ResponseStatusException.class, () -> suspensions.suspend(auditor, kitchen, "Not allowed to write"));
        assertThrows(ResponseStatusException.class, () -> suspensions.get(owner, kitchen));
        assertFalse(suspensions.get(auditor, kitchen).suspended());
        assertThrows(ApiException.class, () -> suspensions.suspend(ops, kitchen, " a "));
        assertThrows(ApiException.class, () -> suspensions.suspend(ops, kitchen, "bad\u0000reason"));
        assertThrows(ApiException.class, () -> suspensions.reinstate(ops, kitchen, "Not suspended yet"));
        assertThrows(ApiException.class, () -> suspensions.suspend(ops, UUID.randomUUID(), "Unknown kitchen"));
        var self = new CravesPrincipal(chef, "", Set.of("PLATFORM_ADMIN"));
        assertThrows(ApiException.class, () -> suspensions.suspend(self, kitchen, "Own kitchen"));
        suspensions.suspend(ops, kitchen, "First hold");
        assertThrows(ApiException.class, () -> suspensions.suspend(ops, kitchen, "Second hold"));
        assertEquals("ACTIVE", jdbc.queryForObject("SELECT prior_status FROM catalog_schema.kitchen_suspension_hold WHERE kitchen_id=?", String.class, kitchen));
    }
}
