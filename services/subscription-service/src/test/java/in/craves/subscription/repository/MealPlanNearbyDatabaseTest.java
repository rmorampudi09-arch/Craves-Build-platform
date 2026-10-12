package in.craves.subscription.repository;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.ResourceLock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Meal plans are listed, and can be booked, only within 10 km of the chef's active kitchen. */
@EnabledIfEnvironmentVariable(named = "SUBSCRIPTION_TEST_JDBC_URL", matches = ".+")
@ResourceLock("disposable-subscription-migration-schema")
class MealPlanNearbyDatabaseTest {
    // One degree of latitude on the 6371 km sphere the distance uses.
    static final double METRES_PER_DEGREE = 111_194.93;
    static final double LAT = 17.4435, LNG = 78.3772;
    JdbcTemplate db;
    SubscriptionRepository repository;
    UUID customer = UUID.randomUUID();

    @BeforeEach void setup() {
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        String url = System.getenv("SUBSCRIPTION_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/subscription_schema_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("SUBSCRIPTION_TEST_DB_USER"), System.getenv("SUBSCRIPTION_TEST_DB_PASSWORD"));
        db = new JdbcTemplate(ds);
        assertEquals("subscription_schema_test", db.queryForObject("SELECT current_database()", String.class));
        dropForeignTables();
        db.execute("DROP SCHEMA IF EXISTS subscription_schema CASCADE");
        db.execute("DROP TABLE IF EXISTS public.subscription_service_flyway_schema_history");
        Flyway.configure().dataSource(ds).defaultSchema("public").table("subscription_service_flyway_schema_history")
            .locations("classpath:db/migration").load().migrate();
        // Owned by Catalog and User-Chef in production; only the columns read here.
        db.execute("CREATE SCHEMA catalog_schema");
        db.execute("CREATE TABLE catalog_schema.kitchen_profile (id UUID PRIMARY KEY, identity_id UUID NOT NULL UNIQUE, "
            + "latitude NUMERIC(10,7), longitude NUMERIC(10,7), status VARCHAR(32) NOT NULL)");
        db.execute("CREATE TABLE public.customer_address (id UUID PRIMARY KEY, identity_id UUID NOT NULL, "
            + "latitude NUMERIC(9,6), longitude NUMERIC(9,6), is_active BOOLEAN NOT NULL DEFAULT true)");
        repository = new PostgresCompatibleSubscriptionRepository(db);
    }

    // Other migration tests expect an empty public schema.
    @AfterEach void dropForeignTables() {
        db.execute("DROP SCHEMA IF EXISTS catalog_schema CASCADE");
        db.execute("DROP TABLE IF EXISTS public.customer_address");
    }

    UUID chefAt(double metresNorth, String kitchenStatus) {
        UUID chef = UUID.randomUUID();
        db.update("INSERT INTO catalog_schema.kitchen_profile VALUES (?,?,?,?,?)",
            UUID.randomUUID(), chef, LAT + metresNorth / METRES_PER_DEGREE, LNG, kitchenStatus);
        return chef;
    }

    UUID planFor(UUID chef) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO subscription_schema.subscription_plan(id,plan_code,chef_identity_id,name,billing_period,amount,status,accepting_subscribers) "
            + "VALUES (?,?,?,'Tiffin','WEEKLY',1200.00,'ACTIVE',TRUE)", id, "TEST-" + id, chef);
        db.update("INSERT INTO subscription_schema.subscription_plan_schedule(plan_id,recurrence_type,timezone,service_time,generation_lead_hours,"
            + "status,created_by_identity_id,activated_at) VALUES (?,'WEEKLY','Asia/Kolkata','12:30',24,'ACTIVE',?,now())", id, chef);
        db.update("INSERT INTO subscription_schema.subscription_plan_policy(id,plan_id,version,status,customer_pause_enabled,customer_resume_enabled,"
            + "customer_cancel_enabled,customer_skip_enabled,created_by_identity_id,activated_at) VALUES (?,?,1,'ACTIVE',FALSE,FALSE,FALSE,FALSE,?,now())",
            UUID.randomUUID(), id, chef);
        return id;
    }

    UUID addressFor(UUID owner, boolean active) {
        UUID id = UUID.randomUUID();
        db.update("INSERT INTO public.customer_address VALUES (?,?,?,?,?)", id, owner, LAT, LNG, active);
        return id;
    }

    List<UUID> nearby() {
        return repository.listActivePlansNear(LAT, LNG, 10_000).stream().map(p -> p.id()).toList();
    }

    @Test void listsOnlyPlansWithAnActiveKitchenWithinTenKilometres() {
        UUID inside = planFor(chefAt(9_900, "ACTIVE"));
        planFor(chefAt(10_100, "ACTIVE"));
        planFor(chefAt(500, "PAUSED"));
        planFor(UUID.randomUUID());

        assertEquals(List.of(inside), nearby());
        assertEquals(4, repository.listPlans(true).size());
    }

    @Test void bookingNeedsTheCustomersOwnActiveAddressNearTheChef() {
        UUID near = chefAt(9_900, "ACTIVE"), far = chefAt(10_100, "ACTIVE");
        UUID mine = addressFor(customer, true);

        assertTrue(repository.isAddressNearChef(customer, mine, near, 10_000));
        assertFalse(repository.isAddressNearChef(customer, mine, far, 10_000));
        assertFalse(repository.isAddressNearChef(customer, addressFor(UUID.randomUUID(), true), near, 10_000));
        assertFalse(repository.isAddressNearChef(customer, addressFor(customer, false), near, 10_000));
        assertFalse(repository.isAddressNearChef(customer, UUID.randomUUID(), near, 10_000));
    }
}
