package in.craves.subscription.plan;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.subscription.exception.ApiException;
import in.craves.subscription.plan.ChefPlanModels.ChefPlanInput;
import in.craves.subscription.plan.ChefPlanModels.ChefPlanResponse;
import in.craves.subscription.repository.SubscriptionRepository;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Real-PostgreSQL checks for the Chef plan photo upsert, the accepting-subscribers switch and the active-subscriber count; runs only against the disposable CI database. */
@EnabledIfEnvironmentVariable(named = "SUBSCRIPTION_TEST_JDBC_URL", matches = ".+")
@ResourceLock("disposable-subscription-migration-schema")
class ChefPlanImageDatabaseTest {
    private static final Timestamp LONG_AGO = Timestamp.from(Instant.parse("2020-01-01T00:00:00Z"));

    private final UUID chef = UUID.randomUUID();
    private final UUID otherChef = UUID.randomUUID();
    private JdbcTemplate db;
    private ChefPlanRepository plans;
    private PlanImageRepository images;

    @BeforeEach
    void migrateDisposableSchema() {
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url = System.getenv("SUBSCRIPTION_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var dataSource = new DriverManagerDataSource(url, System.getenv("SUBSCRIPTION_TEST_DB_USER"), System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        db = new JdbcTemplate(dataSource);
        assertEquals("subscription_schema_test", db.queryForObject("SELECT current_database()", String.class));
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");
        db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(dataSource).defaultSchema("public").table("subscription_service_flyway_schema_history")
            .locations("classpath:db/migration").load().migrate();
        plans = new ChefPlanRepository(db);
        images = new PlanImageRepository(db);
    }

    @Test
    void firstUploadInsertsAndEveryReplaceKeepsOneRowAndAdvancesBothTimestamps() {
        UUID plan = draftPlan(chef);
        assertNull(plans.requireOwned(plan, chef).imageUrl());

        images.upsert(plan, chef, "image/jpeg", new byte[] {1, 2, 3});
        assertEquals(1, imageRows(plan));
        assertEquals("image/jpeg", images.findImage(plan).orElseThrow().contentType());
        assertNotNull(plans.requireOwned(plan, chef).imageUrl());

        // Age both rows so the assertions below prove the replace itself bumped them.
        db.update("UPDATE subscription_schema.subscription_plan_image SET updated_at = ? WHERE plan_id = ?", LONG_AGO, plan);
        db.update("UPDATE subscription_schema.subscription_plan SET updated_at = ? WHERE id = ?", LONG_AGO, plan);
        String oldPath = PlanImageRepository.imagePath(plan, LONG_AGO.toInstant());

        byte[] replacement = {9, 8, 7, 6, 5};
        images.upsert(plan, chef, "image/png", replacement);

        assertEquals(1, imageRows(plan));
        PlanImageRepository.PlanImage stored = images.findImage(plan).orElseThrow();
        assertEquals("image/png", stored.contentType());
        assertArrayEquals(replacement, stored.bytes());
        assertEquals(replacement.length, db.queryForObject(
            "SELECT size_bytes FROM subscription_schema.subscription_plan_image WHERE plan_id = ?", Integer.class, plan));
        assertEquals(chef, db.queryForObject(
            "SELECT updated_by_identity_id FROM subscription_schema.subscription_plan_image WHERE plan_id = ?", UUID.class, plan));
        assertTrue(images.findUpdatedAt(plan).orElseThrow().isAfter(LONG_AGO.toInstant()));
        assertTrue(db.queryForObject("SELECT updated_at FROM subscription_schema.subscription_plan WHERE id = ?", Timestamp.class, plan)
            .toInstant().isAfter(LONG_AGO.toInstant()));
        String newPath = plans.requireOwned(plan, chef).imageUrl();
        assertEquals(images.findImagePath(plan), newPath);
        assertFalse(oldPath.equals(newPath));
    }

    @Test
    void uploadIsRefusedAndNothingIsWrittenWhenThePlanIsNotAnEditableOnePlanOfTheCaller() {
        UUID pending = draftPlan(chef);
        db.update("UPDATE subscription_schema.subscription_plan SET status = 'PENDING_APPROVAL' WHERE id = ?", pending);
        UUID rejected = draftPlan(chef);
        db.update("UPDATE subscription_schema.subscription_plan SET status = 'REJECTED' WHERE id = ?", rejected);
        UUID foreign = draftPlan(otherChef);

        ApiException conflict = assertThrows(ApiException.class, () -> images.upsert(pending, chef, "image/jpeg", new byte[] {1}));
        assertEquals("PLAN_EDIT_CONFLICT", conflict.getCode());
        assertThrows(ApiException.class, () -> images.upsert(foreign, chef, "image/jpeg", new byte[] {1}));
        assertEquals(0, imageRows(pending));
        assertEquals(0, imageRows(foreign));

        images.upsert(rejected, chef, "image/png", new byte[] {1});
        assertEquals(1, imageRows(rejected));
        assertEquals("REJECTED", plans.requireOwned(rejected, chef).status());
    }

    @Test
    void acceptingSubscribersDefaultsOnAndTheSwitchRoundTripsWithoutTouchingStatusOrSubscriptions() {
        UUID plan = draftPlan(chef);
        assertTrue(plans.requireOwned(plan, chef).acceptingSubscribers());
        db.update("UPDATE subscription_schema.subscription_plan SET status = 'ACTIVE' WHERE id = ?", plan);
        UUID subscription = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date) "
            + "VALUES (?,?,?,?,'ACTIVE',?)", subscription, UUID.randomUUID(), plan, chef, LocalDate.now());

