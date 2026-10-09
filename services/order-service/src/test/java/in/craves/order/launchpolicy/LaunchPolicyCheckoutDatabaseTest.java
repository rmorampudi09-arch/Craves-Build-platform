package in.craves.order.launchpolicy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.exception.OrderApiException;
import in.craves.order.launchpolicy.LaunchPolicyModels.LaunchPolicyResponse;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.*;
import in.craves.order.service.CatalogClient.CatalogKitchen;
import in.craves.order.service.CatalogClient.CatalogMenuItem;
import in.craves.order.service.CustomerAddressClient.CustomerAddress;
import in.craves.order.web.*;
import in.craves.order.web.ApiDtos.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Both real MVC routes, Spring transaction proxies and migrated disposable PostgreSQL; no provider calls. */
@EnabledIfEnvironmentVariable(named = "CRAVES_DISPOSABLE_TEST_DATABASE", matches = "true")
class LaunchPolicyCheckoutDatabaseTest {
    enum Route { LEGACY, OPERATION }
    @Configuration @EnableAspectJAutoProxy(proxyTargetClass = true) @EnableTransactionManagement
    static class Config {}

    final UUID owner = UUID.randomUUID(), chef = UUID.randomUUID(), kitchen = UUID.randomUUID(),
        menu = UUID.randomUUID(), address = UUID.randomUUID();
    final CravesPrincipal actor = new CravesPrincipal(owner, "", Set.of("CUSTOMER"));
    final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    AnnotationConfigApplicationContext context;
    JdbcTemplate jdbc;
    DriverManagerDataSource dataSource;
    OrderService orders;
    CheckoutOperationService operations;
    CatalogClient catalog;
    CustomerAddressClient addresses;
    NotificationInternalClient notifications;
    LaunchPolicyService policies;
    MockMvc mvc;

