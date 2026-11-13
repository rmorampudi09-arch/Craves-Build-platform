package in.craves.order.delivery;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import in.craves.order.delivery.DeliveryStatusModels.DeliveryStatusChangedData;
import in.craves.order.delivery.DeliveryStatusModels.EventEnvelope;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.DeliveryStatusDtos.DeliveryStatusResponse;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;

/** Real PostgreSQL behaviour of the rider position and road path on the customer's delivery status. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class DeliveryCourierPositionDatabaseTest {
    // Recent, so positions pass the query service's age gate.
    private static final Instant T0 = Instant.now().minusSeconds(120).truncatedTo(java.time.temporal.ChronoUnit.SECONDS);

    private JdbcTemplate jdbc;
    private DeliveryStatusUpdateService updates;
    private DeliveryStatusQueryService query;
    private final UUID customer = UUID.randomUUID();
    private final UUID jobId = UUID.randomUUID();
    private UUID orderId;

    @BeforeEach
    void setup() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        // V16 depends on the shared business database's Catalog ownership contract. This is its test fixture.
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        jdbc.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY,identity_id UUID NOT NULL UNIQUE)");
        Flyway.configure().dataSource(ds).defaultSchema("order_schema").schemas("order_schema")
            .locations("classpath:db/migration").load().migrate();
        updates = new DeliveryStatusUpdateService(jdbc, new DeliveryStatusEventValidator(),
            new DeliveryStatusTransitionPolicy(), mock(DeliveryStatusCustomerNotificationService.class));
        query = new DeliveryStatusQueryService(jdbc, new DeliveryCodeService(jdbc));
        orderId = order("craves_fleet", "PICKED_UP", jobId);
    }

    @Test
    void sameStatusEventStoresPositionAndPath() {
        var result = send("PICKED_UP", T0.plusSeconds(30), "17.4", "78.4", T0.plusSeconds(30), "abc");

        assertEquals("NO_CHANGE", result.result());
        DeliveryStatusResponse response = get();
        assertEquals(17.4, response.courierLocation().latitude());
        assertEquals(78.4, response.courierLocation().longitude());
        assertEquals(T0.plusSeconds(30), response.courierLocation().observedAt());
        assertEquals("abc", response.routePath());
        assertEquals(0, jdbc.queryForObject(
            "SELECT count(*) FROM order_schema.order_delivery_status_history WHERE order_id = ?", Integer.class, orderId));
    }

    @Test
    void olderPositionDoesNotReplaceNewer() {
        send("PICKED_UP", T0.plusSeconds(60), "17.5", "78.5", T0.plusSeconds(60), "abc");
        send("PICKED_UP", T0.plusSeconds(45), "17.4", "78.4", T0.plusSeconds(45), "abc");

        assertEquals(17.5, get().courierLocation().latitude());
        assertEquals(T0.plusSeconds(60), get().courierLocation().observedAt());
    }

    @Test
    void eventWithoutPathKeepsStoredPath() {
        send("PICKED_UP", T0.plusSeconds(30), "17.4", "78.4", T0.plusSeconds(30), "abc");
        send("PICKED_UP", T0.plusSeconds(40), "17.5", "78.5", T0.plusSeconds(40), null);

        assertEquals(17.5, get().courierLocation().latitude());
        assertEquals("abc", get().routePath());
    }

    @Test
    void statusEventWithoutPositionKeepsPosition() {
        send("PICKED_UP", T0.plusSeconds(30), "17.4", "78.4", T0.plusSeconds(30), "abc");
        send("IN_TRANSIT", T0.plusSeconds(50), null, null, null, null);

        DeliveryStatusResponse response = get();
        assertEquals("IN_TRANSIT", response.status());
        assertNotNull(response.courierLocation());
        assertEquals("abc", response.routePath());
    }

    @Test
    void hiddenBeforePickupAndAfterDelivery() {
        send("PICKED_UP", T0.plusSeconds(30), "17.4", "78.4", T0.plusSeconds(30), "abc");
        for (String status : new String[] {"COURIER_ASSIGNED", "DELIVERED"}) {
            jdbc.update("UPDATE order_schema.customer_order SET delivery_status = ? WHERE id = ?", status, orderId);
            assertNull(get().courierLocation(), status);
            assertNull(get().routePath(), status);
        }
    }

    @Test
    void hiddenForOtherProviders() {
        UUID other = order("borzo", "IN_TRANSIT", UUID.randomUUID());
        jdbc.update("""
            UPDATE order_schema.customer_order SET delivery_courier_latitude = 17.4, delivery_courier_longitude = 78.4,
                delivery_courier_location_observed_at = ?, delivery_route_polyline = 'abc' WHERE id = ?
            """, Timestamp.from(T0), other);

        DeliveryStatusResponse response = query.getForCustomer(principal(customer), other);
        assertNull(response.courierLocation());
        assertNull(response.routePath());
    }

    @Test
    void handoffClearsPositionAndPath() {
        jdbc.update("UPDATE order_schema.customer_order SET delivery_status = 'COURIER_ASSIGNED' WHERE id = ?", orderId);
        send("COURIER_ASSIGNED", T0.plusSeconds(30), "17.4", "78.4", T0.plusSeconds(30), "abc");
        assertNotNull(jdbc.queryForObject(
            "SELECT delivery_route_polyline FROM order_schema.customer_order WHERE id = ?", String.class, orderId));

        var handoff = new DeliveryStatusChangedData(jobId, orderId, orderId, "borzo", "borzo-1", "SEARCHING", null,
            T0.plusSeconds(60), "craves_fleet", "trip-1", null, null, null, null, null);
        var result = updates.accept(envelope(handoff), "{}");

        assertEquals("PROCESSED", result.result());
        var row = jdbc.queryForMap("""
            SELECT delivery_courier_latitude, delivery_courier_longitude,
                   delivery_courier_location_observed_at, delivery_route_polyline
            FROM order_schema.customer_order WHERE id = ?
            """, orderId);
        row.values().forEach(value -> assertNull(value));
    }

    @Test
    void positionEventNeverChangesStatus() {
        UUID id = order("craves_fleet", "AT_DROPOFF", UUID.randomUUID());
        UUID job = jdbc.queryForObject("SELECT delivery_job_id FROM order_schema.customer_order WHERE id = ?", UUID.class, id);
        var data = new DeliveryStatusChangedData(job, id, id, "craves_fleet", "trip-1", "IN_TRANSIT", null,
            T0.plusSeconds(30), null, null, null, null, null, null, null,
            new BigDecimal("17.4"), new BigDecimal("78.4"), T0.plusSeconds(30), "abc");
        var result = updates.accept(new EventEnvelope<>(UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0", data.observedAt(),
            id, null, "integration-service", "delivery-job/" + job, data), "{}");

        assertEquals(false, result.applied());
        assertEquals("AT_DROPOFF", jdbc.queryForObject(
            "SELECT delivery_status FROM order_schema.customer_order WHERE id = ?", String.class, id));
        assertEquals(0, jdbc.queryForObject(
            "SELECT count(*) FROM order_schema.order_delivery_status_history WHERE order_id = ?", Integer.class, id));
        var response = query.getForCustomer(principal(customer), id);
        assertEquals(17.4, response.courierLocation().latitude());
        assertEquals("abc", response.routePath());
    }

    @Test
    void deliveredEventClearsPositionAndPath() {
        send("PICKED_UP", T0.plusSeconds(30), "17.4", "78.4", T0.plusSeconds(30), "abc");
        send("DELIVERED", T0.plusSeconds(60), null, null, null, null);

        DeliveryStatusResponse response = get();
        assertEquals("DELIVERED", response.status());
        assertNull(response.courierLocation());
        assertNull(response.routePath());
        assertPositionColumnsNull();

        send("DELIVERED", T0.plusSeconds(70), "17.5", "78.5", T0.plusSeconds(70), "abc");
        assertPositionColumnsNull();
    }

    @Test
    void staleLocationIsHidden() {
        jdbc.update("""
            UPDATE order_schema.customer_order SET delivery_courier_latitude = 17.4, delivery_courier_longitude = 78.4,
                delivery_courier_location_observed_at = ?, delivery_route_polyline = 'abc' WHERE id = ?
            """, Timestamp.from(Instant.now().minusSeconds(360)), orderId);
        assertNull(get().courierLocation());
        assertNull(get().routePath());

        jdbc.update("UPDATE order_schema.customer_order SET delivery_courier_location_observed_at = ? WHERE id = ?",
            Timestamp.from(Instant.now().minusSeconds(60)), orderId);
        assertNotNull(get().courierLocation());
        assertEquals("abc", get().routePath());
    }

    private void assertPositionColumnsNull() {
        jdbc.queryForMap("""
            SELECT delivery_courier_latitude, delivery_courier_longitude,
                   delivery_courier_location_observed_at, delivery_route_polyline
            FROM order_schema.customer_order WHERE id = ?
            """, orderId).values().forEach(value -> assertNull(value));
    }

    @Test
    void anotherCustomerGets404() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> query.getForCustomer(principal(UUID.randomUUID()), orderId));
        assertEquals(404, error.getStatusCode().value());
    }

    private DeliveryStatusResponse get() {
        return query.getForCustomer(principal(customer), orderId);
    }

    private static CravesPrincipal principal(UUID identity) {
        return new CravesPrincipal(identity, "+910000000000", Set.of("CUSTOMER"));
    }

    private DeliveryStatusUpdateService.ProcessingResult send(
        String status, Instant observedAt, String lat, String lng, Instant at, String path
    ) {
        var data = new DeliveryStatusChangedData(jobId, orderId, orderId, "craves_fleet", "trip-1", status, null,
            observedAt, null, null, null, null, null, null, null,
            lat == null ? null : new BigDecimal(lat), lng == null ? null : new BigDecimal(lng), at, path);
        return updates.accept(envelope(data), "{}");
    }

    private EventEnvelope<DeliveryStatusChangedData> envelope(DeliveryStatusChangedData data) {
        return new EventEnvelope<>(UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0", data.observedAt(),
            orderId, null, "integration-service", "delivery-job/" + jobId, data);
    }

    private UUID order(String provider, String status, UUID job) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO order_schema.customer_order (id, customer_identity_id, kitchen_id, chef_identity_id, status,
                prep_time_minutes, accepted_at, ready_at, food_subtotal, platform_fee, tax_amount, delivery_fee, grand_total,
                delivery_job_id, delivery_provider_id, delivery_provider_delivery_id, delivery_status,
                delivery_status_observed_at)
            VALUES (?, ?, ?, ?, 'CHEF_ACCEPTED', 20, now(), now() + interval '20 minutes', 100, 0, 0, 0, 100,
                ?, ?, ?, ?, ?)
            """, id, customer, UUID.randomUUID(), UUID.randomUUID(),
            job, provider, "craves_fleet".equals(provider) ? "trip-1" : "borzo-1", status, Timestamp.from(T0));
        return id;
    }
}