        ChefPlanResponse off = plans.setAcceptingSubscribers(plan, chef, false);
        assertFalse(off.acceptingSubscribers());
        assertEquals("ACTIVE", off.status());
        assertFalse(plans.requireOwned(plan, chef).acceptingSubscribers());
        assertFalse(new SubscriptionRepository(db).isPlanAcceptingSubscribers(plan));

        ChefPlanResponse on = plans.setAcceptingSubscribers(plan, chef, true);
        assertTrue(on.acceptingSubscribers());
        assertEquals("ACTIVE", on.status());
        assertTrue(new SubscriptionRepository(db).isPlanAcceptingSubscribers(plan));

        assertEquals("ACTIVE", db.queryForObject(
            "SELECT status FROM subscription_schema.customer_subscription WHERE id = ?", String.class, subscription));
    }

    @Test
    void switchIsRefusedForPlansThatAreNotActiveOrNotOwned() {
        UUID draft = draftPlan(chef);
        ApiException notActive = assertThrows(ApiException.class, () -> plans.setAcceptingSubscribers(draft, chef, false));
        assertEquals("PLAN_NOT_ACTIVE", notActive.getCode());
        assertTrue(plans.requireOwned(draft, chef).acceptingSubscribers());

        UUID foreign = draftPlan(otherChef);
        db.update("UPDATE subscription_schema.subscription_plan SET status = 'ACTIVE' WHERE id = ?", foreign);
        assertThrows(ApiException.class, () -> plans.setAcceptingSubscribers(foreign, chef, false));
        assertTrue(plans.requireOwned(foreign, otherChef).acceptingSubscribers());
    }

    @Test
    void activeSubscriberCountIsActiveOnly_pausedIsNotCountedBecauseAPausedSubscriptionGetsNoMealsAndHoldsNoCapacity() {
        UUID busy = draftPlan(chef);
        UUID empty = draftPlan(chef);
        UUID someoneElses = draftPlan(otherChef);
        for (String status : new String[] {"ACTIVE", "ACTIVE", "PAUSED", "CANCELLED", "PENDING_PAYMENT", "PAYMENT_FAILED", "EXPIRED"}) {
            subscribe(busy, chef, status);
        }
        subscribe(someoneElses, otherChef, "ACTIVE");

        assertEquals(2, plans.requireOwned(busy, chef).activeSubscriberCount());
        assertEquals(0, plans.requireOwned(empty, chef).activeSubscriberCount());
        assertEquals(2, plans.find(busy).orElseThrow().activeSubscriberCount());

        // The list answers every plan of the chef in one statement and never counts another chef's plan.
        var counts = plans.listOwned(chef).stream().collect(java.util.stream.Collectors.toMap(ChefPlanResponse::id, ChefPlanResponse::activeSubscriberCount));
        assertEquals(java.util.Map.of(busy, 2, empty, 0), counts);
        assertEquals(1, plans.listOwned(otherChef).get(0).activeSubscriberCount());
    }

    private void subscribe(UUID plan, UUID owner, String status) {
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date) "
            + "VALUES (?,?,?,?,?,?)", UUID.randomUUID(), UUID.randomUUID(), plan, owner, status, LocalDate.now());
    }

    private UUID draftPlan(UUID owner) {
        return plans.create(owner, "MEAL-" + UUID.randomUUID().toString().substring(0, 12).toUpperCase(), new ChefPlanInput(
            "Weekly lunches", "Home lunches", "WEEKLY", new BigDecimal("1200.00"), "INR")).id();
    }

    private int imageRows(UUID plan) {
        return db.queryForObject("SELECT count(*) FROM subscription_schema.subscription_plan_image WHERE plan_id = ?", Integer.class, plan);
    }
}
