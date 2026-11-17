package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import in.craves.order.config.ChefAcceptanceWindowProperties;
import in.craves.order.config.DomainEventOutboxProperties;
import in.craves.order.event.OrderCancelledEventFactory;
import in.craves.order.event.RefundRequestedEventFactory;
import in.craves.order.outbox.OrderCancelledEventWriter;
import in.craves.order.outbox.OrderDomainOutboxRepository;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CatalogClient.CatalogKitchen;
import in.craves.order.service.CatalogClient.CatalogMenuItem;
import in.craves.order.service.CustomerAddressClient.CustomerAddress;
import in.craves.order.subscription.SubscriptionOrderModels;
import in.craves.order.subscription.SubscriptionOrderModels.EventEnvelope;
import in.craves.order.subscription.SubscriptionOrderModels.RequestedData;
import in.craves.order.subscription.SubscriptionOrderModels.RequestedItem;
import in.craves.order.subscription.SubscriptionOrderRepository;
import in.craves.order.subscription.SubscriptionOrderRepository.ValidatedItem;
import in.craves.order.web.ApiDtos.AddCartItemRequest;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.ChefRejectRequest;
import in.craves.order.web.ApiDtos.CustomerAddressSnapshotResponse;
import in.craves.order.web.ApiDtos.KitchenPickupSnapshotResponse;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * R22 finding 12: a chef order cancelled by the chef's decline or silence writes one ORDER_CANCELLED in the cancel's own
 * transaction, with the payload integration-service reads, and only while the event is on the publication allow-list.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class OrderCancelledEventDatabaseTest {
    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
    }

    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules()
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private final UUID customer = UUID.randomUUID();
    private final UUID chef = UUID.randomUUID();
    private final UUID kitchen = UUID.randomUUID();
    private final UUID menu = UUID.randomUUID();
    private final UUID address = UUID.randomUUID();
    private final CravesPrincipal customerActor = new CravesPrincipal(customer, "", Set.of("CUSTOMER"));
    private final CravesPrincipal chefActor = new CravesPrincipal(chef, "", Set.of("CHEF"));
    private final DomainEventOutboxProperties outboxProperties = new DomainEventOutboxProperties();
    private AnnotationConfigApplicationContext context;
    private JdbcTemplate jdbc;
    private NotificationOutboxRepository notifications;
    private OrderService orders;
    private ChefAcceptanceResolutionService resolution;

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
        jdbc.update("DELETE FROM catalog_schema.kitchen_profile");
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id,identity_id) VALUES (?,?)", kitchen, chef);
        Flyway.configure().dataSource(ds).defaultSchema("order_schema").schemas("order_schema")
            .locations("classpath:db/migration").load().migrate();

        CatalogClient catalog = mock(CatalogClient.class);
        CustomerAddressClient addresses = mock(CustomerAddressClient.class);
        when(catalog.getActiveMenuItem(menu)).thenReturn(new CatalogMenuItem(menu, kitchen, "Test meal", "Test meal", "MEAL",
            "VEG", new BigDecimal("369.00"), "INR", 1, 20, "MILD", 500, false, true, "ACTIVE"));
        when(catalog.getKitchen(kitchen)).thenReturn(new CatalogKitchen(kitchen, chef, "Test kitchen", "Test chef", "Test",
            "9000000000", "test@example.invalid", "Test pickup", null, null, "Test area", "Hyderabad", "Telangana", "500001",
            new BigDecimal("17.40"), new BigDecimal("78.40"), "ACTIVE"));
        when(addresses.getActiveOwnedAddress(customer, address)).thenReturn(new CustomerAddress(address, customer,
            "Home", "Test customer", "9000000001", "Test dropoff", null, null, "Test area", "Hyderabad", "Telangana",
            "500001", new BigDecimal("17.41"), new BigDecimal("78.41"), true, true, Instant.now(), Instant.now()));
        notifications = spy(new NotificationOutboxRepository(jdbc, json));

        var manager = new DataSourceTransactionManager(ds);
        context = new AnnotationConfigApplicationContext();
        context.register(Config.class);
        context.registerBean(JdbcTemplate.class, () -> jdbc);
        context.registerBean(ObjectMapper.class, () -> json);
        context.registerBean(DataSourceTransactionManager.class, () -> manager);
        context.registerBean(CatalogClient.class, () -> catalog);
        context.registerBean(CustomerAddressClient.class, () -> addresses);
        context.registerBean(CheckoutSnapshotFactory.class, CheckoutSnapshotFactory::new);
        context.registerBean(NotificationInternalClient.class, () -> mock(NotificationInternalClient.class));
        context.registerBean(ChefAcceptanceWindowProperties.class, ChefAcceptanceWindowProperties::new);
        context.registerBean(DomainEventOutboxProperties.class, () -> outboxProperties);
        context.registerBean(NotificationOutboxRepository.class, () -> notifications);
        context.registerBean(OrderService.class);
        context.registerBean(PaymentCallbackService.class);
        context.registerBean(RefundRequestedEventFactory.class);
        context.registerBean(OrderCancelledEventFactory.class);
        context.registerBean(OrderDomainOutboxRepository.class);
        context.registerBean(OrderCancelledEventWriter.class);
        context.registerBean(SubscriptionOrderRepository.class);
        context.registerBean(ChefAcceptanceResolutionService.class);
        context.refresh();
        orders = context.getBean(OrderService.class);
        resolution = context.getBean(ChefAcceptanceResolutionService.class);
    }

    @AfterEach
    void close() {
        if (context != null) {
            context.close();
        }
    }

    @Test
    void aChefsDeclineWritesOneEventWithThePayloadIntegrationServiceReads() throws Exception {
        publishOrderCancelled();
        UUID id = paidOrder();

        resolution.reject(chefActor, id, new ChefRejectRequest("Out of stock"), UUID.randomUUID(), "decline-" + id);
        // The chef's app repeats the request: the order is already declined and nothing more is written.
        resolution.reject(chefActor, id, new ChefRejectRequest("Out of stock"), UUID.randomUUID(), "decline-again-" + id);

        Map<String, Object> order = jdbc.queryForMap(
            "SELECT status, checkout_id, updated_at FROM order_schema.customer_order WHERE id = ?", id);
        assertEquals("CHEF_REJECTED", order.get("status"));
        Map<String, Object> row = cancelledRow(id);
        assertEquals("ORDER_CANCELLED:" + id, row.get("event_key"));
        assertEquals("PENDING", row.get("status"));
        assertEquals(id.toString(), row.get("subject"));
        JsonNode event = json.readTree((String) row.get("payload"));
        assertEquals("ORDER_CANCELLED", event.path("eventType").asText());
        assertEquals(id.toString(), event.path("subject").asText());
        JsonNode data = event.path("data");
        assertEquals(4, data.size(), "checkoutId, chefSubOrderId, reason and cancelledAt only");
        assertEquals(order.get("checkout_id").toString(), data.path("checkoutId").asText());
        assertEquals(id.toString(), data.path("chefSubOrderId").asText());
        assertEquals("CHEF_DECLINED", data.path("reason").asText());
        assertEquals(((Timestamp) order.get("updated_at")).toInstant(), Instant.parse(data.path("cancelledAt").asText()));
        // The refund is still requested as before, as its own event.
        assertEquals(List.of("ORDER_CANCELLED", "REFUND_REQUESTED"), eventTypes(id));
    }

    @Test
    void aMealPlanOrderTheChefNeverAnsweredWritesOneEventAndStandsInForItsOwnCheckout() throws Exception {
        publishOrderCancelled();
        UUID id = mealPlanOrder();
        jdbc.update("UPDATE order_schema.customer_order SET chef_acceptance_requested_at = now() - INTERVAL '1 hour', "
            + "chef_acceptance_expires_at = now() - INTERVAL '1 minute' WHERE id = ?", id);

        assertTrue(resolution.timeoutExpiredOrder(id));
        // The worker's next pass finds it already rejected.
        assertFalse(resolution.timeoutExpiredOrder(id));

        JsonNode data = json.readTree((String) cancelledRow(id).get("payload")).path("data");
        assertEquals(id.toString(), data.path("checkoutId").asText());
        assertEquals(id.toString(), data.path("chefSubOrderId").asText());
        assertEquals("CHEF_ACCEPTANCE_TIMEOUT", data.path("reason").asText());
        // A meal plan gets its day back instead of a refund, so the cancel is the only domain event.
        assertEquals(List.of("ORDER_CANCELLED"), eventTypes(id));
    }

    @Test
    void theEventRollsBackWithTheCancel() {
        publishOrderCancelled();
        UUID id = paidOrder();
        doThrow(new IllegalStateException("notification outbox down")).when(notifications).savePending(any());

        assertThrows(IllegalStateException.class,
            () -> resolution.reject(chefActor, id, new ChefRejectRequest(null), UUID.randomUUID(), "decline-" + id));

        assertEquals("CHEF_ACCEPTANCE_PENDING",
            jdbc.queryForObject("SELECT status FROM order_schema.customer_order WHERE id = ?", String.class, id));
        assertEquals(List.of(), eventTypes(id));
    }

    @Test
    void withTheDefaultAllowListACancelWritesNoEvent() {
        UUID declined = paidOrder();
        resolution.reject(chefActor, declined, new ChefRejectRequest(null), UUID.randomUUID(), "decline-" + declined);
        UUID silent = mealPlanOrder();
        jdbc.update("UPDATE order_schema.customer_order SET chef_acceptance_requested_at = now() - INTERVAL '1 hour', "
            + "chef_acceptance_expires_at = now() - INTERVAL '1 minute' WHERE id = ?", silent);
        assertTrue(resolution.timeoutExpiredOrder(silent));

        assertEquals(List.of("REFUND_REQUESTED"), eventTypes(declined));
        assertEquals(List.of(), eventTypes(silent));
    }

    private void publishOrderCancelled() {
        outboxProperties.setEnabledEventTypes(Set.of("CHEF_ACCEPTED_ORDER", "ORDER_CANCELLED"));
    }

    /** An order as the payment callback leaves it: CHEF_ACCEPTANCE_PENDING with its deadline. */
    private UUID paidOrder() {
        orders.addCartItem(customerActor, new AddCartItemRequest(menu, 1));
        var checkout = orders.checkout(customerActor, new CheckoutRequest(address, null));
        context.getBean(PaymentCallbackService.class).markCheckoutPaid(checkout.id(), customer, "test payment");
        return checkout.orders().getFirst().id();
    }

    private UUID mealPlanOrder() {
        UUID occurrence = UUID.randomUUID();
        var event = new EventEnvelope<>(UUID.randomUUID(), SubscriptionOrderModels.EVENT_TYPE, "v1", Instant.now(), occurrence,
            UUID.randomUUID(), occurrence, new RequestedData(occurrence, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), Instant.now().plus(Duration.ofHours(5)),
                List.of(new RequestedItem(UUID.randomUUID(), 1, 1))));
        var dropoff = new CustomerAddressSnapshotResponse(UUID.randomUUID(), "Customer", "+919000000000", "1 Road", null, null,
            "Area", "Hyderabad", "Telangana", "500001", new BigDecimal("17.385"), new BigDecimal("78.4867"));
        var pickup = new KitchenPickupSnapshotResponse(kitchen, "Kitchen", "+919000000001", null, "2 Road", null, null,
            "Area", "Hyderabad", "Telangana", "500001", new BigDecimal("17.385"), new BigDecimal("78.4867"));
        return context.getBean(SubscriptionOrderRepository.class).create(event, JsonNodeFactory.instance.objectNode(), kitchen,
            "Kitchen", dropoff, pickup, List.of(new ValidatedItem(UUID.randomUUID(), "Dal rice", "MEAL", "VEG", 500, false, 1)),
            500, false).orderId();
    }

    /** Fails unless the order has exactly one ORDER_CANCELLED row. */
    private Map<String, Object> cancelledRow(UUID orderId) {
        return jdbc.queryForMap("SELECT event_key, status, subject, payload_json::text AS payload FROM order_schema.domain_event_outbox "
            + "WHERE aggregate_id = ? AND event_type = 'ORDER_CANCELLED'", orderId);
    }

    private List<String> eventTypes(UUID orderId) {
        return jdbc.queryForList("SELECT event_type FROM order_schema.domain_event_outbox WHERE aggregate_id = ? ORDER BY event_type",
            String.class, orderId);
    }
}