    @BeforeEach void setup() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertNotNull(url);
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"),
            "Only the explicitly disposable loopback checkout fixture is allowed");
        dataSource = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(dataSource);
        jdbc.setQueryTimeout(15);
        assertEquals("chef_ledger_test", jdbc.queryForObject("SELECT current_database()", String.class));
        jdbc.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        jdbc.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY, identity_id UUID NOT NULL UNIQUE)");
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id, identity_id) VALUES (?, ?)", kitchen, chef);
        var flyway = Flyway.configure().dataSource(dataSource).defaultSchema("order_schema").schemas("order_schema")
            .locations("classpath:db/migration").load();
        flyway.migrate(); flyway.validate(); assertEquals(0, flyway.migrate().migrationsExecuted);
        catalog = mock(CatalogClient.class);
        addresses = mock(CustomerAddressClient.class);
        notifications = mock(NotificationInternalClient.class);
        policies = mock(LaunchPolicyService.class);
        when(policies.requireActive()).thenReturn(policy("INR"));
        when(catalog.getKitchen(kitchen)).thenReturn(kitchenAt("17.40", "78.40"));
        when(addresses.getActiveOwnedAddress(owner, address)).thenReturn(new CustomerAddress(address, owner,
            "Home", "Fixture customer", "9000000001", "Fixture dropoff", null, null, "Fixture area",
            "Hyderabad", "Telangana", "500001", new BigDecimal("17.41"), new BigDecimal("78.41"),
            true, true, Instant.now(), Instant.now()));
        currentPrice("250.00");
        configure("true");
        orders.addCartItem(actor, new AddCartItemRequest(menu, 1));
        clearInvocations(catalog, addresses, policies, notifications);
    }

    void configure(String enforcement) {
        if (context != null) context.close();
        context = new AnnotationConfigApplicationContext();
        if (enforcement != null) context.getEnvironment().getPropertySources().addFirst(new MapPropertySource(
            "checkout-policy-test", Map.of("craves.launch-policy.enforcement-enabled", enforcement)));
        context.register(Config.class);
        context.registerBean(JdbcTemplate.class, () -> jdbc);
        context.registerBean(DataSourceTransactionManager.class, () -> new DataSourceTransactionManager(dataSource));
        context.registerBean(CatalogClient.class, () -> catalog);
        context.registerBean(CustomerAddressClient.class, () -> addresses);
        context.registerBean(CheckoutSnapshotFactory.class, CheckoutSnapshotFactory::new);
        context.registerBean(NotificationInternalClient.class, () -> notifications);
        context.registerBean("launchPolicyService", LaunchPolicyService.class, () -> policies);
        // Discover the production conditional launch-policy wiring, rather than attaching test-only advice.
        context.scan("in.craves.order.launchpolicy");
        context.registerBean(OrderService.class);
        context.registerBean(CheckoutOperationService.class);
        context.refresh();
        orders = context.getBean(OrderService.class);
        operations = context.getBean(CheckoutOperationService.class);
        assertTrue(AopUtils.isAopProxy(orders)); assertTrue(AopUtils.isAopProxy(operations));
        mvc = MockMvcBuilders.standaloneSetup(new CheckoutController(orders), new CheckoutOperationController(operations))
            .setControllerAdvice(new OrderApiExceptionHandler())
            .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver()).build();
    }

    @AfterEach void close() {
        SecurityContextHolder.clearContext();
        if (context != null) context.close();
    }

    LaunchPolicyResponse policy(String currency) {
        return new LaunchPolicyResponse(UUID.randomUUID(), "Disposable test policy", new BigDecimal("200.00"),
            5000, 0, 60, currency, true, UUID.randomUUID(), Instant.now(), Instant.now());
    }
    CatalogMenuItem item(UUID id, String price) {
        return new CatalogMenuItem(id, kitchen, "Fixture meal", "Fixture meal", "MEAL", "VEG", new BigDecimal(price),
            "INR", 1, 20, "MILD", 500, false, true, "ACTIVE");
    }
    CatalogKitchen kitchenAt(String latitude, String longitude) {
        return new CatalogKitchen(kitchen, chef, "Fixture kitchen", "Fixture chef", "Fixture kitchen",
            "9000000000", "test@example.invalid", "Fixture pickup", null, null, "Fixture area", "Hyderabad",
            "Telangana", "500001", new BigDecimal(latitude), new BigDecimal(longitude), "ACTIVE");
    }
    void currentPrice(String value) { when(catalog.getActiveMenuItem(menu)).thenReturn(item(menu, value)); }
    void stalePrice(String value) { jdbc.update("UPDATE order_schema.cart_item SET unit_price_snapshot = ?", new BigDecimal(value)); }
    CheckoutOperationDtos.Request request() {
        var cart = orders.getCart(actor);
        return new CheckoutOperationDtos.Request(address, "Fixture checkout", new CartSnapshotRequest(cart.id(), cart.items().stream()
            .map(i -> new CartSnapshotItem(i.id(), i.quantity(), i.updatedAt())).toList()));
    }
    MvcResult postCheckout(Route route, UUID operationId, CheckoutOperationDtos.Request request) throws Exception {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(actor, null, "ROLE_CUSTOMER"));
        try {
            String path = route == Route.LEGACY ? "/api/v1/checkout" : "/api/v1/checkout/operations/" + operationId;
            Object body = route == Route.LEGACY ? new CheckoutRequest(request.deliveryAddressId(), request.note()) : request;
            return mvc.perform(post(path).contentType("application/json").content(json.writeValueAsBytes(body))).andReturn();
        } finally { SecurityContextHolder.clearContext(); }
    }
    MvcResult checkout(Route route) throws Exception { return postCheckout(route, UUID.randomUUID(), request()); }
    JsonNode body(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsString()); }
    long count(String table) { return jdbc.queryForObject("SELECT count(*) FROM order_schema." + table, Long.class); }
    List<Map<String, Object>> cartRows() { return jdbc.queryForList("SELECT * FROM order_schema.cart_item ORDER BY id"); }
    void assertNoCheckoutEffects() {
        for (String table : List.of("checkout", "customer_order", "order_item", "order_status_history", "checkout_operation",
            "notification_outbox", "domain_event_outbox", "finance_source_outbox", "referral_source_outbox",
            "order_financial_snapshot", "referral_order_binding")) assertEquals(0, count(table), table);
        verifyNoInteractions(notifications);
    }
    void rejected(Route route, String code) throws Exception {
        var before = cartRows();
        var result = checkout(route);
        assertEquals(code, body(result).path("error").asText(), result.getResponse().getContentAsString());
        assertTrue(result.getResponse().getStatus() >= 400);
        assertEquals(before, cartRows(), "Rejected checkout must roll back all price refreshes");
        assertNoCheckoutEffects();
    }
    UUID accepted(Route route, String subtotal) throws Exception {
        var result = checkout(route);
        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        UUID id = UUID.fromString(body(result).path(route == Route.LEGACY ? "id" : "checkoutId").asText());
        assertEquals(new BigDecimal(subtotal), jdbc.queryForObject("SELECT food_subtotal FROM order_schema.checkout WHERE id=?", BigDecimal.class, id));
        assertEquals(new BigDecimal(subtotal), jdbc.queryForObject("SELECT food_subtotal FROM order_schema.customer_order", BigDecimal.class));
        assertEquals(new BigDecimal(subtotal), jdbc.queryForObject("SELECT SUM(line_total) FROM order_schema.order_item", BigDecimal.class));
        assertEquals(1, count("checkout")); assertEquals(1, count("customer_order")); assertEquals(0, count("cart_item"));
        assertEquals(route == Route.OPERATION ? 1 : 0, count("checkout_operation"));
        verify(notifications, times(1)).orderCreated(any());
        return id;
    }

    @ParameterizedTest @EnumSource(Route.class)
    void staleAboveMinimumCurrentBelowMustRejectBeforeAnyCheckoutWrite(Route route) throws Exception {
        currentPrice("150.00"); rejected(route, "MINIMUM_ORDER_NOT_MET");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void staleBelowMinimumCurrentAboveMustPass(Route route) throws Exception {
        stalePrice("150.00"); accepted(route, "250.00");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void exactMinimumIsAccepted(Route route) throws Exception {
        stalePrice("150.00"); currentPrice("200.00"); accepted(route, "200.00");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void onePaiseBelowMinimumIsRejected(Route route) throws Exception {
        currentPrice("199.99"); rejected(route, "MINIMUM_ORDER_NOT_MET");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void onePaiseAboveMinimumIsAccepted(Route route) throws Exception {
        stalePrice("150.00"); currentPrice("200.01"); accepted(route, "200.01");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void minimumUsesFoodOnlyEvenWhenFeesMakeGrandTotalEligible(Route route) throws Exception {
        jdbc.update("UPDATE order_schema.charge_policy SET delivery_fee_flat=100, platform_fee_flat=50, tax_percent=5 WHERE is_active=true");
        currentPrice("150.00"); rejected(route, "MINIMUM_ORDER_NOT_MET");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void minimumIncludesQuantityAndAllFoodLines(Route route) throws Exception {
        UUID other = UUID.randomUUID();
        when(catalog.getActiveMenuItem(other)).thenReturn(item(other, "20.00"));
        orders.addCartItem(actor, new AddCartItemRequest(other, 2));
        currentPrice("160.00"); accepted(route, "200.00");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void subsequentMetadataLookupDoesNotReplaceFrozenPrice(Route route) throws Exception {
        stalePrice("150.00");
        when(catalog.getActiveMenuItem(menu)).thenReturn(item(menu, "250.00"), item(menu, "150.00"));
        accepted(route, "250.00");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void subsequentHigherMetadataPriceCannotRescueBelowMinimumFrozenPrice(Route route) throws Exception {
        when(catalog.getActiveMenuItem(menu)).thenReturn(item(menu, "150.00"), item(menu, "250.00"));
        rejected(route, "MINIMUM_ORDER_NOT_MET");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void explicitFlagOffPreservesDormantBehavior(Route route) throws Exception {
        configure("false"); currentPrice("150.00");
        when(catalog.getKitchen(kitchen)).thenReturn(kitchenAt("18.40", "79.40"));
        accepted(route, "150.00"); verifyNoInteractions(policies);
    }
    @ParameterizedTest @EnumSource(Route.class)
    void absentFlagRemainsOff(Route route) throws Exception {
        configure(null); currentPrice("150.00"); accepted(route, "150.00"); verifyNoInteractions(policies);
    }
    @ParameterizedTest @EnumSource(Route.class)
    void unavailablePolicyFailsClosed(Route route) throws Exception {
        when(policies.requireActive()).thenThrow(OrderApiException.serviceUnavailable("LAUNCH_POLICY_NOT_CONFIGURED", "Fixture unavailable policy"));
        rejected(route, "LAUNCH_POLICY_NOT_CONFIGURED");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void unsupportedPolicyCurrencyFailsClosed(Route route) throws Exception {
        when(policies.requireActive()).thenReturn(policy("USD")); rejected(route, "LAUNCH_POLICY_CURRENCY_UNSUPPORTED");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void unserviceableAddressStillRejects(Route route) throws Exception {
        when(catalog.getKitchen(kitchen)).thenReturn(kitchenAt("18.40", "79.40"));
        rejected(route, "DELIVERY_ADDRESS_OUTSIDE_SERVICE_AREA");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void serviceabilityUsesPickupActuallyFrozenForOrder(Route route) throws Exception {
        when(catalog.getKitchen(kitchen)).thenReturn(kitchenAt("17.40", "78.40"), kitchenAt("18.40", "79.40"));
        rejected(route, "DELIVERY_ADDRESS_OUTSIDE_SERVICE_AREA");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void earlierUnserviceablePickupDoesNotRejectFinalServiceableSnapshot(Route route) throws Exception {
        when(catalog.getKitchen(kitchen)).thenReturn(kitchenAt("18.40", "79.40"), kitchenAt("17.40", "78.40"));
        accepted(route, "250.00");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void policyIsCheckedInsideCartTransactionBeforeCheckoutOrNotifications(Route route) throws Exception {
        when(policies.requireActive()).thenAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            assertEquals(0, count("checkout")); assertEquals(0, count("customer_order"));
            verifyNoInteractions(notifications);
            return policy("INR");
        });
        accepted(route, "250.00");
    }
    @ParameterizedTest @EnumSource(Route.class)
    void ownedActiveAddressCheckCannotBeBypassed(Route route) throws Exception {
        when(addresses.getActiveOwnedAddress(owner, address)).thenThrow(OrderApiException.notFound("DELIVERY_ADDRESS_NOT_AVAILABLE", "Fixture unavailable address"));
        rejected(route, "DELIVERY_ADDRESS_NOT_AVAILABLE");
        verify(addresses).getActiveOwnedAddress(owner, address);
    }
    @ParameterizedTest @EnumSource(Route.class)
    void failedCatalogRefreshLeavesNoPartialCartMutationOrCheckout(Route route) throws Exception {
        UUID other = UUID.randomUUID();
        when(catalog.getActiveMenuItem(other)).thenReturn(item(other, "100.00"));
        orders.addCartItem(actor, new AddCartItemRequest(other, 1));
        var cart = orders.getCart(actor);
        UUID first = cart.items().get(0).menuItemId(), second = cart.items().get(1).menuItemId();
        when(catalog.getActiveMenuItem(first)).thenReturn(item(first, "90.00"));
        when(catalog.getActiveMenuItem(second)).thenThrow(OrderApiException.serviceUnavailable("FIXTURE_CATALOG_UNAVAILABLE", "Fixture catalog failure"));
        rejected(route, "FIXTURE_CATALOG_UNAVAILABLE");
    }
    @Test void completedOperationReplaysOriginalResultAfterPricesAndPolicyChangeWithoutTouchingNewCart() throws Exception {
        var request = request(); var operation = UUID.randomUUID();
        var first = postCheckout(Route.OPERATION, operation, request);
        assertEquals(200, first.getResponse().getStatus());
        currentPrice("150.00"); orders.addCartItem(actor, new AddCartItemRequest(menu, 2));
        var newerCart = cartRows();
        clearInvocations(catalog, addresses, policies, notifications);
        when(policies.requireActive()).thenThrow(new IllegalStateException("Completed replay must not reevaluate policy"));
        var replay = postCheckout(Route.OPERATION, operation, request);
        assertEquals(200, replay.getResponse().getStatus()); assertEquals(body(first), body(replay));
        assertEquals(newerCart, cartRows()); assertEquals(1, count("checkout")); assertEquals(1, count("checkout_operation"));
        verifyNoInteractions(catalog, addresses, policies, notifications);
    }
    @Test void changedOperationPayloadStillConflicts() throws Exception {
        var request = request(); var operation = UUID.randomUUID();
        assertEquals(200, postCheckout(Route.OPERATION, operation, request).getResponse().getStatus());
        var changed = new CheckoutOperationDtos.Request(address, "Changed note", request.expectedCart());
        var result = postCheckout(Route.OPERATION, operation, changed);
        assertEquals(409, result.getResponse().getStatus()); assertEquals("CHECKOUT_OPERATION_CONFLICT", body(result).path("error").asText());
        assertEquals(1, count("checkout")); assertEquals(1, count("checkout_operation"));
        verify(notifications, times(1)).orderCreated(any());
    }
    @Test void staleOperationCartSnapshotCannotCreateCheckout() throws Exception {
        var request = request(); orders.addCartItem(actor, new AddCartItemRequest(menu, 1));
        var before = cartRows();
        var result = postCheckout(Route.OPERATION, UUID.randomUUID(), request);
        assertEquals(409, result.getResponse().getStatus()); assertEquals("CART_CHANGED", body(result).path("error").asText());
        assertEquals(before, cartRows()); assertNoCheckoutEffects();
    }
    @Test void failedMinimumAllowsSameOperationAndExactSnapshotRetryAfterPriceRecovers() throws Exception {
        var request = request(); var operation = UUID.randomUUID(); currentPrice("150.00");
        var before = cartRows(); var rejected = postCheckout(Route.OPERATION, operation, request);
        assertEquals(400, rejected.getResponse().getStatus()); assertEquals(before, cartRows()); assertNoCheckoutEffects();
        currentPrice("250.00");
        assertEquals(200, postCheckout(Route.OPERATION, operation, request).getResponse().getStatus());
        assertEquals(1, count("checkout")); assertEquals(1, count("checkout_operation"));
        verify(notifications, times(1)).orderCreated(any());
    }
    @ParameterizedTest @EnumSource(Route.class)
    void cartMutationWaitsUntilCheckoutCommitsAndBecomesANewCart(Route route) throws Exception {
        var request = request(); var operation = UUID.randomUUID();
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var blockOnce = new AtomicBoolean(true);
        when(catalog.getActiveMenuItem(menu)).thenAnswer(call -> {
            if (blockOnce.compareAndSet(true, false)) {
                assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
                entered.countDown(); assertTrue(release.await(10, TimeUnit.SECONDS));
            }
            return item(menu, "250.00");
        });
        try (var executor = Executors.newFixedThreadPool(2)) {
            var checkout = executor.submit(() -> postCheckout(route, operation, request));
            assertTrue(entered.await(10, TimeUnit.SECONDS));
            var mutation = executor.submit(() -> orders.addCartItem(actor, new AddCartItemRequest(menu, 1)));
            try { awaitCartLockWait(); } finally { release.countDown(); }
            assertEquals(200, checkout.get(15, TimeUnit.SECONDS).getResponse().getStatus());
            assertEquals(1, mutation.get(15, TimeUnit.SECONDS).items().getFirst().quantity());
        } finally { release.countDown(); }
        assertEquals(new BigDecimal("250.00"), jdbc.queryForObject("SELECT food_subtotal FROM order_schema.checkout", BigDecimal.class));
        assertEquals(1, count("cart_item")); assertEquals(1, orders.getCart(actor).items().getFirst().quantity());
        verify(notifications, times(1)).orderCreated(any());
    }
    @ParameterizedTest @EnumSource(Route.class)
    void cartMutationWinningLockIsSeenByLegacyAndRejectedByOldOperationSnapshot(Route route) throws Exception {
        var request = request(); var changed = new CountDownLatch(1); var release = new CountDownLatch(1);
        var transaction = new org.springframework.transaction.support.TransactionTemplate(new DataSourceTransactionManager(dataSource));
        try (var executor = Executors.newFixedThreadPool(2)) {
            var mutation = executor.submit(() -> transaction.execute(status -> {
                orders.addCartItem(actor, new AddCartItemRequest(menu, 1)); changed.countDown();
                try { assertTrue(release.await(10, TimeUnit.SECONDS)); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
                return null;
            }));
            assertTrue(changed.await(10, TimeUnit.SECONDS));
            var checkout = executor.submit(() -> postCheckout(route, UUID.randomUUID(), request));
            try { awaitCartLockWait(); } finally { release.countDown(); }
            mutation.get(15, TimeUnit.SECONDS);
            var result = checkout.get(15, TimeUnit.SECONDS);
            if (route == Route.LEGACY) {
                assertEquals(200, result.getResponse().getStatus());
                assertEquals(new BigDecimal("500.00"), jdbc.queryForObject("SELECT food_subtotal FROM order_schema.checkout", BigDecimal.class));
                assertEquals(0, count("cart_item")); verify(notifications, times(1)).orderCreated(any());
            } else {
                assertEquals(409, result.getResponse().getStatus()); assertEquals("CART_CHANGED", body(result).path("error").asText());
                assertEquals(2, orders.getCart(actor).items().getFirst().quantity()); assertNoCheckoutEffects();
            }
        } finally { release.countDown(); }
    }
    @Test void simultaneousSameOperationCreatesOneCheckoutAndOneNotification() throws Exception {
        var request = request(); var operation = UUID.randomUUID();
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        when(catalog.getActiveMenuItem(menu)).thenAnswer(call -> {
            entered.countDown(); assertTrue(release.await(10, TimeUnit.SECONDS)); return item(menu, "250.00");
        });
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> postCheckout(Route.OPERATION, operation, request));
            assertTrue(entered.await(10, TimeUnit.SECONDS));
            var second = executor.submit(() -> postCheckout(Route.OPERATION, operation, request));
            try { awaitLockWait("%INSERT INTO order_schema.checkout_operation%"); } finally { release.countDown(); }
            var a = first.get(15, TimeUnit.SECONDS); var b = second.get(15, TimeUnit.SECONDS);
            assertEquals(200, a.getResponse().getStatus()); assertEquals(200, b.getResponse().getStatus()); assertEquals(body(a), body(b));
        } finally { release.countDown(); }
        assertEquals(1, count("checkout")); assertEquals(1, count("checkout_operation"));
        verify(notifications, times(1)).orderCreated(any());
    }
    void awaitCartLockWait() throws Exception { awaitLockWait("%FROM order_schema.cart%FOR UPDATE%"); }
    void awaitLockWait(String query) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        while (System.nanoTime() < deadline) {
            Long waiting = jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() "
                + "AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE ?", Long.class, query);
            if (waiting != null && waiting > 0) { System.out.println("OF07 real PostgreSQL lock overlap observed: " + query); return; }
            Thread.sleep(25);
        }
        fail("Did not observe the competing transaction blocked on the expected PostgreSQL row/unique lock: " + query);
    }
}
