package in.craves.order.subscription;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import in.craves.order.delivery.DeliveryCodeService;
import in.craves.order.event.ChefAcceptedOrderEventFactory;
import in.craves.order.event.RefundRequestedEventFactory;
import in.craves.order.outbox.OrderDomainOutboxRepository;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.ChefAcceptanceResolutionService;
import in.craves.order.service.ChefAcceptanceService;
import in.craves.order.service.NotificationOutboxRepository;
import in.craves.order.service.OrderService;
import in.craves.order.subscription.SubscriptionOrderModels.CallbackRecord;
import in.craves.order.subscription.SubscriptionOrderModels.EventEnvelope;
import in.craves.order.subscription.SubscriptionOrderModels.RequestedData;
import in.craves.order.subscription.SubscriptionOrderModels.RequestedItem;
import in.craves.order.subscription.SubscriptionOrderRepository.ValidatedItem;
import in.craves.order.web.ApiDtos.ChefAcceptRequest;
import in.craves.order.web.ApiDtos.CustomerAddressSnapshotResponse;
import in.craves.order.web.ApiDtos.KitchenPickupSnapshotResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** A meal-plan order waits for the chef until an hour before the meal; a decline or silence reports the day back, with no refund. */
@EnabledIfEnvironmentVariable(named = "CRAVES_DISPOSABLE_TEST_DATABASE", matches = "true")
class SubscriptionOrderChefDeclineDatabaseTest {
    JdbcTemplate jdbc;
    SubscriptionOrderRepository repository;
    ChefAcceptanceResolutionService resolution;
    ChefAcceptanceService acceptance;
    ObjectMapper json;
    final UUID occurrence = UUID.randomUUID(), kitchen = UUID.randomUUID();

    @BeforeEach void setup() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds); jdbc.setQueryTimeout(10);
        jdbc.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        jdbc.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY,identity_id UUID NOT NULL UNIQUE)");
        Flyway.configure().dataSource(ds).defaultSchema("order_schema").schemas("order_schema").locations("classpath:db/migration").load().migrate();
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id,identity_id) VALUES (?,?)", kitchen, UUID.randomUUID());
        repository = new SubscriptionOrderRepository(jdbc);
        json = new ObjectMapper().registerModule(new JavaTimeModule());
        resolution = new ChefAcceptanceResolutionService(jdbc, mock(OrderService.class), new RefundRequestedEventFactory(json),
            new OrderDomainOutboxRepository(jdbc), new NotificationOutboxRepository(jdbc, json), repository);
        acceptance = new ChefAcceptanceService(jdbc, mock(OrderService.class), new ChefAcceptedOrderEventFactory(json),
            new OrderDomainOutboxRepository(jdbc), new DeliveryCodeService(jdbc));
    }

    UUID createOrder(Instant serviceAt) {
        var event = new EventEnvelope<>(UUID.randomUUID(), SubscriptionOrderModels.EVENT_TYPE, "v1", Instant.now(), occurrence,
            UUID.randomUUID(), occurrence, new RequestedData(occurrence, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), serviceAt, List.of(new RequestedItem(UUID.randomUUID(), 1, 1))));
        var dropoff = new CustomerAddressSnapshotResponse(UUID.randomUUID(), "Customer", "+919000000000", "1 Road", null, null,
            "Area", "Hyderabad", "Telangana", "500001", new java.math.BigDecimal("17.385"), new java.math.BigDecimal("78.4867"));
        var pickup = new KitchenPickupSnapshotResponse(kitchen, "Kitchen", "+919000000001", null, "2 Road", null, null,
            "Area", "Hyderabad", "Telangana", "500001", new java.math.BigDecimal("17.385"), new java.math.BigDecimal("78.4867"));
        return repository.create(event, JsonNodeFactory.instance.objectNode(), kitchen, "Kitchen", dropoff, pickup,
            List.of(new ValidatedItem(UUID.randomUUID(), "Dal rice", "MEAL", "VEG", 500, false, 1)), 500, false).orderId();
    }

    Map<String, Object> order(UUID id) {
        return jdbc.queryForMap("SELECT status, chef_rejection_code, refund_requested_at, refund_requested_amount, " +
            "chef_acceptance_expires_at FROM order_schema.customer_order WHERE id = ?", id);
    }

    @Test void chefHasUntilAnHourBeforeTheMealToAnswer() {
        Instant lunch = Instant.now().plus(Duration.ofHours(5)).truncatedTo(ChronoUnit.SECONDS);

        UUID id = createOrder(lunch);

        assertEquals("CHEF_ACCEPTANCE_PENDING", order(id).get("status"));
        assertEquals(lunch.minus(Duration.ofHours(1)), ((java.sql.Timestamp) order(id).get("chef_acceptance_expires_at")).toInstant());
    }

    @Test void silenceCountsAsADeclineAndReportsTheDayBackWithoutARefund() {
        UUID id = createOrder(Instant.now().plus(Duration.ofHours(5)));
        jdbc.update("UPDATE order_schema.customer_order SET chef_acceptance_requested_at = now() - INTERVAL '1 hour', chef_acceptance_expires_at = now() - INTERVAL '1 minute' WHERE id = ?", id);
        jdbc.update("UPDATE order_schema.subscription_order_callback_outbox SET status = 'DELIVERED', delivered_at = now(), attempt_count = 1 WHERE order_id = ?", id);

        assertTrue(resolution.timeoutExpiredOrder(id));

        Map<String, Object> row = order(id);
        assertEquals("CHEF_REJECTED", row.get("status"));
        assertEquals("CHEF_ACCEPTANCE_TIMEOUT", row.get("chef_rejection_code"));
        assertNull(row.get("refund_requested_at"));
        assertNull(row.get("refund_requested_amount"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM order_schema.domain_event_outbox", Integer.class));
        assertEquals(List.of("meal-plan-day-added-" + id), jdbc.queryForList("SELECT event_key FROM order_schema.notification_outbox", String.class));

        List<CallbackRecord> callbacks = repository.claimCallbacks(10, 10, 10);
        assertEquals(1, callbacks.size());
        assertEquals(List.of(occurrence, id, true, 1), List.of(callbacks.get(0).occurrenceId(), callbacks.get(0).orderId(),
            callbacks.get(0).chefDeclined(), callbacks.get(0).attemptCount()));
    }

    @Test void chefCanAcceptAMealPlanOrderAndBookItsCourier() throws Exception {
        UUID id = createOrder(Instant.now().plus(Duration.ofHours(5)));

        acceptance.accept(new CravesPrincipal(UUID.randomUUID(), "", java.util.Set.of("CHEF")), id, new ChefAcceptRequest(20, null),
            UUID.randomUUID(), "accept-" + id);

        assertEquals("CHEF_ACCEPTED", order(id).get("status"));
        var event = json.readTree(jdbc.queryForObject("SELECT payload_json::text FROM order_schema.domain_event_outbox WHERE aggregate_id = ?", String.class, id));
        // The courier side needs an order id; a meal-plan order stands in for its own checkout.
        assertEquals(id.toString(), event.path("data").path("orderId").asText());
        assertEquals(id.toString(), event.path("data").path("chefSubOrderId").asText());
    }
}
