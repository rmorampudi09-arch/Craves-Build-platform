package in.craves.integration.erasure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.integration.erasure.AccountErasureDtos.Blocker;
import in.craves.integration.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.integration.erasure.AccountErasureDtos.Scope;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Against the real migrated schema, so the immutability triggers are live. Fixtures are inserted with triggers
 * off (replication role replica; the test database user is a superuser) because only the erase itself is under test.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class AccountErasureDatabaseTest {
    private static final String CASHFREE_PAYLOAD = """
        {"order_id":"CRV_ORDER_1","order_amount":433.10,"order_currency":"INR",
         "customer_details":{"customer_id":"%s","customer_phone":"9876543210","customer_email":"real.person@example.com",
                             "customer_name":"Real Person"},
         "order_meta":{"return_url":"https://craves.in/return","notify_url":"https://craves.in/hook"}}""";
    private static final String RAZORPAY_PAYLOAD = """
        {"amount":43310,"currency":"INR","receipt":"CRV_ORDER_2_RZP",
         "notes":{"craves_checkout_id":"%s","craves_customer_identity_id":"%s","customer_name":"Real Person"}}""";
    private static final String CASHFREE_WEBHOOK = """
        {"data":{"order":{"order_id":"%s","order_amount":433.10,"order_currency":"INR"},
         "payment":{"cf_payment_id":"7001","payment_status":"SUCCESS","payment_amount":433.10,"payment_currency":"INR"},
         "customer_details":{"customer_name":"Real Person","customer_id":"%s","customer_email":"real.person@example.com",
                             "customer_phone":"9876543210"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}""";
    private static final String RAZORPAY_WEBHOOK = """
        {"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_7001","order_id":"%s","status":"captured",
         "amount":43310,"currency":"INR","email":"real.person@example.com","contact":"+919876543210",
         "notes":{"customer_name":"Real Person"}}}}}""";
    private static final String CASHFREE_RESPONSE = """
        {"order_id":"%s","cf_order_id":"3001","order_status":"ACTIVE","order_amount":433.10,"payment_session_id":"session_abc",
         "customer_details":{"customer_id":"%s","customer_name":"Real Person","customer_email":"real.person@example.com",
                             "customer_phone":"9876543210"}}""";
    private static final String RAZORPAY_RESPONSE = """
        {"id":"%s","amount":43310,"currency":"INR","status":"created","notes":{"customer_name":"Real Person"}}""";
    private static final String[] PERSONAL = {"Real Person", "9876543210", "real.person@example.com"};
    /** Legal records and everything of someone else's: a chef erase, a blocked erase and the other side never change them. */
    private static final List<String> MONEY_TABLES = List.of(
        "ledger_transaction", "ledger_line", "finance_payable", "finance_payout_instruction",
        "finance_payout_allocation", "finance_chef_payout_control", "finance_beneficiary_version",
        "finance_bank_request", "chef_earning_entry", "chef_referral_posting");
    /** What a CUSTOMER erase may change, besides the personal fields. */
    private static final List<String> CUSTOMER_TABLES = List.of(
        "payment_order", "refund", "payment_attempt", "payment_event", "webhook_inbox", "cashfree_webhook_delivery", "fleet_schema.trip");
    private static final List<String> ALL_TABLES = java.util.stream.Stream.concat(MONEY_TABLES.stream(), CUSTOMER_TABLES.stream()).toList();
    private static final Set<String> COUNT_KEYS = Set.of(
        "payment_order", "payment_attempt", "payment_event", "webhook_inbox", "cashfree_webhook_delivery", "fleet_trip");

    static JdbcTemplate jdbc;
    static TransactionTemplate tx;
    AccountErasureService service;
    final UUID customer = UUID.randomUUID();
    final UUID chef = UUID.randomUUID();
    final UUID request = UUID.randomUUID();

    @BeforeAll
    static void migrate() {
        String url = System.getenv("LEDGER_TEST_JDBC_URL");
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        var ds = new DriverManagerDataSource(url, System.getenv("LEDGER_TEST_DB_USER"), System.getenv("LEDGER_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds);
        tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.execute("DROP SCHEMA IF EXISTS payment_schema CASCADE");
        jdbc.execute("DROP SCHEMA IF EXISTS delivery_schema CASCADE");
        Flyway.configure().dataSource(ds).defaultSchema("payment_schema").schemas("payment_schema")
            .locations("classpath:db/migration").load().migrate();
    }

    @BeforeEach
    void setup() {
        service = new AccountErasureService(jdbc);
    }

    // ---- fixtures -------------------------------------------------------------------------------------------

    private static void seed(String sql, Object... args) {
        jdbc.execute((ConnectionCallback<Void>) con -> {
            try (var st = con.createStatement()) {
                st.execute("SET session_replication_role = replica");
            }
            try (var ps = con.prepareStatement(sql)) {
                for (int i = 0; i < args.length; i++) {
                    ps.setObject(i + 1, args[i]);
                }
                ps.executeUpdate();
            }
            return null;
        });
    }

    private static UUID payment(UUID owner, String payload) {
        return payment(owner, UUID.randomUUID(), "PAID", payload, null);
    }

    /** provider_order_id is what the provider's webhooks carry; checkout_id is what the fleet trip's order_id is. */
    private static UUID payment(UUID owner, UUID checkout, String status, String payload, String response) {
        return payment(owner, checkout, providerOrderId(checkout), status, payload, response);
    }

    private static UUID payment(UUID owner, UUID checkout, String providerOrderId, String status, String payload, String response) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,provider_order_id,amount,currency,"
            + "status,request_payload,response_payload) VALUES (?,?,?,?,?,?,'INR',?,?::jsonb,?::jsonb)",
            id, checkout, owner, "test/" + id, providerOrderId, new BigDecimal("433.10"), status, payload, response);
        return id;
    }

    private static String providerOrderId(UUID checkout) {
        return "CRV_" + checkout.toString().replace("-", "");
    }

    private static UUID attempt(UUID payment, String payload) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.payment_attempt(id,payment_order_id,cf_payment_id,payment_status,payment_amount,payment_currency,raw_payload)"
            + " VALUES (?,?,'7001','SUCCESS',433.10,'INR',?::jsonb)", id, payment, payload);
        return id;
    }

    private static UUID event(UUID payment, String payload) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.payment_event(id,payment_order_id,provider_event_id,event_type,payment_status,raw_payload)"
            + " VALUES (?,?,?,'PAYMENT_SUCCESS_WEBHOOK','SUCCESS',?::jsonb)", id, payment, "evt/" + id, payload);
        return id;
    }

    private static UUID inbox(String status, String body) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.webhook_inbox(id,provider,event_identity,processing_status,raw_payload) VALUES (?,'CASHFREE',?,?,?)",
            id, "evt/" + id, status, body);
        return id;
    }

    private static UUID delivery(String status, String body) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.cashfree_webhook_delivery(id,idempotency_key,webhook_version,webhook_timestamp,webhook_signature,raw_payload,"
            + "processing_status) VALUES (?,?,'2025-01-01',1700000000,'signature',?,?)", id, "key/" + id, body, status);
        return id;
    }

    /** One fleet trip for a checkout; the customer's name and phone are the columns under test, the rider's are not. */
    private static UUID trip(UUID checkout, String state) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO fleet_schema.trip(id,chef_sub_order_id,order_id,chef_id,order_code,state,items_count,kitchen_name,kitchen_area,kitchen_address,"
            + "kitchen_lat,kitchen_lng,chef_phone,customer_first_name,customer_phone,drop_area,drop_address,drop_lat,drop_lng)"
            + " VALUES (?,?,?,?,'#ABCDEF12',?,2,'Kitchen','Area','Kitchen road',17.4,78.4,'8888888888','Real','9876543210','Drop area','Drop road',17.5,78.5)",
            id, UUID.randomUUID(), checkout, UUID.randomUUID(), state);
        return id;
    }

    private static void refund(UUID payment, UUID owner, String status) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.refund(id,payment_order_id,refund_ref,amount,status,customer_identity_id) VALUES (?,?,?,?,?,?)",
            id, payment, "refund/" + id, new BigDecimal("10.00"), status, owner);
    }

    private static UUID journal(UUID owner) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.ledger_transaction(id,business_event_key,source_event_id,source,event_type,currency,occurred_at,business_date,"
            + "evidence_reference,payload_hash,actor_type,actor_id) VALUES (?,?,?,'test','TEST','INR',now(),current_date,'test',?,'SERVICE','test')",
            id, "test/" + id, UUID.randomUUID(), "a".repeat(64));
        seed("INSERT INTO payment_schema.ledger_line(id,transaction_id,sequence,account_code,currency,debit_amount,credit_amount,chef_identity_id)"
            + " VALUES (?,?,1,'CUSTOMER_FUNDS','INR',100.00,0,NULL)", UUID.randomUUID(), id);
        seed("INSERT INTO payment_schema.ledger_line(id,transaction_id,sequence,account_code,currency,debit_amount,credit_amount,chef_identity_id)"
            + " VALUES (?,?,2,'CHEF_PAYABLE','INR',0,100.00,?)", UUID.randomUUID(), id, owner);
        return id;
    }

    private static UUID payable(UUID owner) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.finance_payable(id,chef_identity_id,chef_order_id,journal_id,amount,delivered_at,automatic_due_at,"
            + "manual_available_at,policy_snapshot) VALUES (?,?,?,?,100.00,now(),now(),now(),'{}'::jsonb)",
            id, owner, UUID.randomUUID(), journal(owner));
        return id;
    }

    private static UUID instruction(UUID owner, String status) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.finance_payout_instruction(id,chef_identity_id,request_key,mode,amount,status,policy_revision,"
            + "payout_channel,manual_request_hash) VALUES (?,?,?,'MANUAL',100.00,?,1,'CRAVES_MANUAL',?)",
            id, owner, UUID.randomUUID(), status, "b".repeat(64));
        return id;
    }

    private static void allocate(UUID instruction, UUID payable, boolean active) {
        seed("INSERT INTO payment_schema.finance_payout_allocation(instruction_id,payable_id,active) VALUES (?,?,?)",
            instruction, payable, active);
    }

    private static void control(UUID owner, boolean onHold) {
        control(owner, onHold, "OPERATIONAL");
    }

    /** BANK_REQUIREMENT is the hold every earning chef starts with until a bank account is verified. */
    private static void control(UUID owner, boolean onHold, String kind) {
        seed("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,on_hold,hold_reason,hold_kind) VALUES (?,?,?,?)",
            owner, onHold, onHold ? "BANK_REQUIREMENT".equals(kind) ? "Beneficiary verification required" : "Test hold" : null, kind);
    }

    private static void legacyEarning(UUID owner, String status) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.chef_earning_entry(id,order_id,chef_identity_id,order_source,currency,gross_amount,commission_amount,"
            + "tax_withheld_amount,adjustment_amount,net_payable,allocation_reference,status,reason,created_by_identity_id)"
            + " VALUES (?,?,?,'ON_DEMAND','INR',100.00,10.00,0,0,90.00,?,?,'Test',?)",
            id, UUID.randomUUID(), owner, "alloc/" + id, status, UUID.randomUUID());
    }

    private static void referralCredit(UUID owner) {
        seed("INSERT INTO payment_schema.chef_referral_posting(posting_id,reward_id,chef_order_id,beneficiary_id,selling_chef_id,amount_paise,"
            + "posting_month,posted_at,payload_hash,journal_id) VALUES (?,?,?,?,?,5000,date '2026-11-01',now(),?,?)",
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), owner, UUID.randomUUID(), "c".repeat(64), journal(owner));
    }

    private static void bankDetails(UUID owner) {
        UUID beneficiary = UUID.randomUUID();
        seed("INSERT INTO payment_schema.finance_beneficiary_version(id,chef_identity_id,fund_account_id,contact_id,verification_reference,verified_by)"
            + " VALUES (?,?,'fa_test','cont_test','TEST_REF',?)", beneficiary, owner, UUID.randomUUID());
        seed("INSERT INTO payment_schema.finance_bank_request(id,chef_identity_id,encrypted_details,fingerprint,last_four,ifsc,consent_version,state)"
            + " VALUES (?,?,'encrypted-test','fingerprint-test','1234','HDFC0001234','v1','SUPERSEDED')", UUID.randomUUID(), owner);
    }

    /** A chef whose money is all settled: paid payable, finished payout, bank details, no hold. */
    private void settledChef() {
        UUID paid = payable(chef);
        allocate(instruction(chef, "PAID"), paid, true);
        instruction(chef, "FAILED");
        instruction(chef, "CANCELLED");
        instruction(chef, "REVERSED");
        control(chef, false);
        legacyEarning(chef, "SETTLED");
        bankDetails(chef);
    }

    private ErasureResponse erase(UUID identity, Scope scope) {
        return tx.execute(s -> service.erase(identity, scope, request));
    }

    private static String snapshot(String table) {
        return jdbc.queryForObject("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM "
            + (table.contains(".") ? table : "payment_schema." + table) + " t", String.class);
    }

    private static Map<String, String> snapshots(List<String> tables) {
        return tables.stream().collect(Collectors.toMap(t -> t, AccountErasureDatabaseTest::snapshot));
    }

    private static String payload(UUID paymentId) {
        return jdbc.queryForObject("SELECT request_payload::text FROM payment_schema.payment_order WHERE id=?", String.class, paymentId);
    }

    private static void assertAllZero(ErasureResponse response) {
        assertEquals(COUNT_KEYS, response.counts().keySet());
        assertTrue(response.counts().values().stream().allMatch(n -> n == 0), response.counts().toString());
    }

    private static void assertClean(String text) {
        for (String personal : PERSONAL) {
            assertFalse(text.contains(personal), personal + " still in " + text);
        }
        assertFalse(text.contains("76543210") || text.contains("@example.com"), "nothing partially visible: " + text);
    }

    private static String column(String table, String column, UUID id) {
        return jdbc.queryForObject("SELECT " + column + "::text FROM " + table + " WHERE id=?", String.class, id);
    }

    private static String row(String table, UUID id) {
        return jdbc.queryForObject("SELECT to_jsonb(t)::text FROM " + table + " t WHERE id=?", String.class, id);
    }

    private static Set<String> codes(List<Blocker> blockers) {
        return blockers.stream().map(Blocker::code).collect(Collectors.toSet());
    }

    // ---- tests ----------------------------------------------------------------------------------------------

    @Test
    void blockersListUnfinishedPayoutsForChef() {
        payable(chef);
        UUID reserved = payable(chef);
        UUID paid = payable(chef);
        allocate(instruction(chef, "RESERVED"), reserved, true);
        allocate(instruction(chef, "PAID"), paid, true);
        instruction(chef, "FAILED");
        instruction(chef, "CANCELLED");
        instruction(chef, "REVERSED");
        control(chef, true);
        legacyEarning(chef, "SETTLEMENT_PENDING");
        legacyEarning(chef, "SETTLED");
        referralCredit(chef);

        List<Blocker> blockers = service.blockers(chef, Scope.CHEF);

        assertEquals(Set.of("PAYABLE_UNPAID", "PAYOUT_NOT_FINISHED", "PAYOUT_ON_HOLD", "SETTLEMENT_PENDING", "REFERRAL_EARNING_UNPAID"),
            codes(blockers));
        assertEquals(5, blockers.size());
        assertTrue(blockers.stream().filter(b -> b.code().equals("PAYABLE_UNPAID")).findFirst().orElseThrow().detail().startsWith("2 "),
            "the unallocated payable and the one reserved on a payout that is not paid yet");
        assertTrue(blockers.stream().filter(b -> b.code().equals("PAYOUT_NOT_FINISHED")).findFirst().orElseThrow().detail().startsWith("1 "),
            "only the RESERVED payout; PAID, FAILED, CANCELLED and REVERSED are finished");
        assertEquals(codes(blockers), codes(service.blockers(chef, Scope.ALL)));
        assertTrue(service.blockers(chef, Scope.CUSTOMER).isEmpty(), "money owed to a chef never blocks the customer side");
    }

    @Test
    void aChefWithEverythingSettledHasNoBlockers() {
        settledChef();

        assertTrue(service.blockers(chef, Scope.CHEF).isEmpty());
        assertTrue(service.blockers(chef, Scope.ALL).isEmpty());
        assertTrue(service.blockers(UUID.randomUUID(), Scope.ALL).isEmpty(), "someone this service never saw");
    }

    @Test
    void aRefundStillBeingPaidBlocksTheCustomerOnlyUntilItFinishes() {
        for (String status : List.of("REQUESTED", "PROCESSING", "RETRY", "PENDING", "ONHOLD")) {
            UUID owner = UUID.randomUUID();
            refund(payment(owner, "{}"), owner, status);
            assertEquals(Set.of("REFUND_IN_FLIGHT"), codes(service.blockers(owner, Scope.CUSTOMER)), status);
            assertTrue(service.blockers(owner, Scope.CHEF).isEmpty(), status + " is a customer matter");
        }
        for (String status : List.of("SUCCESS", "FAILED", "CANCELLED", "DEAD_LETTER")) {
            UUID owner = UUID.randomUUID();
            refund(payment(owner, "{}"), owner, status);
            assertTrue(service.blockers(owner, Scope.CUSTOMER).isEmpty(), status);
        }
        // Older rows have no customer id of their own; the payment order still says whose they are.
        UUID owner = UUID.randomUUID();
        refund(payment(owner, "{}"), null, "PENDING");
        assertEquals(Set.of("REFUND_IN_FLIGHT"), codes(service.blockers(owner, Scope.CUSTOMER)));
    }

    @Test
    void eraseCustomerScrubsPaymentRequestPayload() {
        UUID checkout = UUID.randomUUID();
        UUID cashfree = payment(customer, CASHFREE_PAYLOAD.formatted(customer));
        UUID razorpay = payment(customer, RAZORPAY_PAYLOAD.formatted(checkout, customer));
        UUID other = payment(UUID.randomUUID(), CASHFREE_PAYLOAD.formatted(UUID.randomUUID()));
        String otherBefore = payload(other);

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals("DONE", response.status());
        assertEquals("integration", response.service());
        assertEquals(COUNT_KEYS, response.counts().keySet());
        assertEquals(2, response.counts().get("payment_order"));
        for (UUID id : List.of(cashfree, razorpay)) {
            String after = payload(id);
            assertFalse(after.contains("Real Person") || after.contains("9876543210") || after.contains("real.person@example.com"), after);
            assertFalse(after.contains("76543210") || after.contains("@example.com"), "nothing partially visible: " + after);
        }
        // Everything that is not the person stays exactly as it was: amounts, order ids, urls, identities.
        assertEquals("433.10", jdbc.queryForObject("SELECT request_payload->>'order_amount' FROM payment_schema.payment_order WHERE id=?", String.class, cashfree));
        assertEquals("CRV_ORDER_1", jdbc.queryForObject("SELECT request_payload->>'order_id' FROM payment_schema.payment_order WHERE id=?", String.class, cashfree));
        assertEquals("https://craves.in/hook", jdbc.queryForObject("SELECT request_payload->'order_meta'->>'notify_url' FROM payment_schema.payment_order WHERE id=?", String.class, cashfree));
        assertEquals(customer.toString(), jdbc.queryForObject("SELECT request_payload->'customer_details'->>'customer_id' FROM payment_schema.payment_order WHERE id=?", String.class, cashfree));
        assertEquals("43310", jdbc.queryForObject("SELECT request_payload->>'amount' FROM payment_schema.payment_order WHERE id=?", String.class, razorpay));
        assertEquals(checkout.toString(), jdbc.queryForObject("SELECT request_payload->'notes'->>'craves_checkout_id' FROM payment_schema.payment_order WHERE id=?", String.class, razorpay));
        assertEquals(AccountErasureService.ERASED_NAME, jdbc.queryForObject("SELECT request_payload->'notes'->>'customer_name' FROM payment_schema.payment_order WHERE id=?", String.class, razorpay));
        assertEquals(AccountErasureService.ERASED_PHONE, jdbc.queryForObject("SELECT request_payload->'customer_details'->>'customer_phone' FROM payment_schema.payment_order WHERE id=?", String.class, cashfree));
        assertEquals(AccountErasureService.ERASED_EMAIL, jdbc.queryForObject("SELECT request_payload->'customer_details'->>'customer_email' FROM payment_schema.payment_order WHERE id=?", String.class, cashfree));
        assertEquals(AccountErasureService.ERASED_NAME, jdbc.queryForObject("SELECT request_payload->'customer_details'->>'customer_name' FROM payment_schema.payment_order WHERE id=?", String.class, cashfree));
        assertEquals(otherBefore, payload(other), "another customer's payment is not touched");
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM payment_schema.payment_order WHERE customer_identity_id=?", Integer.class, customer));
    }

    @Test
    void aPaymentWithoutAPayloadOrPersonalFieldsIsLeftAlone() {
        UUID empty = payment(customer, "{}");
        seed("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,amount,currency,status)"
            + " VALUES (?,?,?,?,1.00,'INR','PAID')", UUID.randomUUID(), UUID.randomUUID(), customer, "test/none-" + customer);
        String before = snapshot("payment_order");

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertAllZero(response);
        assertEquals(before, snapshot("payment_order"));
        assertEquals("{}", payload(empty));
    }

    @Test
    void anOddPayloadShapeIsLeftAloneAndDoesNotStopTheErase() {
        String odd = "{\"customer_details\":\"text\",\"notes\":[1,2],\"order_amount\":5}";
        UUID oddPayment = payment(customer, odd);
        UUID normal = payment(customer, CASHFREE_PAYLOAD.formatted(customer));
        UUID notAnObject = payment(customer, "[1,2]");

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals(1, response.counts().get("payment_order"));
        assertEquals(jdbc.queryForObject("SELECT ?::jsonb::text", String.class, odd), payload(oddPayment));
        assertEquals("[1, 2]", payload(notAnObject));
        assertFalse(payload(normal).contains("Real Person"));
    }

    @Test
    void eraseTwiceIsDoneWithZeroCounts() {
        UUID checkout = UUID.randomUUID();
        UUID paid = payment(customer, checkout, "PAID", CASHFREE_PAYLOAD.formatted(customer), CASHFREE_PAYLOAD.formatted(customer));
        attempt(paid, CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), customer));
        event(paid, CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), customer));
        inbox("PROCESSED", CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), customer));
        delivery("COMPLETED", CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), customer));
        trip(checkout, "DELIVERED");
        settledChef();

        ErasureResponse first = erase(customer, Scope.ALL);
        Map<String, String> afterFirst = snapshots(ALL_TABLES);
        ErasureResponse second = erase(customer, Scope.ALL);

        assertEquals(Map.of("payment_order", 1, "payment_attempt", 1, "payment_event", 1, "webhook_inbox", 1,
            "cashfree_webhook_delivery", 1, "fleet_trip", 1), first.counts());
        assertEquals("DONE", second.status());
        assertAllZero(second);
        assertEquals(afterFirst, snapshots(ALL_TABLES));
        // Same for a person this service never saw (worker retry after a timeout).
        UUID stranger = UUID.randomUUID();
        assertAllZero(erase(stranger, Scope.CUSTOMER));
        assertEquals(Map.of(), erase(stranger, Scope.CHEF).counts());
    }

    @Test
    void eraseChefChangesNothing() {
        settledChef();
        // The same person is also a customer: a CHEF erase must not touch any of it.
        UUID checkout = UUID.randomUUID();
        UUID paid = payment(chef, checkout, "PAID", CASHFREE_PAYLOAD.formatted(chef), CASHFREE_PAYLOAD.formatted(chef));
        attempt(paid, CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), chef));
        event(paid, CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), chef));
        inbox("PROCESSED", CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), chef));
        delivery("COMPLETED", CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), chef));
        trip(checkout, "DELIVERED");
        refund(payment(chef, "{}"), chef, "SUCCESS");
        assertTrue(service.blockers(chef, Scope.CHEF).isEmpty());
        Map<String, String> before = snapshots(ALL_TABLES);
        Map<String, Long> counts = ALL_TABLES.stream().collect(Collectors.toMap(t -> t,
            t -> jdbc.queryForObject("SELECT count(*) FROM " + (t.contains(".") ? t : "payment_schema." + t), Long.class)));
        assertTrue(counts.get("finance_payable") > 0 && counts.get("finance_payout_instruction") > 0
            && counts.get("ledger_transaction") > 0 && counts.get("finance_bank_request") > 0, "the fixture really holds money rows");

        ErasureResponse response = erase(chef, Scope.CHEF);

        assertEquals("DONE", response.status());
        assertEquals(Map.of(), response.counts());
        assertEquals(before, snapshots(ALL_TABLES), "row contents, not only counts");
        ALL_TABLES.forEach(t -> assertEquals(counts.get(t),
            jdbc.queryForObject("SELECT count(*) FROM " + (t.contains(".") ? t : "payment_schema." + t), Long.class), t));
    }

    @Test
    void eraseCustomerLeavesChefMoneyRowsUntouched() {
        settledChef();
        UUID paymentId = payment(chef, CASHFREE_PAYLOAD.formatted(chef));
        Map<String, String> before = snapshots(MONEY_TABLES);

        ErasureResponse response = erase(chef, Scope.CUSTOMER);

        assertEquals(1, response.counts().get("payment_order"));
        assertFalse(payload(paymentId).contains("Real Person"));
        assertEquals(before, snapshots(MONEY_TABLES));
    }

    @Test
    void aBlockedEraseChangesNothing() {
        UUID paymentId = payment(customer, CASHFREE_PAYLOAD.formatted(customer));
        refund(paymentId, customer, "PROCESSING");
        payable(customer);
        control(customer, true);
        UUID checkout = UUID.randomUUID();
        UUID paid = payment(customer, checkout, "PAID", CASHFREE_PAYLOAD.formatted(customer), CASHFREE_PAYLOAD.formatted(customer));
        attempt(paid, CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), customer));
        event(paid, CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), customer));
        inbox("PROCESSED", CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), customer));
        delivery("COMPLETED", CASHFREE_WEBHOOK.formatted(providerOrderId(checkout), customer));
        trip(checkout, "DELIVERED");
        Map<String, String> before = snapshots(ALL_TABLES);

        for (Scope scope : List.of(Scope.CUSTOMER, Scope.CHEF, Scope.ALL)) {
            ErasureResponse response = erase(customer, scope);
            assertEquals("BLOCKED", response.status(), scope.name());
            assertEquals(scope == Scope.CUSTOMER ? Set.of("REFUND_IN_FLIGHT")
                : scope == Scope.CHEF ? Set.of("PAYABLE_UNPAID", "PAYOUT_ON_HOLD")
                : Set.of("REFUND_IN_FLIGHT", "PAYABLE_UNPAID", "PAYOUT_ON_HOLD"), codes(response.blockers()), scope.name());
            assertEquals(before, snapshots(ALL_TABLES), scope.name());
        }
        assertTrue(payload(paymentId).contains("Real Person"));
    }

    // ---- a payout hold only blocks while something is owed ---------------------------------------------------

    @Test
    void aHoldWithNothingOwedIsNotABlocker() {
        for (String kind : List.of("BANK_REQUIREMENT", "OPERATIONAL")) {
            UUID settled = UUID.randomUUID();
            allocate(instruction(settled, "PAID"), payable(settled), true);
            legacyEarning(settled, "SETTLED");
            control(settled, true, kind);

            assertTrue(service.blockers(settled, Scope.CHEF).isEmpty(), kind);
            assertTrue(service.blockers(settled, Scope.ALL).isEmpty(), kind);
            assertEquals("DONE", tx.execute(s -> service.erase(settled, Scope.CHEF, request)).status(), kind);
        }
    }

    @Test
    void aHoldWithSomethingOwedBlocks() {
        for (String kind : List.of("BANK_REQUIREMENT", "OPERATIONAL")) {
            UUID unpaid = UUID.randomUUID();
            payable(unpaid);
            control(unpaid, true, kind);
            assertEquals(Set.of("PAYABLE_UNPAID", "PAYOUT_ON_HOLD"), codes(service.blockers(unpaid, Scope.CHEF)), kind);

            UUID unsettled = UUID.randomUUID();
            legacyEarning(unsettled, "SETTLEMENT_PENDING");
            control(unsettled, true, kind);
            assertEquals(Set.of("SETTLEMENT_PENDING", "PAYOUT_ON_HOLD"), codes(service.blockers(unsettled, Scope.CHEF)), kind);
        }
        UUID noHold = UUID.randomUUID();
        payable(noHold);
        control(noHold, false);
        assertEquals(Set.of("PAYABLE_UNPAID"), codes(service.blockers(noHold, Scope.CHEF)));
    }

    // ---- the personal fields kept in provider records and on fleet trips -------------------------------------

    private static final class Scene {
        UUID paid, razor, pending;
        UUID attemptPaid, attemptRazor, attemptPending, eventPaid, eventRazor, eventPending;
        UUID inboxRazor, inboxReceived, inboxPending, deliveryPending;
        final List<UUID> inboxFinished = new ArrayList<>();
        final List<UUID> deliveryFinished = new ArrayList<>();
        final List<UUID> deliveryInFlight = new ArrayList<>();
        final List<UUID> tripsFinished = new ArrayList<>();
        UUID tripActive;
        // Rows that must stay as they are: still being handled.
        List<UUID> inFlightInbox() {
            return List.of(inboxReceived, inboxPending);
        }
    }

    /**
     * A paid Cashfree order, a paid Razorpay order and one still being paid, each with the provider records Craves keeps,
     * plus webhook rows and fleet trips in every state.
     */
    private static Scene scene(UUID owner) {
        Scene sc = new Scene();
        UUID paidCheckout = UUID.randomUUID();
        UUID razorCheckout = UUID.randomUUID();
        UUID pendingCheckout = UUID.randomUUID();
        String razorOrder = "order_Rzp" + razorCheckout.toString().substring(0, 8);
        String paidRef = providerOrderId(paidCheckout);
        String pendingRef = providerOrderId(pendingCheckout);
        sc.paid = payment(owner, paidCheckout, "PAID", CASHFREE_PAYLOAD.formatted(owner), CASHFREE_RESPONSE.formatted(paidRef, owner));
        sc.razor = payment(owner, razorCheckout, razorOrder, "PAID", RAZORPAY_PAYLOAD.formatted(razorCheckout, owner), RAZORPAY_RESPONSE.formatted(razorOrder));
        sc.pending = payment(owner, pendingCheckout, "PAYMENT_PENDING", CASHFREE_PAYLOAD.formatted(owner), CASHFREE_RESPONSE.formatted(pendingRef, owner));
        sc.attemptPaid = attempt(sc.paid, CASHFREE_WEBHOOK.formatted(paidRef, owner));
        sc.attemptRazor = attempt(sc.razor, RAZORPAY_WEBHOOK.formatted(razorOrder));
        sc.attemptPending = attempt(sc.pending, CASHFREE_WEBHOOK.formatted(pendingRef, owner));
        sc.eventPaid = event(sc.paid, CASHFREE_WEBHOOK.formatted(paidRef, owner));
        sc.eventRazor = event(sc.razor, RAZORPAY_WEBHOOK.formatted(razorOrder));
        sc.eventPending = event(sc.pending, CASHFREE_WEBHOOK.formatted(pendingRef, owner));
        for (String status : List.of("PROCESSED", "DUPLICATE", "REJECTED", "FAILED")) {
            sc.inboxFinished.add(inbox(status, CASHFREE_WEBHOOK.formatted(paidRef, owner)));
        }
        sc.inboxRazor = inbox("PROCESSED", RAZORPAY_WEBHOOK.formatted(razorOrder));
        sc.inboxReceived = inbox("RECEIVED", CASHFREE_WEBHOOK.formatted(paidRef, owner));
        sc.inboxPending = inbox("PROCESSED", CASHFREE_WEBHOOK.formatted(pendingRef, owner));
        for (String status : List.of("COMPLETED", "DEAD_LETTER")) {
            sc.deliveryFinished.add(delivery(status, CASHFREE_WEBHOOK.formatted(paidRef, owner)));
        }
        for (String status : List.of("RECEIVED", "PROCESSING", "FAILED")) {
            sc.deliveryInFlight.add(delivery(status, CASHFREE_WEBHOOK.formatted(paidRef, owner)));
        }
        sc.deliveryPending = delivery("COMPLETED", CASHFREE_WEBHOOK.formatted(pendingRef, owner));
        for (String state : List.of("DELIVERED", "FAILED", "CANCELLED")) {
            sc.tripsFinished.add(trip(paidCheckout, state));
        }
        sc.tripActive = trip(paidCheckout, "PICKED_UP");
        return sc;
    }

    /** What the same text looks like once the person's fields are replaced and nothing else is. */
    private static String erased(String text) {
        return text.replace("+919876543210", AccountErasureService.ERASED_PHONE).replace("9876543210", AccountErasureService.ERASED_PHONE)
            .replace("Real Person", AccountErasureService.ERASED_NAME)
            .replace("real.person@example.com", AccountErasureService.ERASED_EMAIL);
    }

    private static void assertErased(String table, String column, UUID id, String before) {
        String after = column(table, column, id);
        assertClean(after);
        assertEquals(erased(before), after, table + "." + column + ": only the person's fields change; amounts and ids stay");
    }

    private static String tripWithoutPersonalColumns(UUID id) {
        return jdbc.queryForObject("SELECT (to_jsonb(t) - 'customer_first_name' - 'customer_phone')::text FROM fleet_schema.trip t WHERE id=?", String.class, id);
    }

    @Test
    void eraseScrubsPaymentOrderResponsePayloadToo() {
        Scene mine = scene(customer);
        Scene other = scene(UUID.randomUUID());
        Map<UUID, String> responsesBefore = new java.util.HashMap<>();
        Map<UUID, String> requestsBefore = new java.util.HashMap<>();
        List.of(mine.paid, mine.razor, mine.pending).forEach(id -> {
            responsesBefore.put(id, column("payment_schema.payment_order", "response_payload", id));
            requestsBefore.put(id, column("payment_schema.payment_order", "request_payload", id));
        });
        String otherBefore = row("payment_schema.payment_order", other.paid);
        String moneyBefore = jdbc.queryForObject("SELECT string_agg(concat_ws('|',id,amount,currency,status,provider_order_id,craves_payment_order_ref,updated_at),',' ORDER BY id)"
            + " FROM payment_schema.payment_order WHERE customer_identity_id=?", String.class, customer);

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        // The order's own payloads are scrubbed whatever its state: nothing compares them and the row is the person's.
        assertEquals(3, response.counts().get("payment_order"));
        for (UUID id : List.of(mine.paid, mine.razor, mine.pending)) {
            assertErased("payment_schema.payment_order", "response_payload", id, responsesBefore.get(id));
            assertErased("payment_schema.payment_order", "request_payload", id, requestsBefore.get(id));
        }
        assertEquals("433.10", jdbc.queryForObject("SELECT response_payload->>'order_amount' FROM payment_schema.payment_order WHERE id=?", String.class, mine.paid));
        assertEquals(customer.toString(), jdbc.queryForObject("SELECT response_payload->'customer_details'->>'customer_id' FROM payment_schema.payment_order WHERE id=?", String.class, mine.paid));
        assertEquals(moneyBefore, jdbc.queryForObject("SELECT string_agg(concat_ws('|',id,amount,currency,status,provider_order_id,craves_payment_order_ref,updated_at),',' ORDER BY id)"
            + " FROM payment_schema.payment_order WHERE customer_identity_id=?", String.class, customer));
        assertEquals(otherBefore, row("payment_schema.payment_order", other.paid));
        assertAllZero(erase(customer, Scope.CUSTOMER));
    }

    @Test
    void eraseScrubsPaymentAttemptAndEventPayloadsOfFinishedOrders() {
        Scene mine = scene(customer);
        Scene other = scene(UUID.randomUUID());
        Map<String, String> before = new java.util.HashMap<>();
        for (UUID id : List.of(mine.attemptPaid, mine.attemptRazor)) {
            before.put(id.toString(), column("payment_schema.payment_attempt", "raw_payload", id));
        }
        for (UUID id : List.of(mine.eventPaid, mine.eventRazor)) {
            before.put(id.toString(), column("payment_schema.payment_event", "raw_payload", id));
        }
        String attemptPendingBefore = row("payment_schema.payment_attempt", mine.attemptPending);
        String eventPendingBefore = row("payment_schema.payment_event", mine.eventPending);
        String otherAttemptBefore = row("payment_schema.payment_attempt", other.attemptPaid);
        String otherEventBefore = row("payment_schema.payment_event", other.eventPaid);
        String attemptMoneyBefore = jdbc.queryForObject("SELECT concat_ws('|',cf_payment_id,payment_status,payment_amount,payment_currency,provider,payment_order_id)"
            + " FROM payment_schema.payment_attempt WHERE id=?", String.class, mine.attemptPaid);

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals(2, response.counts().get("payment_attempt"));
        assertEquals(2, response.counts().get("payment_event"));
        for (UUID id : List.of(mine.attemptPaid, mine.attemptRazor)) {
            assertErased("payment_schema.payment_attempt", "raw_payload", id, before.get(id.toString()));
        }
        for (UUID id : List.of(mine.eventPaid, mine.eventRazor)) {
            assertErased("payment_schema.payment_event", "raw_payload", id, before.get(id.toString()));
        }
        assertEquals(attemptMoneyBefore, jdbc.queryForObject("SELECT concat_ws('|',cf_payment_id,payment_status,payment_amount,payment_currency,provider,payment_order_id)"
            + " FROM payment_schema.payment_attempt WHERE id=?", String.class, mine.attemptPaid));
        assertEquals(attemptPendingBefore, row("payment_schema.payment_attempt", mine.attemptPending), "the order is still being paid");
        assertEquals(eventPendingBefore, row("payment_schema.payment_event", mine.eventPending), "the order is still being paid");
        assertEquals(otherAttemptBefore, row("payment_schema.payment_attempt", other.attemptPaid));
        assertEquals(otherEventBefore, row("payment_schema.payment_event", other.eventPaid));
        ErasureResponse second = erase(customer, Scope.CUSTOMER);
        assertAllZero(second);
    }

    @Test
    void eraseScrubsFinishedWebhookRowsOnly() {
        Scene mine = scene(customer);
        Scene other = scene(UUID.randomUUID());
        Map<UUID, String> before = new java.util.HashMap<>();
        List<UUID> inboxToScrub = new ArrayList<>(mine.inboxFinished);
        inboxToScrub.add(mine.inboxRazor);
        inboxToScrub.forEach(id -> before.put(id, column("payment_schema.webhook_inbox", "raw_payload", id)));
        mine.deliveryFinished.forEach(id -> before.put(id, column("payment_schema.cashfree_webhook_delivery", "raw_payload", id)));
        Map<UUID, String> untouched = new java.util.HashMap<>();
        mine.inFlightInbox().forEach(id -> untouched.put(id, row("payment_schema.webhook_inbox", id)));
        mine.deliveryInFlight.forEach(id -> untouched.put(id, row("payment_schema.cashfree_webhook_delivery", id)));
        untouched.put(mine.deliveryPending, row("payment_schema.cashfree_webhook_delivery", mine.deliveryPending));
        other.inboxFinished.forEach(id -> untouched.put(id, row("payment_schema.webhook_inbox", id)));
        other.deliveryFinished.forEach(id -> untouched.put(id, row("payment_schema.cashfree_webhook_delivery", id)));
        String statusBefore = jdbc.queryForObject("SELECT string_agg(concat_ws('|',id,provider,event_identity,processing_status),',' ORDER BY id) FROM payment_schema.webhook_inbox",
            String.class);

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals(5, response.counts().get("webhook_inbox"), "four finished statuses and the Razorpay row");
        assertEquals(2, response.counts().get("cashfree_webhook_delivery"), "COMPLETED and DEAD_LETTER");
        inboxToScrub.forEach(id -> assertErased("payment_schema.webhook_inbox", "raw_payload", id, before.get(id)));
        mine.deliveryFinished.forEach(id -> assertErased("payment_schema.cashfree_webhook_delivery", "raw_payload", id, before.get(id)));
        // RECEIVED, PROCESSING and FAILED are still being handled (FAILED is retried); a pending order's rows wait.
        mine.inFlightInbox().forEach(id -> assertEquals(untouched.get(id), row("payment_schema.webhook_inbox", id)));
        mine.deliveryInFlight.forEach(id -> assertEquals(untouched.get(id), row("payment_schema.cashfree_webhook_delivery", id)));
        assertEquals(untouched.get(mine.deliveryPending), row("payment_schema.cashfree_webhook_delivery", mine.deliveryPending));
        other.inboxFinished.forEach(id -> assertEquals(untouched.get(id), row("payment_schema.webhook_inbox", id)));
        other.deliveryFinished.forEach(id -> assertEquals(untouched.get(id), row("payment_schema.cashfree_webhook_delivery", id)));
        assertEquals(statusBefore, jdbc.queryForObject("SELECT string_agg(concat_ws('|',id,provider,event_identity,processing_status),',' ORDER BY id) FROM payment_schema.webhook_inbox",
            String.class), "statuses and identities stay");
        assertAllZero(erase(customer, Scope.CUSTOMER));
    }

    @Test
    void eraseScrubsCustomerNameAndPhoneOnFinishedFleetTripsOnly() {
        Scene mine = scene(customer);
        Scene other = scene(UUID.randomUUID());
        Map<UUID, String> otherColumns = new java.util.HashMap<>();
        mine.tripsFinished.forEach(id -> otherColumns.put(id, tripWithoutPersonalColumns(id)));
        String activeBefore = row("fleet_schema.trip", mine.tripActive);
        String otherBefore = row("fleet_schema.trip", other.tripActive);
        List<String> otherFinishedBefore = other.tripsFinished.stream().map(id -> row("fleet_schema.trip", id)).toList();

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals(3, response.counts().get("fleet_trip"));
        for (UUID id : mine.tripsFinished) {
            assertEquals(AccountErasureService.ERASED_NAME, jdbc.queryForObject("SELECT customer_first_name FROM fleet_schema.trip WHERE id=?", String.class, id));
            assertEquals(AccountErasureService.ERASED_PHONE, jdbc.queryForObject("SELECT customer_phone FROM fleet_schema.trip WHERE id=?", String.class, id));
            assertEquals(otherColumns.get(id), tripWithoutPersonalColumns(id), "state, rider, kitchen, chef phone, drop address and ids stay");
        }
        assertEquals(activeBefore, row("fleet_schema.trip", mine.tripActive), "a trip still on the road is not touched");
        assertEquals(otherBefore, row("fleet_schema.trip", other.tripActive));
        assertEquals(otherFinishedBefore, other.tripsFinished.stream().map(id -> row("fleet_schema.trip", id)).toList());
        assertAllZero(erase(customer, Scope.CUSTOMER));
    }

    @Test
    void aNameWithEscapedQuotesAndBackslashesIsReplacedWhole() {
        UUID id = payment(customer, "{\"customer_details\":{\"customer_id\":\"x\",\"customer_name\":\"Anne \\\"Real Person\\\" O\\\\Brien\","
            + "\"customer_phone\":\"9876543210\"},\"order_amount\":1.50}");

        assertEquals(1, erase(customer, Scope.CUSTOMER).counts().get("payment_order"));

        String after = payload(id);
        assertFalse(after.contains("Real Person") || after.contains("Brien") || after.contains("Anne"), after);
        assertEquals(AccountErasureService.ERASED_NAME, jdbc.queryForObject(
            "SELECT request_payload->'customer_details'->>'customer_name' FROM payment_schema.payment_order WHERE id=?", String.class, id));
        assertEquals("1.50", jdbc.queryForObject("SELECT request_payload->>'order_amount' FROM payment_schema.payment_order WHERE id=?", String.class, id));
    }
}
