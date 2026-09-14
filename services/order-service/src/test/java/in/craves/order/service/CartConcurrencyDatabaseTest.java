package in.craves.order.service;

import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CatalogClient.CatalogKitchen;
import in.craves.order.service.CatalogClient.CatalogMenuItem;
import in.craves.order.web.ApiDtos.AddCartItemRequest;
import in.craves.order.web.ApiDtos.UpdateCartItemRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
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
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Runs only against the explicitly disposable PostgreSQL service in CI. */
@EnabledIfEnvironmentVariable(named = "CRAVES_DISPOSABLE_TEST_DATABASE", matches = "true")
class CartConcurrencyDatabaseTest {
    @Configuration @EnableTransactionManagement static class Config {}
    AnnotationConfigApplicationContext context;
    JdbcTemplate jdbc;
    OrderService orders;
    final UUID owner = UUID.randomUUID(), kitchen = UUID.randomUUID(), menu = UUID.randomUUID();
    final CravesPrincipal customer = new CravesPrincipal(owner, "", Set.of("CUSTOMER"));

    @BeforeEach void setup() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertNotNull(url);
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds); jdbc.setQueryTimeout(10);
        jdbc.execute("DROP SCHEMA IF EXISTS order_schema CASCADE");
        jdbc.execute("CREATE SCHEMA IF NOT EXISTS catalog_schema");
        jdbc.execute("CREATE TABLE IF NOT EXISTS catalog_schema.kitchen_profile(id UUID PRIMARY KEY,identity_id UUID NOT NULL UNIQUE)");
        var flyway = Flyway.configure().dataSource(ds).defaultSchema("order_schema").schemas("order_schema")
            .locations("classpath:db/migration").load();
        flyway.migrate(); flyway.validate(); assertEquals(0, flyway.migrate().migrationsExecuted);
        var catalog = mock(CatalogClient.class);
        when(catalog.getActiveMenuItem(any())).thenAnswer(call -> new CatalogMenuItem(call.getArgument(0), kitchen,
            "Fixture meal", "Fixture meal", "MEAL", "VEG", new BigDecimal("10.00"), "INR", 1, 20,
            "MILD", 500, false, true, "ACTIVE"));
        when(catalog.getKitchen(kitchen)).thenReturn(new CatalogKitchen(kitchen, UUID.randomUUID(),
            "Fixture kitchen", "Fixture chef", "Fixture area", "Hyderabad", "ACTIVE"));
        context = new AnnotationConfigApplicationContext(); context.register(Config.class);
        context.registerBean(JdbcTemplate.class, () -> jdbc);
        context.registerBean(DataSourceTransactionManager.class, () -> new DataSourceTransactionManager(ds));
        context.registerBean(CatalogClient.class, () -> catalog);
        context.registerBean(CustomerAddressClient.class, () -> mock(CustomerAddressClient.class));
        context.registerBean(CheckoutSnapshotFactory.class, CheckoutSnapshotFactory::new);
        context.registerBean(NotificationInternalClient.class, () -> mock(NotificationInternalClient.class));
        context.registerBean(OrderService.class); context.refresh(); orders = context.getBean(OrderService.class);
    }
    @AfterEach void close() { if (context != null) context.close(); }

    <T> List<T> concurrent(int workers, Callable<T> operation) throws Exception {
        try (var executor = Executors.newFixedThreadPool(workers)) {
            var ready = new CountDownLatch(workers); var start = new CountDownLatch(1);
            var tasks = java.util.stream.IntStream.range(0, workers).mapToObj(i -> executor.submit(() -> {
                ready.countDown(); assertTrue(start.await(5, TimeUnit.SECONDS)); return operation.call();
            })).toList();
            assertTrue(ready.await(5, TimeUnit.SECONDS)); start.countDown();
            var results = new java.util.ArrayList<T>();
            for (var task : tasks) results.add(task.get(15, TimeUnit.SECONDS));
            return results;
        }
    }
    int quantity() { return orders.getCart(customer).items().getFirst().quantity(); }

    @Test void concurrentFirstUseReturnsExactlyOneOwnedCart() throws Exception {
        var ids = concurrent(12, () -> orders.getCart(customer).id());
        assertEquals(1, Set.copyOf(ids).size());
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM order_schema.cart WHERE customer_identity_id=?", Integer.class, owner));
    }
    @Test void concurrentAddsDoNotLoseQuantities() throws Exception {
        concurrent(12, () -> orders.addCartItem(customer, new AddCartItemRequest(menu, 1)));
        assertEquals(12, quantity());
        assertEquals(new BigDecimal("120.00"), orders.getCart(customer).totals().foodSubtotal());
    }
    @Test void competingIncrementsAtLimitAcceptOnlyOne() throws Exception {
        orders.addCartItem(customer, new AddCartItemRequest(menu, 99));
        var results = concurrent(8, () -> {
            try { orders.addCartItem(customer, new AddCartItemRequest(menu, 1)); return "ACCEPTED"; }
            catch (OrderApiException ex) { return ex.code(); }
        });
        assertEquals(1, results.stream().filter("ACCEPTED"::equals).count());
        assertEquals(7, results.stream().filter("CART_QUANTITY_LIMIT"::equals).count());
        assertEquals(100, quantity());
    }
    @Test void rejectedAggregateLeavesExistingCartReadableAndUnchanged() {
        orders.addCartItem(customer, new AddCartItemRequest(menu, 100));
        assertEquals("CART_QUANTITY_LIMIT", assertThrows(OrderApiException.class,
            () -> orders.addCartItem(customer, new AddCartItemRequest(menu, 1))).code());
        assertEquals(100, quantity());
        assertEquals(new BigDecimal("1000.00"), orders.getCart(customer).totals().foodSubtotal());
    }
    @Test void anotherOwnerCannotChangeOrRemoveAnItem() {
        var item = orders.addCartItem(customer, new AddCartItemRequest(menu, 2)).items().getFirst();
        var other = new CravesPrincipal(UUID.randomUUID(), "", Set.of("CUSTOMER"));
        assertThrows(ResponseStatusException.class, () -> orders.updateCartItem(other, item.id(), new UpdateCartItemRequest(1)));
        orders.removeCartItem(other, item.id()); assertEquals(2, quantity());
    }
    @Test void distinctItemLimitIsAtomicAndDoesNotPreventExistingItemChanges() throws Exception {
        for (int i = 0; i < 199; i++) orders.addCartItem(customer, new AddCartItemRequest(UUID.randomUUID(), 1));
        var results = concurrent(4, () -> {
            try { orders.addCartItem(customer, new AddCartItemRequest(UUID.randomUUID(), 1)); return "ACCEPTED"; }
            catch (OrderApiException ex) { return ex.code(); }
        });
        assertEquals(1, results.stream().filter("ACCEPTED"::equals).count());
        assertEquals(3, results.stream().filter("CART_ITEM_LIMIT"::equals).count());
        var cart = orders.getCart(customer); assertEquals(200, cart.items().size());
        orders.updateCartItem(customer, cart.items().getFirst().id(), new UpdateCartItemRequest(2));
        assertEquals(200, orders.getCart(customer).items().size());
    }
}
