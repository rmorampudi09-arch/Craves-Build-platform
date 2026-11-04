package in.craves.order.erasure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.order.erasure.AccountErasureDtos.Blocker;
import in.craves.order.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.order.erasure.AccountErasureDtos.Scope;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
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
 * Account deletion in order-service against a real PostgreSQL: personal text goes, money rows keep their ids and amounts,
 * and an order that is still on its way stops the whole thing.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class AccountErasureDatabaseTest {
    @Configuration
    @EnableTransactionManagement
    static class Config {
    }

    private static final String PHONE = "9876543210";
    private static final String CHEF_PHONE = "9123456780";
    private static final List<String> CHEF_CONTACT = List.of(CHEF_PHONE, "kitchen.owner@example.com", "5 Kitchen Lane", "Floor 2",
        "Opposite the park", "Kondapur", "500084", "17.46", "78.36");
    private static final String ORDER_TABLES = "order_schema.customer_order o";

    private JdbcTemplate jdbc;
    private AnnotationConfigApplicationContext context;
    private AccountErasureService service;
    private final UUID customer = UUID.randomUUID();
    private final UUID other = UUID.randomUUID();
    private final UUID chef = UUID.randomUUID();
    private final UUID request = UUID.randomUUID();

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
        // Through Spring, so the service's own transaction is the one under test.
        context = new AnnotationConfigApplicationContext();
        context.register(Config.class);
        context.registerBean(JdbcTemplate.class, () -> jdbc);
        context.registerBean(DataSourceTransactionManager.class, () -> new DataSourceTransactionManager(ds));
        context.registerBean(AccountErasureService.class);
        context.refresh();
        service = context.getBean(AccountErasureService.class);
        jdbc.update("INSERT INTO order_schema.review_tag_definition(code, display_label, dimension, active, created_by_identity_id, "
            + "updated_by_identity_id) VALUES ('GREAT_TASTE', 'Great taste', 'OVERALL', true, ?, ?)", chef, chef);
    }

    @AfterEach
    void close() {
        if (context != null) {
            context.close();
        }
    }

    @Test
    void eraseCustomerAnonymisesDropoffOnABoundOrderWithoutTouchingMoney() {
        UUID id = order(customer, chef, "PAYMENT_PENDING");
        bindFinancialSnapshot(id);
        jdbc.update("UPDATE order_schema.customer_order SET status = 'CANCELLED' WHERE id = ?", id);
        String moneyBefore = withoutPersonalColumns(id);
        String snapshotBefore = jdbc.queryForObject("SELECT to_jsonb(s)::text FROM order_schema.order_financial_snapshot s", String.class);
        assertTrue(rowOf(id).contains(PHONE));

        ErasureResponse response = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals("DONE", response.status());
        assertEquals(1, response.counts().get("customer_order"));
        assertEquals(1, response.counts().get("checkout"));
        // Amounts, ownership, ids and timestamps are exactly as they were; only the personal columns changed.
        assertEquals(moneyBefore, withoutPersonalColumns(id));
        assertEquals(snapshotBefore, jdbc.queryForObject("SELECT to_jsonb(s)::text FROM order_schema.order_financial_snapshot s", String.class));
        assertEquals(customer, jdbc.queryForObject("SELECT customer_identity_id FROM order_schema.customer_order WHERE id = ?", UUID.class, id));
        for (String row : List.of(rowOf(id), jdbc.queryForObject("SELECT to_jsonb(c)::text FROM order_schema.checkout c", String.class))) {
            for (String gone : List.of(PHONE, "Asha Rao", "12 Lake View Road", "Flat 4B", "Near the temple", "Madhapur", "500081", "17.44", "78.39", "the guard")) {
                assertFalse(row.contains(gone), gone + " is still in " + row);
            }
        }
        // The delivery-address check still holds: an address id is kept, so every dropoff field must still be filled in.
        Map<String, Object> dropoff = jdbc.queryForMap("SELECT * FROM order_schema.customer_order WHERE id = ?", id);
        assertNotNull(dropoff.get("delivery_address_id"));
        assertEquals(AccountErasureService.ERASED_TEXT, dropoff.get("dropoff_recipient_name"));
        assertEquals(AccountErasureService.ERASED_PHONE, dropoff.get("dropoff_contact_phone"));
        assertEquals(AccountErasureService.ERASED_TEXT, dropoff.get("dropoff_address_line1"));
        assertEquals(AccountErasureService.ERASED_POSTAL_CODE, dropoff.get("dropoff_postal_code"));
        assertEquals(0, jdbc.queryForObject(
            "SELECT count(*) FROM order_schema.customer_order WHERE delivery_address_id IS NOT NULL AND (dropoff_recipient_name IS NULL "
                + "OR dropoff_contact_phone IS NULL OR dropoff_address_line1 IS NULL OR dropoff_area_name IS NULL OR dropoff_city IS NULL "
                + "OR dropoff_state IS NULL OR dropoff_postal_code IS NULL OR dropoff_latitude IS NULL OR dropoff_longitude IS NULL)",
            Integer.class));
        assertNull(dropoff.get("customer_note"));
    }

    @Test
    void eraseCustomerDeletesCartReviewsAndDeliveryCodes() {
        UUID delivered = order(customer, chef, "DELIVERED");
        UUID cancelled = order(customer, chef, "CANCELLED");
        UUID othersOrder = order(other, chef, "DELIVERED");
        cart(customer, 2);
        cart(other, 1);
        deliveryCode(delivered);
        deliveryCode(othersOrder);
        UUID mine = review(delivered, customer, chef);
        UUID theirs = review(othersOrder, other, chef);
        attachEverything(mine, other, other);
        attachEverything(theirs, other, other);
        // The person's own vote and report on somebody else's review go too; a third person's stay.
        UUID third = UUID.randomUUID();
        jdbc.update("INSERT INTO order_schema.order_review_helpful_vote(review_id, voter_identity_id) VALUES (?, ?), (?, ?)", theirs, customer, theirs, third);
        jdbc.update("INSERT INTO order_schema.order_review_report(id, review_id, reporter_identity_id, reason_code) VALUES (?, ?, ?, 'SPAM')",
            UUID.randomUUID(), theirs, customer);
        idempotency(customer, "key-one");
        idempotency(customer, "key-two");
        idempotency(other, "key-one");
        String othersRowBefore = rowOf(othersOrder);

        ErasureResponse response = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals("DONE", response.status());
        assertEquals(Map.ofEntries(
            Map.entry("cart_item", 2), Map.entry("cart", 1),
            Map.entry("order_review_report", 2), Map.entry("order_review_helpful_vote", 2),
            Map.entry("order_review_moderation_audit", 1), Map.entry("order_review_media", 1), Map.entry("order_review_tag", 1),
            Map.entry("order_review_revision", 1), Map.entry("order_review", 1), Map.entry("order_delivery_code", 1),
            Map.entry("idempotency_record", 2), Map.entry("notification_outbox", 0), Map.entry("domain_event_outbox", 0),
            Map.entry("delivery_status_inbox", 0), Map.entry("customer_order", 2), Map.entry("checkout", 2)), response.counts());
        assertEquals(0, count("order_schema.cart WHERE customer_identity_id = ?", customer));
        assertEquals(0, count("order_schema.cart_item i JOIN order_schema.cart c ON c.id = i.cart_id WHERE c.customer_identity_id = ?", customer));
        assertEquals(0, count("order_schema.order_review WHERE customer_identity_id = ?", customer));
        assertEquals(0, count("order_schema.order_review_helpful_vote WHERE voter_identity_id = ? OR review_id = ?", customer, mine));
        for (String table : List.of("order_review_tag", "order_review_media", "order_review_revision", "order_review_moderation_audit",
            "order_review_helpful_vote", "order_review_report")) {
            assertEquals(0, count("order_schema." + table + " WHERE review_id = ?", mine), table);
        }
        assertEquals(0, count("order_schema.order_review_report WHERE reporter_identity_id = ?", customer));
        assertEquals(0, count("order_schema.order_delivery_code WHERE order_id = ?", delivered));
        assertEquals(0, count("order_schema.idempotency_record WHERE actor_hash = ?", actorHash(customer)));
        // Everyone else's rows are exactly as they were.
        assertEquals(1, count("order_schema.cart WHERE customer_identity_id = ?", other));
        assertEquals(1, count("order_schema.cart_item i JOIN order_schema.cart c ON c.id = i.cart_id WHERE c.customer_identity_id = ?", other));
        assertEquals(1, count("order_schema.order_review WHERE id = ?", theirs));
        assertEquals(1, count("order_schema.order_review_helpful_vote WHERE review_id = ? AND voter_identity_id = ?", theirs, third));
        assertEquals(2, count("order_schema.order_review_helpful_vote WHERE review_id = ?", theirs));
        assertEquals(1, count("order_schema.order_delivery_code WHERE order_id = ?", othersOrder));
        assertEquals(1, count("order_schema.idempotency_record WHERE actor_hash = ?", actorHash(other)));
        assertEquals(othersRowBefore, rowOf(othersOrder));
        // Orders stay as rows, with their ids.
        assertEquals(3, count("order_schema.customer_order WHERE id IN (?, ?, ?)", delivered, cancelled, othersOrder));
    }

    @Test
    void eraseIsBlockedWhileAnOrderIsOutForDelivery() {
        UUID onTheWay = order(customer, chef, "OUT_FOR_DELIVERY");
        UUID done = order(customer, chef, "DELIVERED");
        cart(customer, 1);
        UUID reviewed = review(done, customer, chef);
        String onTheWayBefore = rowOf(onTheWay);
        String doneBefore = rowOf(done);

        List<Blocker> blockers = service.blockers(customer, Scope.CUSTOMER);
        ErasureResponse response = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals(List.of("ORDER_IN_PROGRESS"), codes(blockers));
        assertEquals("BLOCKED", response.status());
        assertEquals(List.of("ORDER_IN_PROGRESS"), codes(response.blockers()));
        // Nothing changed at all: not the live order's address, not the finished order's, not the cart or the review.
        assertEquals(onTheWayBefore, rowOf(onTheWay));
        assertEquals(doneBefore, rowOf(done));
        assertEquals(1, count("order_schema.cart WHERE customer_identity_id = ?", customer));
        assertEquals(1, count("order_schema.order_review WHERE id = ?", reviewed));
        assertTrue(rowOf(onTheWay).contains(PHONE));
    }

    @Test
    void everyStatusThatIsNotFinishedIsABlocker() {
        // A checkout still waiting for its payment (CREATED is the legacy name) blocks only while it can still be paid.
        for (String status : List.of("PAYMENT_PENDING", "CREATED", "PAID", "CHEF_ACCEPTANCE_PENDING", "CHEF_ACCEPTED", "PREPARING",
            "READY_FOR_PICKUP", "OUT_FOR_DELIVERY")) {
            UUID id = order(customer, chef, status);
            assertEquals(List.of("ORDER_IN_PROGRESS"), codes(service.blockers(customer, Scope.CUSTOMER)), status);
            assertEquals(List.of("KITCHEN_ORDER_IN_PROGRESS"), codes(service.blockers(chef, Scope.CHEF)), status);
            jdbc.update("DELETE FROM order_schema.customer_order WHERE id = ?", id);
        }
        for (String status : List.of("REFUND_PENDING", "REFUND_FAILED")) {
            UUID id = order(customer, chef, status);
            assertEquals(List.of("REFUND_IN_PROGRESS"), codes(service.blockers(customer, Scope.CUSTOMER)), status);
            jdbc.update("DELETE FROM order_schema.customer_order WHERE id = ?", id);
        }
        for (String status : List.of("DELIVERED", "CHEF_REJECTED", "CANCELLED", "REFUNDED")) {
            order(customer, chef, status);
        }
        // Abandoned checkouts: older than the payable window, nobody can pay them any more.
        for (String status : List.of("PAYMENT_PENDING", "CREATED")) {
            abandon(order(customer, chef, status));
        }
        assertEquals(List.of(), service.blockers(customer, Scope.ALL));
        assertEquals(List.of(), service.blockers(chef, Scope.ALL));
    }

    @Test
    void anAbandonedCheckoutBlocksNobodyAndIsAnonymisedLikeAFinishedOrder() {
        UUID abandoned = order(customer, chef, "PAYMENT_PENDING");
        bindFinancialSnapshot(abandoned);
        abandon(abandoned);
        String moneyBefore = withoutPersonalColumns(abandoned);

        assertEquals(List.of(), service.blockers(customer, Scope.ALL));
        assertEquals(List.of(), service.blockers(chef, Scope.ALL));
        ErasureResponse customerSide = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals("DONE", customerSide.status());
        assertEquals(1, customerSide.counts().get("customer_order"));
        assertFalse(rowOf(abandoned).contains(PHONE));
        assertFalse(rowOf(abandoned).contains("the guard"));
        // Still there, with its status, ids, amounts and timestamps: never deleted.
        assertEquals(moneyBefore, withoutPersonalColumns(abandoned));
        assertEquals("PAYMENT_PENDING", jdbc.queryForObject("SELECT status FROM order_schema.customer_order WHERE id = ?", String.class, abandoned));

        // The kitchen's side of the same abandoned checkout is finished too, so the chef's contact goes.
        ErasureResponse chefSide = service.erase(chef, Scope.CHEF, request);
        assertEquals("DONE", chefSide.status());
        assertEquals(1, chefSide.counts().get("customer_order_pickup"));
        for (String gone : CHEF_CONTACT) {
            assertFalse(rowOf(abandoned).contains(gone), gone + " is still in " + rowOf(abandoned));
        }

        // A fresh one can still be paid: it blocks both sides and nothing changes.
        UUID fresh = order(customer, chef, "PAYMENT_PENDING");
        String freshBefore = rowOf(fresh);
        assertEquals("BLOCKED", service.erase(customer, Scope.CUSTOMER, request).status());
        assertEquals(List.of("KITCHEN_ORDER_IN_PROGRESS"), codes(service.erase(chef, Scope.CHEF, request).blockers()));
        assertEquals(freshBefore, rowOf(fresh));
    }

    @Test
    void eraseChefAnonymisesThePickupContactOnTheKitchensFinishedOrdersOnly() {
        UUID bound = order(customer, chef, "PAYMENT_PENDING");
        bindFinancialSnapshot(bound);
        jdbc.update("UPDATE order_schema.customer_order SET status = 'CANCELLED' WHERE id = ?", bound);
        UUID delivered = order(other, chef, "DELIVERED");
        UUID othersKitchen = order(other, UUID.randomUUID(), "DELIVERED");
        // The chef also ordered as a customer from another kitchen: that kitchen's contact is not theirs to erase.
        UUID placedByTheChef = order(chef, UUID.randomUUID(), "DELIVERED");
        Map<UUID, String> restBefore = Map.of(bound, withoutPickupColumns(bound), delivered, withoutPickupColumns(delivered));
        String othersBefore = rowOf(othersKitchen);
        String placedBefore = rowOf(placedByTheChef);
        String snapshotBefore = jdbc.queryForObject("SELECT to_jsonb(s)::text FROM order_schema.order_financial_snapshot s", String.class);

        ErasureResponse response = service.erase(chef, Scope.CHEF, request);

        assertEquals("DONE", response.status());
        assertEquals(Map.of("customer_order_pickup", 2), response.counts());
        for (UUID id : List.of(bound, delivered)) {
            for (String gone : CHEF_CONTACT) {
                assertFalse(rowOf(id).contains(gone), gone + " is still in " + rowOf(id));
            }
            Map<String, Object> pickup = jdbc.queryForMap("SELECT * FROM order_schema.customer_order WHERE id = ?", id);
            assertEquals(AccountErasureService.ERASED_PHONE, pickup.get("pickup_phone_number"));
            assertEquals(AccountErasureService.ERASED_TEXT, pickup.get("pickup_address_line1"));
            assertEquals(AccountErasureService.ERASED_TEXT, pickup.get("pickup_area_name"));
            assertEquals(AccountErasureService.ERASED_POSTAL_CODE, pickup.get("pickup_postal_code"));
            assertNull(pickup.get("pickup_email"));
            assertNull(pickup.get("pickup_address_line2"));
            assertNull(pickup.get("pickup_landmark"));
            // The customer's drop-off, the kitchen name, money, ids and timestamps are exactly as they were.
            assertEquals(restBefore.get(id), withoutPickupColumns(id));
        }
        // The pickup check still holds: an address line means every required field is filled in.
        assertEquals(0, jdbc.queryForObject(
            "SELECT count(*) FROM order_schema.customer_order WHERE pickup_address_line1 IS NOT NULL AND (pickup_phone_number IS NULL "
                + "OR pickup_area_name IS NULL OR pickup_city IS NULL OR pickup_state IS NULL OR pickup_postal_code IS NULL "
                + "OR pickup_latitude IS NULL OR pickup_longitude IS NULL)", Integer.class));
        // The money guard did not fire and the snapshot is untouched.
        assertEquals(snapshotBefore, jdbc.queryForObject("SELECT to_jsonb(s)::text FROM order_schema.order_financial_snapshot s", String.class));
        assertEquals(othersBefore, rowOf(othersKitchen));
        assertEquals(placedBefore, rowOf(placedByTheChef));

        String kitchenOrdersAfterFirst = rowOf(bound) + rowOf(delivered);
        for (Scope scope : List.of(Scope.CHEF, Scope.ALL)) {
            assertEquals(0, service.erase(chef, scope, request).counts().get("customer_order_pickup"), scope.name());
        }
        assertEquals(kitchenOrdersAfterFirst, rowOf(bound) + rowOf(delivered));
        // ALL also ran the customer side: the order the chef placed lost its drop-off, but the other kitchen's contact on it stays.
        assertFalse(rowOf(placedByTheChef).contains(PHONE));
        assertTrue(rowOf(placedByTheChef).contains(CHEF_PHONE) && rowOf(placedByTheChef).contains("5 Kitchen Lane"), rowOf(placedByTheChef));
        assertEquals(othersBefore, rowOf(othersKitchen));
    }

    @Test
    void eraseCustomerBlanksTheNoteOnAnOrderWithoutADropoff() {
        UUID noAddress = order(customer, chef, "DELIVERED");
        // An order from before the address snapshot: no drop-off at all, only the customer's note.
        jdbc.update("UPDATE order_schema.customer_order SET delivery_address_id = NULL, dropoff_recipient_name = NULL, dropoff_contact_phone = NULL, "
            + "dropoff_address_line1 = NULL, dropoff_address_line2 = NULL, dropoff_landmark = NULL, dropoff_area_name = NULL, dropoff_city = NULL, "
            + "dropoff_state = NULL, dropoff_postal_code = NULL, dropoff_latitude = NULL, dropoff_longitude = NULL WHERE id = ?", noAddress);
        UUID withAddress = order(customer, chef, "DELIVERED");

        ErasureResponse response = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals(2, response.counts().get("customer_order"));
        for (UUID id : List.of(noAddress, withAddress)) {
            assertNull(jdbc.queryForObject("SELECT customer_note FROM order_schema.customer_order WHERE id = ?", String.class, id));
        }
        assertNull(jdbc.queryForObject("SELECT dropoff_address_line1 FROM order_schema.customer_order WHERE id = ?", String.class, noAddress),
            "no address is invented for an order that had none");
        assertEquals(0, service.erase(customer, Scope.CUSTOMER, request).counts().get("customer_order"));
    }

    @Test
    void aChefIsBlockedWhileTheirKitchenHasAnOrderInProgressButACustomerEraseIsNot() {
        UUID kitchenOrder = order(other, chef, "PREPARING");
        order(chef, UUID.randomUUID(), "DELIVERED");
        String before = rowOf(kitchenOrder);

        assertEquals(List.of("KITCHEN_ORDER_IN_PROGRESS"), codes(service.blockers(chef, Scope.CHEF)));
        assertEquals(List.of("KITCHEN_ORDER_IN_PROGRESS"), codes(service.blockers(chef, Scope.ALL)));
        assertEquals(List.of(), service.blockers(chef, Scope.CUSTOMER));
        assertEquals("BLOCKED", service.erase(chef, Scope.CHEF, request).status());
        assertEquals("BLOCKED", service.erase(chef, Scope.ALL, request).status());
        assertEquals(before, rowOf(kitchenOrder));
        // As a customer they have nothing in progress, so that part may go ahead.
        assertEquals("DONE", service.erase(chef, Scope.CUSTOMER, request).status());
        assertEquals(before, rowOf(kitchenOrder));
    }

    @Test
    void eraseCustomerLeavesTheirKitchenOrdersAlone() {
        // The same person is a customer and a chef: only the orders they placed change.
        UUID placed = order(chef, UUID.randomUUID(), "DELIVERED");
        UUID cooked = order(other, chef, "DELIVERED");
        UUID reviewOfTheKitchen = review(cooked, other, chef);
        attachEverything(reviewOfTheKitchen, customer, UUID.randomUUID());
        cart(chef, 1);
        String cookedBefore = rowOf(cooked);
        String checkoutOfCooked = jdbc.queryForObject(
            "SELECT to_jsonb(c)::text FROM order_schema.checkout c WHERE c.id = (SELECT checkout_id FROM order_schema.customer_order WHERE id = ?)",
            String.class, cooked);
        String reviewBefore = jdbc.queryForObject("SELECT to_jsonb(r)::text FROM order_schema.order_review r WHERE id = ?", String.class, reviewOfTheKitchen);

        ErasureResponse response = service.erase(chef, Scope.CUSTOMER, request);

        assertEquals("DONE", response.status());
        assertEquals(1, response.counts().get("customer_order"));
        assertFalse(rowOf(placed).contains(PHONE));
        assertEquals(0, count("order_schema.cart WHERE customer_identity_id = ?", chef));
        assertEquals(cookedBefore, rowOf(cooked));
        assertEquals(checkoutOfCooked, jdbc.queryForObject(
            "SELECT to_jsonb(c)::text FROM order_schema.checkout c WHERE c.id = (SELECT checkout_id FROM order_schema.customer_order WHERE id = ?)",
            String.class, cooked));
        assertEquals(reviewBefore, jdbc.queryForObject("SELECT to_jsonb(r)::text FROM order_schema.order_review r WHERE id = ?", String.class, reviewOfTheKitchen));
        assertEquals(1, count("order_schema.order_review_tag WHERE review_id = ?", reviewOfTheKitchen));
        assertTrue(rowOf(cooked).contains(PHONE));
    }

    @Test
    void eraseChefRemovesOnlyTheKitchensContactAndKeepsTheCustomerSide() {
        UUID cooked = order(other, chef, "DELIVERED");
        cart(chef, 1);
        String before = withoutPickupColumns(cooked);

        ErasureResponse response = service.erase(chef, Scope.CHEF, request);

        assertEquals("DONE", response.status());
        assertEquals(Map.of("customer_order_pickup", 1), response.counts());
        // The customer's drop-off and note on the kitchen's order, and the chef's own cart, stay.
        assertEquals(before, withoutPickupColumns(cooked));
        assertTrue(rowOf(cooked).contains(PHONE));
        assertEquals(1, count("order_schema.cart WHERE customer_identity_id = ?", chef));
    }

    @Test
    void eraseTwiceIsDoneWithZeroCounts() {
        UUID delivered = order(customer, chef, "DELIVERED");
        order(customer, chef, "REFUNDED");
        cart(customer, 2);
        deliveryCode(delivered);
        attachEverything(review(delivered, customer, chef), other, other);
        idempotency(customer, "key-one");
        assertTrue(service.erase(customer, Scope.ALL, request).counts().values().stream().anyMatch(rows -> rows > 0));
        String ordersAfterFirst = jdbc.queryForObject("SELECT string_agg(to_jsonb(o)::text, ',' ORDER BY id) FROM " + ORDER_TABLES, String.class);
        String checkoutsAfterFirst = jdbc.queryForObject("SELECT string_agg(to_jsonb(c)::text, ',' ORDER BY id) FROM order_schema.checkout c", String.class);

        for (Scope scope : Scope.values()) {
            ErasureResponse again = service.erase(customer, scope, request);
            assertEquals("DONE", again.status(), scope.name());
            assertTrue(again.counts().values().stream().allMatch(rows -> rows == 0), scope + " " + again.counts());
        }
        assertEquals(ordersAfterFirst, jdbc.queryForObject("SELECT string_agg(to_jsonb(o)::text, ',' ORDER BY id) FROM " + ORDER_TABLES, String.class));
        assertEquals(checkoutsAfterFirst, jdbc.queryForObject("SELECT string_agg(to_jsonb(c)::text, ',' ORDER BY id) FROM order_schema.checkout c", String.class));
    }

    @Test
    void eraseIsAllOrNothingWhenALaterStepFails() {
        UUID delivered = order(customer, chef, "DELIVERED");
        cart(customer, 2);
        deliveryCode(delivered);
        UUID reviewed = review(delivered, customer, chef);
        attachEverything(reviewed, other, other);
        idempotency(customer, "key-one");
        String orderBefore = rowOf(delivered);
        // Checkouts are the last thing erase touches; make that step fail.
        jdbc.execute("CREATE FUNCTION order_schema.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$");
        jdbc.execute("CREATE TRIGGER test_fail BEFORE UPDATE ON order_schema.checkout FOR EACH ROW EXECUTE FUNCTION order_schema.test_fail()");

        assertThrows(RuntimeException.class, () -> service.erase(customer, Scope.CUSTOMER, request));

        assertEquals(orderBefore, rowOf(delivered));
        assertEquals(2, count("order_schema.cart_item i JOIN order_schema.cart c ON c.id = i.cart_id WHERE c.customer_identity_id = ?", customer));
        assertEquals(1, count("order_schema.order_review WHERE id = ?", reviewed));
        assertEquals(1, count("order_schema.order_review_report WHERE review_id = ?", reviewed));
        assertEquals(1, count("order_schema.order_delivery_code WHERE order_id = ?", delivered));
        assertEquals(1, count("order_schema.idempotency_record WHERE actor_hash = ?", actorHash(customer)));
    }

    @Test
    void eraseDeletesFinishedNotificationsButNotPendingOnesOrOtherPeoples() {
        order(customer, chef, "DELIVERED");
        notification(customer, "CUSTOMER", "SENT");
        notification(customer, "CUSTOMER", "DEAD");
        UUID pending = notification(customer, "CUSTOMER", "PENDING");
        UUID processing = notification(customer, "CUSTOMER", "PROCESSING");
        UUID failed = notification(customer, "CUSTOMER", "FAILED");
        UUID asChef = notification(customer, "CHEF", "SENT");
        UUID others = notification(other, "CUSTOMER", "SENT");
        String kept = rows("notification_outbox", pending, processing, failed, asChef, others);

        ErasureResponse response = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals(2, response.counts().get("notification_outbox"));
        assertEquals(0, count("order_schema.notification_outbox WHERE user_identity_id = ? AND user_role = 'CUSTOMER' AND status IN ('SENT', 'DEAD')", customer));
        // Still waiting to be sent, written for them as a chef, or somebody else's: exactly as they were.
        assertEquals(kept, rows("notification_outbox", pending, processing, failed, asChef, others));
        assertEquals(0, service.erase(customer, Scope.CUSTOMER, request).counts().get("notification_outbox"));
        assertEquals(kept, rows("notification_outbox", pending, processing, failed, asChef, others));
    }

    @Test
    void eraseScrubsTheDropoffInPublishedDomainEventsButNotPendingOnesOrOtherPeoples() {
        UUID mine = order(customer, chef, "DELIVERED");
        UUID theirs = order(other, chef, "DELIVERED");
        UUID published = domainEvent(mine, "PUBLISHED");
        UUID dead = domainEvent(mine, "DEAD");
        UUID pending = domainEvent(mine, "PENDING");
        UUID failed = domainEvent(mine, "FAILED");
        UUID processing = domainEvent(mine, "PROCESSING");
        UUID others = domainEvent(theirs, "PUBLISHED");
        String kept = rows("domain_event_outbox", pending, failed, processing, others);
        String restBefore = domainEventWithoutDropoff(published);
        String pickupBefore = jdbc.queryForObject("SELECT (payload_json #> '{data,deliveryRequest,pickup}')::text FROM order_schema.domain_event_outbox WHERE id = ?", String.class, published);

        ErasureResponse response = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals(2, response.counts().get("domain_event_outbox"));
        for (UUID id : List.of(published, dead)) {
            String payload = jdbc.queryForObject("SELECT payload_json::text FROM order_schema.domain_event_outbox WHERE id = ?", String.class, id);
            for (String gone : List.of(PHONE, "Asha Rao", "12 Lake View Road", "Flat 4B", "Near the temple", "Madhapur", "500081", "17.44", "78.39")) {
                assertFalse(payload.contains(gone), gone + " is still in " + payload);
            }
            Map<String, Object> dropoff = jdbc.queryForMap(
                "SELECT payload_json #>> '{data,deliveryRequest,dropoff,contactName}' AS name, payload_json #>> '{data,deliveryRequest,dropoff,contactPhone}' AS phone, "
                    + "payload_json #>> '{data,deliveryRequest,dropoff,postalCode}' AS postal, payload_json #>> '{data,deliveryRequest,dropoff,addressLine1}' AS line1, "
                    + "payload_json #>> '{data,deliveryRequest,dropoff,addressLine2}' AS line2 FROM order_schema.domain_event_outbox WHERE id = ?", id);
            assertEquals(AccountErasureService.ERASED_TEXT, dropoff.get("name"));
            assertEquals(AccountErasureService.ERASED_PHONE, dropoff.get("phone"));
            assertEquals(AccountErasureService.ERASED_POSTAL_CODE, dropoff.get("postal"));
            assertEquals(AccountErasureService.ERASED_TEXT, dropoff.get("line1"));
            assertNull(dropoff.get("line2"));
        }
        // The kitchen's side, the items and the envelope are untouched.
        assertEquals(restBefore, domainEventWithoutDropoff(published));
        assertEquals(pickupBefore, jdbc.queryForObject("SELECT (payload_json #> '{data,deliveryRequest,pickup}')::text FROM order_schema.domain_event_outbox WHERE id = ?", String.class, published));
        assertEquals(kept, rows("domain_event_outbox", pending, failed, processing, others));
        assertEquals(0, service.erase(customer, Scope.CUSTOMER, request).counts().get("domain_event_outbox"));
        assertEquals(kept, rows("domain_event_outbox", pending, failed, processing, others));
    }

    @Test
    void eraseScrubsTheTrackingLinkInFinishedDeliveryInboxRowsButNotWaitingOnes() {
        UUID mine = order(customer, chef, "DELIVERED");
        UUID theirs = order(other, chef, "DELIVERED");
        List<UUID> finished = List.of("PROCESSED", "STALE", "TERMINAL_PROTECTED", "NO_CHANGE", "REJECTED").stream()
            .map(status -> deliveryInbox(mine, status)).toList();
        UUID received = deliveryInbox(mine, "RECEIVED");
        UUID waitingPrior = deliveryInbox(mine, "WAITING_FOR_PRIOR_PROVIDER");
        UUID waitingHandoff = deliveryInbox(mine, "WAITING_FOR_HANDOFF");
        UUID others = deliveryInbox(theirs, "PROCESSED");
        String kept = rows("delivery_status_inbox", received, waitingPrior, waitingHandoff, others);
        List<String> restBefore = finished.stream().map(this::inboxWithoutTrackingLink).toList();

        ErasureResponse response = service.erase(customer, Scope.CUSTOMER, request);

        assertEquals(5, response.counts().get("delivery_status_inbox"));
        for (int i = 0; i < finished.size(); i++) {
            assertEquals(AccountErasureService.ERASED_TEXT, jdbc.queryForObject(
                "SELECT payload #>> '{data,trackingUrl}' FROM order_schema.delivery_status_inbox WHERE event_id = ?", String.class, finished.get(i)));
            // Everything else the delivery code reads from the payload, and the courier's own details, stay.
            assertEquals(restBefore.get(i), inboxWithoutTrackingLink(finished.get(i)));
        }
        assertEquals(kept, rows("delivery_status_inbox", received, waitingPrior, waitingHandoff, others));
        assertEquals(0, service.erase(customer, Scope.CUSTOMER, request).counts().get("delivery_status_inbox"));
        assertEquals(kept, rows("delivery_status_inbox", received, waitingPrior, waitingHandoff, others));
    }

    // ---- fixtures ----

    /**
     * A checkout with its one order, both carrying the same delivery address snapshot and a note; the order also carries the
     * kitchen's pickup contact the way checkout copies it in.
     */
    private UUID order(UUID owner, UUID cookedBy, String status) {
        UUID checkout = UUID.randomUUID();
        UUID id = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO order_schema.checkout (id, customer_identity_id, status, food_subtotal, platform_fee, tax_amount, delivery_fee,
                grand_total, delivery_address_id, dropoff_recipient_name, dropoff_contact_phone, dropoff_address_line1,
                dropoff_address_line2, dropoff_landmark, dropoff_area_name, dropoff_city, dropoff_state, dropoff_postal_code,
                dropoff_latitude, dropoff_longitude)
            VALUES (?, ?, 'PAYMENT_PENDING', 100, 0, 0, 0, 100, ?, 'Asha Rao', ?, '12 Lake View Road', 'Flat 4B', 'Near the temple',
                'Madhapur', 'Hyderabad', 'Telangana', '500081', 17.4401234, 78.3912345)
            """, checkout, owner, UUID.randomUUID(), PHONE);
        jdbc.update("""
            INSERT INTO order_schema.customer_order (id, checkout_id, customer_identity_id, kitchen_id, chef_identity_id, status,
                prep_time_minutes, accepted_at, ready_at, chef_acceptance_requested_at, chef_acceptance_expires_at,
                food_subtotal, platform_fee, tax_amount, delivery_fee, grand_total, delivery_address_id, dropoff_recipient_name,
                dropoff_contact_phone, dropoff_address_line1, dropoff_address_line2, dropoff_landmark, dropoff_area_name,
                dropoff_city, dropoff_state, dropoff_postal_code, dropoff_latitude, dropoff_longitude, customer_note,
                pickup_phone_number, pickup_email, pickup_address_line1, pickup_address_line2, pickup_landmark, pickup_area_name,
                pickup_city, pickup_state, pickup_postal_code, pickup_latitude, pickup_longitude)
            SELECT ?, c.id, c.customer_identity_id, ?, ?, ?, 20, now() - interval '1 hour', now() - interval '40 minutes',
                now() - interval '2 hours', now() - interval '90 minutes', 100, 0, 0, 0, 100, c.delivery_address_id,
                c.dropoff_recipient_name, c.dropoff_contact_phone, c.dropoff_address_line1, c.dropoff_address_line2,
                c.dropoff_landmark, c.dropoff_area_name, c.dropoff_city, c.dropoff_state, c.dropoff_postal_code,
                c.dropoff_latitude, c.dropoff_longitude, 'Leave it with the guard',
                ?, 'kitchen.owner@example.com', '5 Kitchen Lane', 'Floor 2', 'Opposite the park', 'Kondapur', 'Hyderabad',
                'Telangana', '500084', 17.4612345, 78.3654321
            FROM order_schema.checkout c WHERE c.id = ?
            """, id, UUID.randomUUID(), cookedBy, status, CHEF_PHONE, checkout);
        return id;
    }

    /** Makes an order older than the payable window: a checkout nobody paid for and nobody will. */
    private void abandon(UUID orderId) {
        jdbc.update("UPDATE order_schema.customer_order SET created_at = now() - interval '25 hours' WHERE id = ?", orderId);
    }

    /** Binds the order's money the way checkout does, which makes the money guard triggers apply to it. */
    private void bindFinancialSnapshot(UUID orderId) {
        Map<String, Object> o = jdbc.queryForMap("SELECT checkout_id, kitchen_id, chef_identity_id FROM order_schema.customer_order WHERE id = ?", orderId);
        UUID snapshot = UUID.randomUUID();
        String hash = "a".repeat(64);
        String payload = """
            {"snapshotId":"%s","hash":"%s","chefOrderId":"%s","checkoutId":"%s","chefIdentityId":"%s","customerIdentityId":"%s",
             "kitchenId":"%s","currency":"INR","orderSource":"ON_DEMAND","customerTotal":"100.00","customerTax":"0.00",
             "customerFood":"100.00","chefGross":"100.00","delivery":"0.00","platform":"0.00","pricedAt":"2026-11-03T00:00:00Z","items":[]}
            """.formatted(snapshot, hash, orderId, o.get("checkout_id"), o.get("chef_identity_id"), customer, o.get("kitchen_id"));
        jdbc.update("INSERT INTO order_schema.order_financial_snapshot(chef_order_id, snapshot_id, snapshot_hash, payload) VALUES (?, ?, ?, ?::jsonb)",
            orderId, snapshot, hash, payload);
    }

    private void cart(UUID owner, int items) {
        UUID cart = UUID.randomUUID();
        jdbc.update("INSERT INTO order_schema.cart(id, customer_identity_id) VALUES (?, ?)", cart, owner);
        for (int i = 0; i < items; i++) {
            jdbc.update("INSERT INTO order_schema.cart_item(id, cart_id, menu_item_id, quantity) VALUES (?, ?, ?, 1)",
                UUID.randomUUID(), cart, UUID.randomUUID());
        }
    }

    private void deliveryCode(UUID orderId) {
        jdbc.update("INSERT INTO order_schema.order_delivery_code(order_id, code) VALUES (?, '4821')", orderId);
    }

    private UUID review(UUID orderId, UUID reviewer, UUID cookedBy) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO order_schema.order_review(id, order_id, customer_identity_id, kitchen_id, chef_identity_id, overall_rating, "
            + "review_text) VALUES (?, ?, ?, ?, ?, 5, 'Lovely, call me on " + PHONE + "')", id, orderId, reviewer, UUID.randomUUID(), cookedBy);
        return id;
    }

    /** One of every row that hangs off a review; a vote and a report by the given people. */
    private void attachEverything(UUID review, UUID voter, UUID reporter) {
        jdbc.update("INSERT INTO order_schema.order_review_tag(review_id, tag_code) VALUES (?, 'GREAT_TASTE')", review);
        jdbc.update("INSERT INTO order_schema.order_review_media(review_id, media_asset_id, position) VALUES (?, ?, 0)", review, UUID.randomUUID());
        jdbc.update("INSERT INTO order_schema.order_review_revision(id, review_id, revision_number, status_snapshot, overall_rating, review_text, "
            + "actor_identity_id) VALUES (?, ?, 1, 'PENDING_MODERATION', 5, 'Lovely', ?)", UUID.randomUUID(), review, UUID.randomUUID());
        jdbc.update("INSERT INTO order_schema.order_review_moderation_audit(id, review_id, old_status, new_status, actor_identity_id, reason) "
            + "VALUES (?, ?, 'PENDING_MODERATION', 'PUBLISHED', ?, 'Checked and published')", UUID.randomUUID(), review, UUID.randomUUID());
        jdbc.update("INSERT INTO order_schema.order_review_helpful_vote(review_id, voter_identity_id) VALUES (?, ?)", review, voter);
        jdbc.update("INSERT INTO order_schema.order_review_report(id, review_id, reporter_identity_id, reason_code) VALUES (?, ?, ?, 'SPAM')",
            UUID.randomUUID(), review, reporter);
    }

    private UUID notification(UUID user, String role, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO order_schema.notification_outbox(id, event_key, event_type, aggregate_type, aggregate_id, user_identity_id, user_role, "
            + "title, body, payload, status) VALUES (?, ?, 'ORDER_CREATED', 'ORDER', ?, ?, ?, 'Order created', 'Your Craves order has been created.', "
            + "'{\"checkoutId\":\"x\"}'::jsonb, ?)", id, "test-" + id, UUID.randomUUID(), user, role, status);
        return id;
    }

    /** The CHEF_ACCEPTED_ORDER event as the factory writes it: the kitchen's stop, the customer's stop and the items. */
    private UUID domainEvent(UUID orderId, String status) {
        UUID id = UUID.randomUUID();
        String payload = """
            {"eventId":"%s","eventType":"CHEF_ACCEPTED_ORDER","eventVersion":"1.0","subject":"%s","data":{"orderId":"%s","chefSubOrderId":"%s",
             "area":"Kondapur","deliveryRequest":{"matter":"Food order #AB12CD34",
             "pickup":{"address":"5 Kitchen Lane, Kondapur","contactName":"Test kitchen","contactPhone":"9000000000","latitude":17.46,"longitude":78.36,
              "note":"Craves order #AB12CD34. Match this number with the kitchen.","addressLine1":"5 Kitchen Lane","addressLine2":null,"landmark":null,
              "area":"Kondapur","city":"Hyderabad","state":"Telangana","postalCode":"500084","country":"India"},
             "dropoff":{"address":"12 Lake View Road, Flat 4B, Near the temple, Madhapur, Hyderabad, Telangana, 500081","contactName":"Asha Rao",
              "contactPhone":"%s","latitude":17.4401234,"longitude":78.3912345,"note":"Craves order #AB12CD34.","addressLine1":"12 Lake View Road",
              "addressLine2":"Flat 4B","landmark":"Near the temple","area":"Madhapur","city":"Hyderabad","state":"Telangana","postalCode":"500081",
              "country":"India"},
             "items":[{"itemName":"Test meal","quantity":1}]}}}
            """.formatted(id, orderId, UUID.randomUUID(), orderId, PHONE);
        jdbc.update("INSERT INTO order_schema.domain_event_outbox(id, event_key, aggregate_type, aggregate_id, event_type, event_version, occurred_at, "
            + "correlation_id, source, subject, payload_json, status) VALUES (?, ?, 'CUSTOMER_ORDER', ?, 'CHEF_ACCEPTED_ORDER', '1.0', now(), ?, "
            + "'order-service', ?, ?::jsonb, ?)", id, "CHEF_ACCEPTED_ORDER:" + id, orderId, UUID.randomUUID(), orderId.toString(), payload, status);
        return id;
    }

    /** A provider status event as the inbox keeps it: the tracking link, the handoff fields the code reads, and the courier. */
    private UUID deliveryInbox(UUID orderId, String processingStatus) {
        UUID id = UUID.randomUUID();
        String payload = """
            {"eventId":"%s","eventType":"DELIVERY_STATUS_CHANGED","data":{"deliveryJobId":"%s","chefSubOrderId":"%s","providerId":"pidge","status":"DELIVERED",
             "trackingUrl":"https://track.example.invalid/t/abc123","handoffFromProviderId":"borzo","handoffFromProviderDeliveryId":"B-1",
             "courierName":"Ravi","courierPhone":"9111111111"}}
            """.formatted(id, UUID.randomUUID(), orderId);
        jdbc.update("INSERT INTO order_schema.delivery_status_inbox(event_id, event_type, event_version, correlation_id, subject, delivery_job_id, "
            + "chef_sub_order_id, provider_id, provider_delivery_id, normalized_status, observed_at, payload, processing_status) VALUES "
            + "(?, 'DELIVERY_STATUS_CHANGED', '1.0', ?, ?, ?, ?, 'pidge', 'P-1', 'DELIVERED', now(), ?::jsonb, ?)",
            id, UUID.randomUUID(), "delivery-job/" + id, UUID.randomUUID(), orderId, payload, processingStatus);
        return id;
    }

    private void idempotency(UUID actor, String key) {
        jdbc.update("INSERT INTO order_schema.idempotency_record(actor_hash, idem_key, request_hash, state, owner_token, http_status, response_body) "
            + "VALUES (?, ?, repeat('b', 64), 'COMPLETED', ?, 200, convert_to('{\"dropoff\":\"" + PHONE + "\"}', 'UTF8'))",
            actorHash(actor), key, UUID.randomUUID());
    }

    /** The same hash the Idempotency-Key filter stores: SHA-256 of "caller:" and the identity id. */
    private static String actorHash(UUID identity) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(("caller:" + identity).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException exception) {
            throw new IllegalStateException(exception);
        }
    }

    // ---- reads ----

    private String rowOf(UUID orderId) {
        return jdbc.queryForObject("SELECT to_jsonb(o)::text FROM " + ORDER_TABLES + " WHERE id = ?", String.class, orderId);
    }

    /** Every column of the order except the ones erase is allowed to change. */
    private String withoutPersonalColumns(UUID orderId) {
        return jdbc.queryForObject("SELECT (to_jsonb(o) - ARRAY['dropoff_recipient_name', 'dropoff_contact_phone', 'dropoff_address_line1', "
            + "'dropoff_address_line2', 'dropoff_landmark', 'dropoff_area_name', 'dropoff_city', 'dropoff_state', 'dropoff_postal_code', "
            + "'dropoff_latitude', 'dropoff_longitude', 'customer_note'])::text FROM " + ORDER_TABLES + " WHERE id = ?", String.class, orderId);
    }

    /** Every column of the order except the kitchen's pickup contact, which a chef erase is allowed to change. */
    private String withoutPickupColumns(UUID orderId) {
        return jdbc.queryForObject("SELECT (to_jsonb(o) - ARRAY['pickup_phone_number', 'pickup_email', 'pickup_address_line1', "
            + "'pickup_address_line2', 'pickup_landmark', 'pickup_area_name', 'pickup_city', 'pickup_state', 'pickup_postal_code', "
            + "'pickup_latitude', 'pickup_longitude'])::text FROM " + ORDER_TABLES + " WHERE id = ?", String.class, orderId);
    }

    /** The listed rows of a table as one string, for comparing before and after. */
    private String rows(String table, UUID... ids) {
        String key = table.equals("delivery_status_inbox") ? "event_id" : "id";
        return jdbc.queryForObject("SELECT string_agg(to_jsonb(t)::text, ',' ORDER BY " + key + ") FROM order_schema." + table + " t WHERE " + key
            + " IN (" + "?, ".repeat(ids.length - 1) + "?)", String.class, (Object[]) ids);
    }

    private String domainEventWithoutDropoff(UUID id) {
        return jdbc.queryForObject("SELECT (to_jsonb(e) - 'payload_json')::text || (payload_json #- '{data,deliveryRequest,dropoff}')::text "
            + "FROM order_schema.domain_event_outbox e WHERE id = ?", String.class, id);
    }

    private String inboxWithoutTrackingLink(UUID id) {
        return jdbc.queryForObject("SELECT (payload #- '{data,trackingUrl}')::text FROM order_schema.delivery_status_inbox WHERE event_id = ?", String.class, id);
    }

    private int count(String fromAndWhere, Object... args) {
        return jdbc.queryForObject("SELECT count(*) FROM " + fromAndWhere, Integer.class, args);
    }

    private static List<String> codes(List<Blocker> blockers) {
        return blockers.stream().map(Blocker::code).sorted().toList();
    }
}
