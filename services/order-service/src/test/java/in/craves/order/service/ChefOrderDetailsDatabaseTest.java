package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import in.craves.order.delivery.DeliveryStatusCustomerNotificationService;
import in.craves.order.delivery.DeliveryStatusEventValidator;
import in.craves.order.delivery.DeliveryStatusModels.DeliveryStatusChangedData;
import in.craves.order.delivery.DeliveryStatusModels.EventEnvelope;
import in.craves.order.delivery.DeliveryStatusTransitionPolicy;
import in.craves.order.delivery.DeliveryStatusUpdateService;
import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CatalogClient.CatalogKitchen;
import in.craves.order.service.CatalogClient.CatalogMenuItem;
import in.craves.order.service.CustomerAddressClient.CustomerAddress;
import in.craves.order.web.ApiDtos.AddCartItemRequest;
import in.craves.order.web.ApiDtos.CartSnapshotItem;
import in.craves.order.web.ApiDtos.CartSnapshotRequest;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.OrderResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import in.craves.order.web.CheckoutOperationDtos.Request;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;

/** Real PostgreSQL behaviour of the chef-app order additions (deadline, note, history, partner, handed over). */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class ChefOrderDetailsDatabaseTest {
    private static final Instant T0 = Instant.parse("2026-10-13T10:00:00Z");

    private final UUID customer = UUID.randomUUID();
    private final UUID chef = UUID.randomUUID();
    private final UUID kitchen = UUID.randomUUID();
    private final UUID menu = UUID.randomUUID();
    private final UUID address = UUID.randomUUID();
    private final CravesPrincipal customerActor = new CravesPrincipal(customer, "", Set.of("CUSTOMER"));
    private final CravesPrincipal chefActor = new CravesPrincipal(chef, "", Set.of("CHEF"));
    private final CravesPrincipal otherChefActor = new CravesPrincipal(UUID.randomUUID(), "", Set.of("CHEF"));
    private JdbcTemplate jdbc;
    private CatalogClient catalog;
    private OrderService orders;
    private DeliveryStatusUpdateService delivery;

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
        when(catalog.getActiveMenuItem(menu)).thenReturn(new CatalogMenuItem(menu, kitchen, "Test meal", "Test meal",
            "MEAL", "VEG", new BigDecimal("369.00"), "INR", 1, 20, "MILD", 500, false, true, "ACTIVE"));
        when(catalog.getKitchen(kitchen)).thenReturn(new CatalogKitchen(kitchen, chef, "Test kitchen", "Test chef",
            "Test", "9000000000", "test@example.invalid", "Test pickup", null, null, "Test area", "Hyderabad",
            "Telangana", "500001", new BigDecimal("17.40"), new BigDecimal("78.40"), "ACTIVE"));
        when(addresses.getActiveOwnedAddress(customer, address)).thenReturn(new CustomerAddress(address, customer,
            "Home", "Test customer", "9000000001", "Test dropoff", null, null, "Test area", "Hyderabad", "Telangana",
            "500001", new BigDecimal("17.41"), new BigDecimal("78.41"), true, true, Instant.now(), Instant.now()));
        orders = new OrderService(jdbc, catalog, addresses, new CheckoutSnapshotFactory(),
            mock(NotificationInternalClient.class));
        delivery = new DeliveryStatusUpdateService(jdbc, new DeliveryStatusEventValidator(),
            new DeliveryStatusTransitionPolicy(), mock(DeliveryStatusCustomerNotificationService.class));
    }

    @Test
    void chefDetailAndListCarryTheStoredAcceptanceDeadlineButOnlyDetailCarriesHistory() {
        UUID id = placeOrder("note");
        jdbc.update("UPDATE order_schema.customer_order SET status = 'CHEF_ACCEPTANCE_PENDING', "
            + "chef_acceptance_requested_at = ?, chef_acceptance_expires_at = ? WHERE id = ?",
            Timestamp.from(T0), Timestamp.from(T0.plusSeconds(1800)), id);

        OrderResponse detail = orders.getChefOrderDetail(chefActor, id);

        assertEquals(T0.plusSeconds(1800), detail.chefAcceptanceExpiresAt());
        assertNotNull(detail.statusHistory());
        assertEquals(T0.plusSeconds(1800), orders.getOrderForChef(chefActor, id).chefAcceptanceExpiresAt());
        assertNull(orders.getOrderForChef(chefActor, id).statusHistory());
        OrderResponse listed = orders.listChefOrders(chefActor).getFirst();
        assertEquals(T0.plusSeconds(1800), listed.chefAcceptanceExpiresAt());
        assertNull(listed.statusHistory());
    }

    @Test
    void checkoutStoresTheTrimmedNoteAndOnlyTheChefSeesIt() {
        UUID id = placeOrder("  Less spicy  ");

        assertEquals("Less spicy", jdbc.queryForObject(
            "SELECT customer_note FROM order_schema.customer_order WHERE id = ?", String.class, id));
        assertEquals("Less spicy", orders.getChefOrderDetail(chefActor, id).customerNote());
        assertNull(orders.getOrderForCustomer(customerActor, id).customerNote());
    }

    @Test
    void blankNoteIsStoredAsNullAndNoteOfExactlyFiveHundredCharactersIsAccepted() {
        UUID blank = placeOrder("   ");
        assertNull(orders.getChefOrderDetail(chefActor, blank).customerNote());

        UUID longest = placeOrder(" " + "x".repeat(500) + " ");
        assertEquals("x".repeat(500), orders.getChefOrderDetail(chefActor, longest).customerNote());
    }

    @Test
    void noteOverFiveHundredCharactersIsCutToItsFirstFiveHundredCodePointsInsteadOfFailingCheckout() {
        String note = "x".repeat(499) + "y" + "z";

        UUID id = placeOrder(note);

        assertEquals(note.substring(0, 500), orders.getChefOrderDetail(chefActor, id).customerNote());
        assertEquals(1, count("customer_order"));
        assertEquals(0, count("cart_item"));
    }

    @Test
    void theCutNeverSplitsASurrogatePair() {
        String smile = new String(Character.toChars(0x1F600));

        // 499 letters, a 2-char code point straddling the 500-char mark, then more text.
        UUID straddling = placeOrder("x".repeat(499) + smile + "tail");
        assertEquals("x".repeat(499) + smile, orders.getChefOrderDetail(chefActor, straddling).customerNote());

        // 501 code points of 2 chars each: 500 whole code points are kept (varchar(500) counts code points).
        UUID allPairs = placeOrder(smile.repeat(501));
        assertEquals(smile.repeat(500), orders.getChefOrderDetail(chefActor, allPairs).customerNote());
    }

    @Test
    void aLongNoteThroughTheCheckoutOperationPathSucceedsAndKeepsTheRequestFingerprint() {
        orders.addCartItem(customerActor, new AddCartItemRequest(menu, 1));
        var cart = orders.getCart(customerActor);
        var snapshot = new CartSnapshotRequest(cart.id(), cart.items().stream()
            .map(item -> new CartSnapshotItem(item.id(), item.quantity(), item.updatedAt())).toList());
        var request = new Request(address, "y".repeat(1200), snapshot);
        var operations = new CheckoutOperationService(jdbc, orders);
        UUID key = UUID.randomUUID();

        var first = operations.execute(customerActor, key, request);

        assertEquals("SUCCEEDED", first.status());
        UUID orderId = jdbc.queryForObject(
            "SELECT id FROM order_schema.customer_order WHERE checkout_id = ?", UUID.class, first.checkoutId());
        assertEquals("y".repeat(500), orders.getChefOrderDetail(chefActor, orderId).customerNote());
        // The receipt is keyed on the note exactly as the client sent it, not on the stored cut.
        assertEquals(CheckoutOperationFingerprint.of(request), jdbc.queryForObject(
            "SELECT request_hash FROM order_schema.checkout_operation WHERE operation_id = ?", String.class, key));
        assertEquals(first, operations.execute(customerActor, key, request));
        // Two notes that differ only past the cut are still different requests for the same key.
        var otherTail = new Request(address, "y".repeat(500) + "z".repeat(700), snapshot);
        assertEquals("CHECKOUT_OPERATION_CONFLICT",
            assertThrows(OrderApiException.class, () -> operations.execute(customerActor, key, otherTail)).code());
        assertEquals(1, count("checkout"));
        assertEquals(1, count("checkout_operation"));
    }

    @Test
    void statusHistoryIsOldestFirst() {
        UUID id = placeOrder("note");
        jdbc.update("DELETE FROM order_schema.order_status_history WHERE order_id = ?", id);
        // Inserted newest first on purpose: the response must be ordered by time, not by insertion.
        history(id, "CHEF_ACCEPTED", T0.plusSeconds(120));
        history(id, "PAYMENT_PENDING", T0);
        history(id, "CHEF_ACCEPTANCE_PENDING", T0.plusSeconds(60));

        var history = orders.getChefOrderDetail(chefActor, id).statusHistory();

        assertEquals(java.util.List.of(OrderStatus.PAYMENT_PENDING, OrderStatus.CHEF_ACCEPTANCE_PENDING,
            OrderStatus.CHEF_ACCEPTED), history.stream().map(entry -> entry.status()).toList());
        assertEquals(T0.plusSeconds(60), history.get(1).at());
    }

    @Test
    void statusHistorySkipsARowWithAnUnknownStatusInsteadOfFailingTheRoute() {
        UUID id = placeOrder("note");
        jdbc.update("DELETE FROM order_schema.order_status_history WHERE order_id = ?", id);
        history(id, "PAYMENT_PENDING", T0);
        history(id, "LEGACY_UNKNOWN_STATUS", T0.plusSeconds(30));
        history(id, "CHEF_ACCEPTED", T0.plusSeconds(60));

        var history = orders.getChefOrderDetail(chefActor, id).statusHistory();

        assertEquals(java.util.List.of(OrderStatus.PAYMENT_PENDING, OrderStatus.CHEF_ACCEPTED),
            history.stream().map(entry -> entry.status()).toList());
    }

    @Test
    void courierDetailsFromADeliveryEventFillThePartnerAndLaterEventsWithoutThemKeepIt() {
        UUID id = placeOrder("note");
        UUID checkoutId = prepareForDelivery(id);
        assertNull(orders.getChefOrderDetail(chefActor, id).deliveryPartner());

        accept(checkoutId, id, "COURIER_ASSIGNED", T0, "Ravi", "+919000000002", "https://cdn.example/ravi.jpg", T0.plusSeconds(600));
        var partner = orders.getChefOrderDetail(chefActor, id).deliveryPartner();
        assertEquals("Ravi", partner.name());
        assertEquals("+919000000002", partner.phone());
        assertEquals("https://cdn.example/ravi.jpg", partner.photoUrl());
        assertEquals(T0.plusSeconds(600), partner.pickupEtaAt());

        accept(checkoutId, id, "COURIER_TO_PICKUP", T0.plusSeconds(30), null, null, null, null);
        assertEquals(partner, orders.getChefOrderDetail(chefActor, id).deliveryPartner());

        accept(checkoutId, id, "COURIER_TO_PICKUP", T0.plusSeconds(60), "Ravi K", null, null, T0.plusSeconds(300));
        var updated = orders.getChefOrderDetail(chefActor, id).deliveryPartner();
        assertEquals("Ravi K", updated.name());
        assertEquals("+919000000002", updated.phone());
        assertEquals(T0.plusSeconds(300), updated.pickupEtaAt());
    }

    @Test
    void aStaleDeliveryEventNeverOverwritesTheCourier() {
        UUID id = placeOrder("note");
        UUID checkoutId = prepareForDelivery(id);
        accept(checkoutId, id, "COURIER_ASSIGNED", T0.plusSeconds(60), "Ravi", "+919000000002", null, null);

        accept(checkoutId, id, "COURIER_ASSIGNED", T0, "Someone Else", "+910000000000", null, null);

        assertEquals("Ravi", orders.getChefOrderDetail(chefActor, id).deliveryPartner().name());
    }

    @Test
    void courierDetailsNeverReachTheCustomerOrAnotherChef() {
        UUID id = placeOrder("note");
        UUID checkoutId = prepareForDelivery(id);
        accept(checkoutId, id, "COURIER_ASSIGNED", T0, "Ravi", "+919000000002", null, null);

        assertEquals("Ravi", orders.getChefOrderDetail(chefActor, id).deliveryPartner().name());
        assertNull(orders.getOrderForCustomer(customerActor, id).deliveryPartner());
        assertNull(orders.listCustomerOrders(customerActor).getFirst().deliveryPartner());
        assertEquals(HttpStatus.FORBIDDEN,
            assertThrows(ResponseStatusException.class, () -> orders.getChefOrderDetail(otherChefActor, id)).getStatusCode());
        assertTrue(orders.listChefOrders(otherChefActor).isEmpty());
    }

    @Test
    void handedOverRecordsTheTimeOnceAndKeepsTheStatus() {
        UUID id = placeOrder("note");
        jdbc.update("UPDATE order_schema.customer_order SET status = 'READY_FOR_PICKUP' WHERE id = ?", id);

        OrderResponse first = orders.markHandedOver(chefActor, id);
        OrderResponse second = orders.markHandedOver(chefActor, id);

        assertNotNull(first.chefHandedOverAt());
        assertEquals(first.chefHandedOverAt(), second.chefHandedOverAt());
        assertEquals(OrderStatus.READY_FOR_PICKUP, second.status());

        // The provider moves the order on; a retry of the same hand-over is still a success.
        jdbc.update("UPDATE order_schema.customer_order SET status = 'OUT_FOR_DELIVERY' WHERE id = ?", id);
        assertEquals(first.chefHandedOverAt(), orders.markHandedOver(chefActor, id).chefHandedOverAt());
        assertEquals(first.chefHandedOverAt(), orders.getChefOrderDetail(chefActor, id).chefHandedOverAt());
    }

    @Test
    void handedOverIsRejectedUnlessTheOrderIsReadyForPickup() {
        UUID id = placeOrder("note");
        jdbc.update("UPDATE order_schema.customer_order SET status = 'PREPARING' WHERE id = ?", id);

        OrderApiException failure = assertThrows(OrderApiException.class, () -> orders.markHandedOver(chefActor, id));

        assertEquals(HttpStatus.CONFLICT, failure.status());
        assertEquals("ORDER_STATUS_CONFLICT", failure.code());
        assertNull(jdbc.queryForObject(
            "SELECT chef_handed_over_at FROM order_schema.customer_order WHERE id = ?", Timestamp.class, id));
    }

    @Test
    void handedOverFollowsTheSameOwnershipRulesAsTheOtherChefActions() {
        UUID id = placeOrder("note");
        jdbc.update("UPDATE order_schema.customer_order SET status = 'READY_FOR_PICKUP' WHERE id = ?", id);

        assertEquals(HttpStatus.FORBIDDEN,
            assertThrows(ResponseStatusException.class, () -> orders.markHandedOver(otherChefActor, id)).getStatusCode());
        assertEquals(HttpStatus.FORBIDDEN,
            assertThrows(ResponseStatusException.class, () -> orders.markHandedOver(customerActor, id)).getStatusCode());
        assertNull(jdbc.queryForObject(
            "SELECT chef_handed_over_at FROM order_schema.customer_order WHERE id = ?", Timestamp.class, id));
    }

    // Production 25 Oct: one newer order from a kitchen Catalog no longer serves failed every chef's list.
    @Test
    void anotherKitchensOrderNeverReachesCatalogOrBreaksTheChefList() {
        UUID mine = placeOrder("note");
        UUID theirs = placeOrder("note");
        UUID closedKitchen = UUID.randomUUID();
        jdbc.update("UPDATE order_schema.customer_order SET kitchen_id = ?, chef_identity_id = ?, "
            + "created_at = created_at + interval '1 minute' WHERE id = ?", closedKitchen, UUID.randomUUID(), theirs);
        when(catalog.getKitchen(closedKitchen)).thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Kitchen is not active"));

        assertEquals(List.of(mine), orders.listChefOrders(chefActor).stream().map(OrderResponse::id).toList());
    }

    // The Hikari pool is 3 per replica; a read that took a second connection per request stalled at a few parallel polls.
    @Test
    void orderReadsWorkOnAPoolOfOneConnection() {
        UUID id = placeOrder("note");
        UUID checkoutId = jdbc.queryForObject("SELECT checkout_id FROM order_schema.customer_order WHERE id = ?", UUID.class, id);
        try (var one = new com.zaxxer.hikari.HikariDataSource()) {
            one.setJdbcUrl(System.getenv("LEDGER_TEST_JDBC_URL"));
            one.setUsername(System.getenv("LEDGER_TEST_DB_USER"));
            one.setPassword(System.getenv("LEDGER_TEST_DB_PASSWORD"));
            one.setMaximumPoolSize(1);
            one.setConnectionTimeout(250);
            CatalogClient catalog = mock(CatalogClient.class);
            when(catalog.getKitchen(kitchen)).thenReturn(new CatalogKitchen(kitchen, chef, "Test kitchen", "Test chef",
                "Test", "9000000000", "test@example.invalid", "Test pickup", null, null, "Test area", "Hyderabad",
                "Telangana", "500001", new BigDecimal("17.40"), new BigDecimal("78.40"), "ACTIVE"));
            OrderService pooled = new OrderService(new JdbcTemplate(one), catalog, mock(CustomerAddressClient.class),
                new CheckoutSnapshotFactory(), mock(NotificationInternalClient.class));

            assertEquals(1, pooled.getCheckout(customerActor, checkoutId).orders().getFirst().items().size());
            assertEquals(1, pooled.listCustomerOrders(customerActor).getFirst().items().size());
            assertEquals(1, pooled.getOrderForCustomer(customerActor, id).items().size());
            assertEquals(1, pooled.getChefOrderDetail(chefActor, id).items().size());
            assertEquals(1, pooled.listChefOrders(chefActor).getFirst().items().size());
        }
    }

    private UUID placeOrder(String note) {
        orders.addCartItem(customerActor, new AddCartItemRequest(menu, 1));
        return orders.checkout(customerActor, new CheckoutRequest(address, note)).orders().getFirst().id();
    }

    private UUID prepareForDelivery(UUID orderId) {
        jdbc.update("UPDATE order_schema.customer_order SET status = 'READY_FOR_PICKUP', "
            + "accepted_at = now() - interval '20 minutes' WHERE id = ?", orderId);
        return jdbc.queryForObject("SELECT checkout_id FROM order_schema.customer_order WHERE id = ?", UUID.class, orderId);
    }

    private void accept(UUID checkoutId, UUID orderId, String status, Instant observedAt,
                        String courierName, String courierPhone, String courierPhotoUrl, Instant pickupEtaAt) {
        UUID jobId = UUID.nameUUIDFromBytes(orderId.toString().getBytes());
        var data = new DeliveryStatusChangedData(jobId, checkoutId, orderId, "borzo", "borzo-1", status, null,
            observedAt, null, null, null, courierName, courierPhone, courierPhotoUrl, pickupEtaAt);
        delivery.accept(new EventEnvelope<>(UUID.randomUUID(), "DELIVERY_STATUS_CHANGED", "1.0", observedAt, checkoutId,
            null, "integration-service", "delivery-job/" + jobId, data), "{}");
    }

    private void history(UUID orderId, String status, Instant at) {
        jdbc.update("INSERT INTO order_schema.order_status_history (id, order_id, old_status, new_status, created_at) "
            + "VALUES (?, ?, NULL, ?, ?)", UUID.randomUUID(), orderId, status, Timestamp.from(at));
    }

    private long count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM order_schema." + table, Long.class);
    }
}
