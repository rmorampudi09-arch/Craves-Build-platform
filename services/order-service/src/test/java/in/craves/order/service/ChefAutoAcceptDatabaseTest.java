package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import in.craves.order.config.ChefAcceptanceWindowProperties;
import in.craves.order.delivery.DeliveryCodeService;
import in.craves.order.event.ChefAcceptedOrderEventFactory;
import in.craves.order.exception.OrderApiException;
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
import in.craves.order.web.ApiDtos.ChefAcceptRequest;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.CustomerAddressSnapshotResponse;
import in.craves.order.web.ApiDtos.KitchenPickupSnapshotResponse;
import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.server.ResponseStatusException;

/** Kitchens that auto-accept: a paid order is accepted by the chef-acceptance worker through the manual accept path. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class ChefAutoAcceptDatabaseTest {
    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Config {
    }

    private static final String AUTO_TITLE = "New order accepted automatically";
    private static final String MANUAL_TITLE = "New order received";

    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules()
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private final UUID customer = UUID.randomUUID();
    private final UUID chef = UUID.randomUUID();
    private final UUID kitchen = UUID.randomUUID();
    private final UUID menu = UUID.randomUUID();
    private final UUID slowMenu = UUID.randomUUID();
    private final UUID address = UUID.randomUUID();
    private final CravesPrincipal customerActor = new CravesPrincipal(customer, "", Set.of("CUSTOMER"));
    private final CravesPrincipal chefActor = new CravesPrincipal(chef, "", Set.of("CHEF"));
    private AnnotationConfigApplicationContext context;
    private JdbcTemplate jdbc;
    private CatalogClient catalog;
    private ChefOrderNotificationClient directClient;
    private OrderService orders;
    private ChefAcceptanceService acceptance;
    private ChefAcceptanceWindowWorker worker;
    private ChefAutoAcceptService autoAccept;

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

        catalog = mock(CatalogClient.class);
        CustomerAddressClient addresses = mock(CustomerAddressClient.class);
        directClient = mock(ChefOrderNotificationClient.class);
        when(catalog.getActiveMenuItem(menu)).thenReturn(dish(menu, 20));
        when(catalog.getActiveMenuItem(slowMenu)).thenReturn(dish(slowMenu, 35));
        when(addresses.getActiveOwnedAddress(customer, address)).thenReturn(new CustomerAddress(address, customer,
            "Home", "Test customer", "9000000001", "Test dropoff", null, null, "Test area", "Hyderabad", "Telangana",
            "500001", new BigDecimal("17.41"), new BigDecimal("78.41"), true, true, Instant.now(), Instant.now()));
        kitchenSettings(true, null);

        var manager = new DataSourceTransactionManager(ds);
        var properties = new ChefAcceptanceWindowProperties();
        properties.setWorkerEnabled(true);
        context = new AnnotationConfigApplicationContext();
        context.register(Config.class);
        context.registerBean(JdbcTemplate.class, () -> jdbc);
        context.registerBean(ObjectMapper.class, () -> json);
        context.registerBean(DataSourceTransactionManager.class, () -> manager);
        context.registerBean(CatalogClient.class, () -> catalog);
        context.registerBean(CustomerAddressClient.class, () -> addresses);
        context.registerBean(CheckoutSnapshotFactory.class, CheckoutSnapshotFactory::new);
        context.registerBean(NotificationInternalClient.class, () -> mock(NotificationInternalClient.class));
        context.registerBean(ChefOrderNotificationClient.class, () -> directClient);
        context.registerBean(ChefAcceptanceResolutionService.class, () -> mock(ChefAcceptanceResolutionService.class));
        context.registerBean(ChefAcceptanceWindowProperties.class, () -> properties);
        context.registerBean(OrderService.class);
        context.registerBean(ChefAcceptedOrderEventFactory.class);
        context.registerBean(OrderDomainOutboxRepository.class);
        context.registerBean(NotificationOutboxRepository.class);
        context.registerBean(NotificationOutboxService.class);
        context.registerBean(ChefAcceptanceWorkRepository.class);
        context.registerBean(DeliveryCodeService.class);
        context.registerBean(ChefAcceptanceService.class);
        context.registerBean(ChefAcceptanceInitialNotificationService.class);
        context.registerBean(ChefAutoAcceptService.class);
        context.registerBean(ChefAcceptanceWindowWorker.class);
        context.registerBean(PaymentCallbackService.class);
        context.refresh();
        orders = context.getBean(OrderService.class);
        acceptance = context.getBean(ChefAcceptanceService.class);
        autoAccept = context.getBean(ChefAutoAcceptService.class);
        worker = context.getBean(ChefAcceptanceWindowWorker.class);
    }

    @AfterEach
    void close() {
        if (context != null) {
            context.close();
        }
    }

    @Test
    void autoAcceptOnAcceptsThePaidOrderWithTheSlowestDishsPrepTime() {
        UUID id = paidOrder(menu, slowMenu);

        worker.process();

        Map<String, Object> row = order(id);
        assertEquals("CHEF_ACCEPTED", row.get("status"));
        assertEquals(35, row.get("prep_time_minutes"));
        assertNull(row.get("chef_response_note"));
        Instant acceptedAt = ((Timestamp) row.get("accepted_at")).toInstant();
        assertEquals(acceptedAt.plus(Duration.ofMinutes(35)), ((Timestamp) row.get("ready_at")).toInstant());
        assertNotNull(row.get("chef_acceptance_initial_recorded_at"));
        // Same audit row and delivery event a manual accept writes, attributed to the kitchen's chef.
        // The audit row says it was automatic; chef_response_note (the customer-visible note) stays empty.
        assertEquals(List.of(Map.of("old_status", "CHEF_ACCEPTANCE_PENDING", "new_status", "CHEF_ACCEPTED",
            "actor_identity_id", chef, "reason", "Accepted automatically")), history(id));
        assertEquals(List.of("CHEF_ACCEPTED_ORDER"), jdbc.queryForList(
            "SELECT event_type FROM order_schema.domain_event_outbox WHERE aggregate_id = ?", String.class, id));
        // Auto-accept gets a delivery code like a manual accept.
        assertTrue(jdbc.queryForObject("SELECT code FROM order_schema.order_delivery_code WHERE order_id = ?",
            String.class, id).matches("[0-9]{4}"));
        // The chef is told about it, and the customer hears "chef accepted" exactly like a manual accept.
        Map<String, Object> chefNote = notification("chef-new-order-" + id);
        assertEquals(AUTO_TITLE, chefNote.get("title"));
        assertEquals("CHEF", chefNote.get("user_role"));
        assertEquals(chef, chefNote.get("user_identity_id"));
        assertEquals("Chef accepted your order", notification("chef-accepted-order-" + id).get("title"));
        verify(directClient, times(1)).chefAcceptedOrder(any());
    }

    @Test
    void theAcceptanceTimerIsCancelledLikeAManualAccept() {
        UUID id = paidOrder(menu);
        worker.process();
        jdbc.update("UPDATE order_schema.customer_order SET chef_acceptance_requested_at = now() - interval '1 hour', "
            + "chef_acceptance_expires_at = now() - interval '1 minute' WHERE id = ?", id);

        assertEquals(List.of(), new ChefAcceptanceWorkRepository(jdbc).findExpiredOrderIds(10));
        assertEquals(List.of(), new ChefAcceptanceWorkRepository(jdbc).findInitialNotificationCandidates(10));
    }

    @Test
    void autoAcceptProducesWhatAManualAcceptProduces() {
        UUID auto = paidOrder(menu);
        worker.process();
        kitchenSettings(false, null);
        UUID hand = paidOrder(menu);
        worker.process();
        acceptance.accept(chefActor, hand, new ChefAcceptRequest(20, null), null, "hand-" + hand);

        for (String column : List.of("status", "prep_time_minutes", "chef_response_note")) {
            assertEquals(order(hand).get(column), order(auto).get(column), column);
        }
        assertEquals(1, history(auto).size());
        assertEquals(1, history(hand).size());
        for (String column : List.of("old_status", "new_status", "actor_identity_id")) {
            assertEquals(history(hand).getFirst().get(column), history(auto).getFirst().get(column), column);
        }
        // The one intended difference: the audit reason. A manual accept without a note keeps its null reason.
        assertEquals("Accepted automatically", history(auto).getFirst().get("reason"));
        assertNull(history(hand).getFirst().get("reason"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM order_schema.domain_event_outbox WHERE aggregate_id = ?",
            Integer.class, hand));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM order_schema.domain_event_outbox WHERE aggregate_id = ?",
            Integer.class, auto));
    }

    @Test
    void aMealPlanOrderStaysManualBecauseAcceptingItAtCreationWouldBookTheCourierHoursEarly() {
        kitchenSettings(true, 25);
        UUID id = mealPlanOrder(Instant.now().plus(Duration.ofHours(5)));

        worker.process();

        assertEquals("CHEF_ACCEPTANCE_PENDING", order(id).get("status"));
        assertEquals(0, count("domain_event_outbox"));
        assertEquals(MANUAL_TITLE, notification("chef-new-order-" + id).get("title"));
        // The chef accepts it by hand exactly as before.
        acceptance.accept(chefActor, id, new ChefAcceptRequest(25, null), null, "hand-" + id);
        assertEquals("CHEF_ACCEPTED", order(id).get("status"));
    }

    @Test
    void aScheduledOrderStaysManualForTheSameReasonAsAMealPlanOrder() {
        UUID id = paidOrder(menu);
        jdbc.update("UPDATE order_schema.customer_order SET fulfilment_mode = 'SCHEDULED', "
            + "requested_fulfilment_at = now() + interval '5 hours', requested_timezone = 'Asia/Kolkata' WHERE id = ?", id);

        worker.process();

        assertEquals("CHEF_ACCEPTANCE_PENDING", order(id).get("status"));
        assertEquals(0, count("domain_event_outbox"));
        assertEquals(MANUAL_TITLE, notification("chef-new-order-" + id).get("title"));
        acceptance.accept(chefActor, id, new ChefAcceptRequest(20, null), null, "hand-" + id);
        assertEquals("CHEF_ACCEPTED", order(id).get("status"));
    }

    @Test
    void prepTimeFallsBackToTheKitchenDefaultThenToFifteen() {
        doReturn(dish(menu, null)).when(catalog).getActiveMenuItem(menu);
        kitchenSettings(true, 25);
        UUID withDefault = paidOrder(menu);
        worker.process();
        assertEquals(25, order(withDefault).get("prep_time_minutes"));

        kitchenSettings(true, null);
        UUID withoutDefault = paidOrder(menu);
        worker.process();
        assertEquals(15, order(withoutDefault).get("prep_time_minutes"));
    }

    @Test
    void aDishThatWentInactiveDoesNotStopTheAcceptAndTheOtherDishesDecideTheTime() {
        UUID id = paidOrder(menu, slowMenu);
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST)).when(catalog).getActiveMenuItem(slowMenu);

        worker.process();

        assertEquals("CHEF_ACCEPTED", order(id).get("status"));
        assertEquals(20, order(id).get("prep_time_minutes"));
    }

    @Test
    void autoAcceptOffOrUnknownLeavesTheOrderPendingAndTheChefIsToldAsBefore() {
        for (Boolean setting : new Boolean[] {false, null}) {
            kitchenSettings(setting, 30);
            UUID id = paidOrder(menu);

            worker.process();

            assertEquals("CHEF_ACCEPTANCE_PENDING", order(id).get("status"), String.valueOf(setting));
            assertEquals(MANUAL_TITLE, notification("chef-new-order-" + id).get("title"));
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM order_schema.domain_event_outbox WHERE aggregate_id = ?",
                Integer.class, id));
        }
        verify(directClient, never()).chefAcceptedOrder(any());
    }

    @Test
    void catalogDownLeavesTheOrderPendingAndTheNextTickAcceptsIt() {
        UUID id = paidOrder(menu);
        doThrow(new ResourceAccessException("catalog timeout")).when(catalog).getKitchen(kitchen);

        worker.process();

        assertEquals("CHEF_ACCEPTANCE_PENDING", order(id).get("status"));
        assertNull(order(id).get("chef_acceptance_initial_recorded_at"));
        assertEquals(0, count("notification_outbox"));

        kitchenSettings(true, null);
        worker.process();

        assertEquals("CHEF_ACCEPTED", order(id).get("status"));
    }

    @Test
    void dishLookupFailingStillAutoAcceptsWithTheKitchenDefaultThenFifteen() {
        UUID withDefault = paidOrder(menu);
        UUID withoutDefault = paidOrder(menu);
        doThrow(new ResourceAccessException("I/O error on GET request", new IOException("Request timed out")))
            .when(catalog).getActiveMenuItem(menu);

        kitchenSettings(true, 25);
        assertTrue(autoAccept.recordNewOrder(withDefault, catalog.getKitchen(kitchen)));
        kitchenSettings(true, null);
        assertTrue(autoAccept.recordNewOrder(withoutDefault, catalog.getKitchen(kitchen)));

        assertEquals("CHEF_ACCEPTED", order(withDefault).get("status"));
        assertEquals(25, order(withDefault).get("prep_time_minutes"));
        assertEquals("CHEF_ACCEPTED", order(withoutDefault).get("status"));
        assertEquals(15, order(withoutDefault).get("prep_time_minutes"));
        assertEquals(AUTO_TITLE, notification("chef-new-order-" + withDefault).get("title"));
    }

    @Test
    void bothCustomerNotificationsGoOutEvenIfTheCatalogFailsOnceTheAcceptIsCommitted() {
        UUID id = paidOrder(menu);
        CatalogKitchen kitchenNow = catalog.getKitchen(kitchen);
        // The worker's own lookup is the only call allowed outside a transaction; any later one (such as a re-read
        // of the order after the commit) fails.
        AtomicInteger outsideTransaction = new AtomicInteger();
        doAnswer(call -> {
            if (!TransactionSynchronizationManager.isActualTransactionActive() && outsideTransaction.incrementAndGet() > 1) {
                throw new ResourceAccessException("catalog timeout");
            }
            return kitchenNow;
        }).when(catalog).getKitchen(kitchen);

        worker.process();

        assertEquals("CHEF_ACCEPTED", order(id).get("status"));
        assertEquals(1, outsideTransaction.get());
        assertEquals("Chef accepted your order", notification("chef-accepted-order-" + id).get("title"));
        verify(directClient, times(1)).chefAcceptedOrder(any());
    }

    @Test
    void aFailedAutoAcceptRollsBackCompletelyAndFallsBackToTheNormalNotification() {
        UUID id = paidOrder(menu);
        // The accept itself fails late (after its UPDATE and history row): the delivery event cannot be built.
        jdbc.update("UPDATE order_schema.customer_order SET total_package_weight_grams = NULL WHERE id = ?", id);

        worker.process();

        assertEquals("CHEF_ACCEPTANCE_PENDING", order(id).get("status"));
        assertNull(order(id).get("prep_time_minutes"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM order_schema.order_status_history "
            + "WHERE order_id = ? AND new_status = 'CHEF_ACCEPTED'", Integer.class, id));
        assertEquals(0, count("domain_event_outbox"));
        assertEquals(MANUAL_TITLE, notification("chef-new-order-" + id).get("title"));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM order_schema.notification_outbox "
            + "WHERE event_key = ?", Integer.class, "chef-accepted-order-" + id));
        verify(directClient, never()).chefAcceptedOrder(any());
    }

    @Test
    void aDuplicateTriggerDoesNotAcceptOrNotifyTwice() {
        UUID id = paidOrder(menu);
        CatalogKitchen auto = catalog.getKitchen(kitchen);

        assertTrue(autoAccept.recordNewOrder(id, auto));
        assertEquals(false, autoAccept.recordNewOrder(id, auto));
        worker.process();
        worker.process();

        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM order_schema.order_status_history "
            + "WHERE order_id = ? AND new_status = 'CHEF_ACCEPTED'", Integer.class, id));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM order_schema.domain_event_outbox WHERE aggregate_id = ?",
            Integer.class, id));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM order_schema.notification_outbox "
            + "WHERE event_key = ?", Integer.class, "chef-new-order-" + id));
        verify(directClient, times(1)).chefAcceptedOrder(any());
    }

    @Test
    void aChefWhoAcceptsFirstWinsAndNothingIsAcceptedOrAnnouncedAutomatically() {
        UUID id = paidOrder(menu);
        CatalogKitchen auto = catalog.getKitchen(kitchen);

        acceptance.accept(chefActor, id, new ChefAcceptRequest(30, "On it"), null, "hand-" + id);

        assertEquals(false, autoAccept.recordNewOrder(id, auto));
        worker.process();
        assertEquals(30, order(id).get("prep_time_minutes"));
        assertEquals("On it", order(id).get("chef_response_note"));
        assertEquals("On it", history(id).getFirst().get("reason"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM order_schema.domain_event_outbox WHERE aggregate_id = ?",
            Integer.class, id));
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM order_schema.notification_outbox "
            + "WHERE event_key = ?", Integer.class, "chef-new-order-" + id));
    }

    @Test
    void aManualAcceptAfterAnAutoAcceptKeepsTheNormalRules() {
        UUID id = paidOrder(menu);
        worker.process();

        // Same prep time: idempotent, no second event. Different prep time: the existing 409.
        acceptance.accept(chefActor, id, new ChefAcceptRequest(20, null), null, "hand-" + id);
        assertEquals("ORDER_ALREADY_ACCEPTED", assertThrows(OrderApiException.class,
            () -> acceptance.accept(chefActor, id, new ChefAcceptRequest(45, null), null, "hand2-" + id)).code());
        assertEquals(1, count("domain_event_outbox"));
    }

    private void kitchenSettings(Boolean autoAcceptOrders, Integer defaultPrepMinutes) {
        doReturn(new CatalogKitchen(kitchen, chef, "Test kitchen", "Test chef",
            "Test", "9000000000", "test@example.invalid", "Test pickup", null, null, "Test area", "Hyderabad",
            "Telangana", "500001", new BigDecimal("17.40"), new BigDecimal("78.40"), "ACTIVE",
            autoAcceptOrders, defaultPrepMinutes)).when(catalog).getKitchen(kitchen);
    }

    private CatalogMenuItem dish(UUID id, Integer prepMinutes) {
        return new CatalogMenuItem(id, kitchen, "Test meal", "Test meal", "MEAL", "VEG", new BigDecimal("369.00"),
            "INR", 1, prepMinutes, "MILD", 500, false, true, "ACTIVE");
    }

    /** An order as the payment callback leaves it: CHEF_ACCEPTANCE_PENDING with its deadline, chef not yet told. */
    private UUID paidOrder(UUID... dishes) {
        for (UUID dish : dishes) {
            orders.addCartItem(customerActor, new AddCartItemRequest(dish, 1));
        }
        var checkout = orders.checkout(customerActor, new CheckoutRequest(address, null));
        context.getBean(PaymentCallbackService.class).markCheckoutPaid(checkout.id(), customer, "test payment");
        return checkout.orders().getFirst().id();
    }

    private UUID mealPlanOrder(Instant serviceAt) {
        UUID occurrence = UUID.randomUUID();
        var event = new EventEnvelope<>(UUID.randomUUID(), SubscriptionOrderModels.EVENT_TYPE, "v1", Instant.now(), occurrence,
            UUID.randomUUID(), occurrence, new RequestedData(occurrence, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), serviceAt, List.of(new RequestedItem(UUID.randomUUID(), 1, 1))));
        var dropoff = new CustomerAddressSnapshotResponse(UUID.randomUUID(), "Customer", "+919000000000", "1 Road", null, null,
            "Area", "Hyderabad", "Telangana", "500001", new BigDecimal("17.385"), new BigDecimal("78.4867"));
        var pickup = new KitchenPickupSnapshotResponse(kitchen, "Kitchen", "+919000000001", null, "2 Road", null, null,
            "Area", "Hyderabad", "Telangana", "500001", new BigDecimal("17.385"), new BigDecimal("78.4867"));
        return new SubscriptionOrderRepository(jdbc).create(event, JsonNodeFactory.instance.objectNode(), kitchen, "Kitchen",
            dropoff, pickup, List.of(new ValidatedItem(UUID.randomUUID(), "Dal rice", "MEAL", "VEG", 500, false, 1)), 500, false)
            .orderId();
    }

    private Map<String, Object> order(UUID id) {
        return jdbc.queryForMap("SELECT status, prep_time_minutes, chef_response_note, accepted_at, ready_at, "
            + "chef_acceptance_initial_recorded_at FROM order_schema.customer_order WHERE id = ?", id);
    }

    private List<Map<String, Object>> history(UUID id) {
        return jdbc.queryForList("SELECT old_status, new_status, actor_identity_id, reason FROM order_schema.order_status_history "
            + "WHERE order_id = ? AND new_status = 'CHEF_ACCEPTED'", id);
    }

    private Map<String, Object> notification(String eventKey) {
        return jdbc.queryForMap("SELECT title, user_role, user_identity_id FROM order_schema.notification_outbox "
            + "WHERE event_key = ?", eventKey);
    }

    private long count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM order_schema." + table, Long.class);
    }
}
