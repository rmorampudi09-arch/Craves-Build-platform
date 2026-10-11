package in.craves.subscription.repository;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.subscription.lifecycle.SubscriptionLifecycleModels.CustomerOccurrenceResponse;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository;
import in.craves.subscription.plan.PlanImageRepository;
import in.craves.subscription.plan.PlanImageRepository.PlanImage;
import in.craves.subscription.web.ApiDtos.PlanResponse;
import in.craves.subscription.web.ApiDtos.SubscriptionResponse;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Real-PostgreSQL checks for the meal plan presentation fields; runs only against the disposable CI database. */
@EnabledIfEnvironmentVariable(named = "SUBSCRIPTION_TEST_JDBC_URL", matches = ".+")
@ResourceLock("disposable-subscription-migration-schema")
class SubscriptionPresentationDatabaseTest {
    private static final Instant IMAGE_UPDATED_AT = Instant.parse("2026-10-01T00:00:00Z");

    private final UUID chef = UUID.randomUUID();
    private final UUID customer = UUID.randomUUID();
    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
    private JdbcTemplate db;
    private List<SubscriptionRepository> repositories;

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
        repositories = List.of(new SubscriptionRepository(db), new PostgresCompatibleSubscriptionRepository(db));
    }

    @Test
    void publicListHidesPlansNotAcceptingSubscribersWhileDetailAndAdminListingStillSeeThem() {
        UUID open = activePlan("Open plan", true);
        UUID closed = activePlan("Closed plan", false);

        for (SubscriptionRepository repository : repositories) {
            List<UUID> listed = repository.listPlans(true).stream().map(PlanResponse::id).toList();
            assertTrue(listed.contains(open));
            assertFalse(listed.contains(closed));
            assertTrue(repository.findActivePlanById(closed).isPresent());
            assertTrue(repository.listPlans(false).stream().map(PlanResponse::id).toList().contains(closed));
            assertTrue(repository.isPlanAcceptingSubscribers(open));
            assertFalse(repository.isPlanAcceptingSubscribers(closed));
            assertFalse(repository.isPlanAcceptingSubscribers(UUID.randomUUID()));
        }
    }

    @Test
    void subscriptionReadsCarryPlanSummaryNextBillingDateAndImagePath() {
        UUID plan = activePlan("Weekly meals", true);
        UUID subscription = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date,"
                + "next_billing_date,delivery_address_id,enrollment_idempotency_key) VALUES (?,?,?,?,'ACTIVE',?,?,?,'enroll-key-0001')",
            subscription, customer, plan, chef, today, today.plusDays(7), UUID.randomUUID());

        for (SubscriptionResponse row : readEveryWay(subscription)) {
            assertEquals("Weekly meals", row.planName());
            assertEquals("WEEKLY", row.billingPeriod());
            assertEquals(0, row.amount().compareTo(new BigDecimal("1200.00")));
            assertEquals("INR", row.currency());
            assertEquals(today.plusDays(7), row.nextBillingDate());
            assertNull(row.planImageUrl());
        }

        insertImage(plan, "image/png", new byte[] {1, 2, 3});
        String expected = "/api/v1/subscriptions/plans/" + plan + "/image?v=" + IMAGE_UPDATED_AT.getEpochSecond();
        for (SubscriptionResponse row : readEveryWay(subscription)) {
            assertEquals(expected, row.planImageUrl());
        }
    }

    @Test
    void occurrencesCarryTheOrderIdOnlyOnceAnOrderWasCreated() {
        UUID plan = activePlan("Weekly meals", true);
        UUID subscription = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.customer_subscription(id,customer_identity_id,plan_id,chef_identity_id,status,start_date) "
            + "VALUES (?,?,?,?,'ACTIVE',?)", subscription, customer, plan, chef, today);
        UUID withOrder = UUID.randomUUID();
        UUID withoutOrder = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        occurrence(withOrder, subscription, plan, today, "ORDER_CREATED", orderId);
        occurrence(withoutOrder, subscription, plan, today.plusDays(1), "READY_FOR_ORDER", null);

        List<CustomerOccurrenceResponse> listed = new SubscriptionLifecycleRepository(db).listOccurrences(subscription, customer, 10);

        assertEquals(2, listed.size());
        assertEquals(orderId, listed.stream().filter(item -> item.id().equals(withOrder)).findFirst().orElseThrow().orderId());
        assertNull(listed.stream().filter(item -> item.id().equals(withoutOrder)).findFirst().orElseThrow().orderId());
    }

    @Test
    void planImageRepositoryReturnsBytesContentTypeAndVersionedPathOnlyWhenARowExists() {
        UUID plan = activePlan("Weekly meals", true);
        PlanImageRepository images = new PlanImageRepository(db);

        assertTrue(images.findImage(plan).isEmpty());
        assertTrue(images.findUpdatedAt(plan).isEmpty());
        assertNull(images.findImagePath(plan));

        insertImage(plan, "image/webp", new byte[] {9, 8, 7, 6});

        PlanImage image = images.findImage(plan).orElseThrow();
        assertEquals("image/webp", image.contentType());
        assertArrayEquals(new byte[] {9, 8, 7, 6}, image.bytes());
        assertEquals(IMAGE_UPDATED_AT, images.findUpdatedAt(plan).orElseThrow());
        assertEquals("/api/v1/subscriptions/plans/" + plan + "/image?v=" + IMAGE_UPDATED_AT.getEpochSecond(), images.findImagePath(plan));
    }

    private List<SubscriptionResponse> readEveryWay(UUID subscription) {
        return repositories.stream().flatMap(repository -> Stream.of(
            repository.findSubscriptionById(subscription).orElseThrow(),
            repository.listCustomerSubscriptions(customer).getFirst(),
            repository.findSubscriptionByEnrollmentKey(customer, "enroll-key-0001").orElseThrow()
        )).toList();
    }

    private UUID activePlan(String name, boolean acceptingSubscribers) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount,status,accepting_subscribers) "
            + "VALUES (?,?,?,?,'WEEKLY',1200.00,'ACTIVE',?)", id, "TEST-" + id, chef, name, acceptingSubscribers);
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule(plan_id,recurrence_type,timezone,service_time,generation_lead_hours,"
            + "status,created_by_identity_id,activated_at) VALUES (?,'WEEKLY','Asia/Kolkata','12:30',24,'ACTIVE',?,now())", id, chef);
        db.update("INSERT INTO subscription_schema.subscription_plan_policy(id,plan_id,version,status,customer_pause_enabled,customer_resume_enabled,"
            + "customer_cancel_enabled,customer_skip_enabled,created_by_identity_id,activated_at) VALUES (?,?,1,'ACTIVE',FALSE,FALSE,FALSE,FALSE,?,now())",
            UUID.randomUUID(), id, chef);
        return id;
    }

    private void insertImage(UUID plan, String contentType, byte[] bytes) {
        db.update("INSERT INTO subscription_schema.subscription_plan_image(plan_id,content_type,image_bytes,size_bytes,updated_by_identity_id,updated_at) "
            + "VALUES (?,?,?,?,?,?)", plan, contentType, bytes, bytes.length, chef, Timestamp.from(IMAGE_UPDATED_AT));
    }

    private void occurrence(UUID id, UUID subscription, UUID plan, LocalDate serviceDate, String status, UUID orderId) {
        db.update("INSERT INTO subscription_schema.subscription_occurrence(id,subscription_id,plan_id,customer_identity_id,chef_identity_id,"
                + "delivery_address_id,service_date,service_at,schedule_version,status,meal_slot_code,order_id) VALUES (?,?,?,?,?,?,?,?,1,?,'LUNCH',?)",
            id, subscription, plan, customer, chef, UUID.randomUUID(), serviceDate, Timestamp.from(Instant.now().plusSeconds(86400)), status, orderId);
    }
}
