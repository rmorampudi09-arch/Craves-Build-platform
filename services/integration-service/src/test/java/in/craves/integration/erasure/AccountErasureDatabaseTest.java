package in.craves.integration.erasure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import in.craves.integration.erasure.AccountErasureDtos.Blocker;
import in.craves.integration.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.integration.erasure.AccountErasureDtos.Scope;
import java.math.BigDecimal;
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
    private static final List<String> MONEY_TABLES = List.of(
        "ledger_transaction", "ledger_line", "finance_payable", "finance_payout_instruction",
        "finance_payout_allocation", "finance_chef_payout_control", "finance_beneficiary_version",
        "finance_bank_request", "chef_earning_entry", "chef_referral_posting", "payment_order", "refund");

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
        UUID id = UUID.randomUUID();
        seed("INSERT INTO payment_schema.payment_order(id,checkout_id,customer_identity_id,craves_payment_order_ref,amount,currency,status,request_payload)"
            + " VALUES (?,?,?,?,?,'INR','PAID',?::jsonb)", id, UUID.randomUUID(), owner, "test/" + id, new BigDecimal("433.10"), payload);
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
        seed("INSERT INTO payment_schema.finance_chef_payout_control(chef_identity_id,on_hold,hold_reason,hold_kind)"
            + " VALUES (?,?,?, 'OPERATIONAL')", owner, onHold, onHold ? "Test hold" : null);
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
        return jdbc.queryForObject("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM payment_schema."
            + table + " t", String.class);
    }

    private static Map<String, String> snapshots(List<String> tables) {
        return tables.stream().collect(Collectors.toMap(t -> t, AccountErasureDatabaseTest::snapshot));
    }

    private static String payload(UUID paymentId) {
        return jdbc.queryForObject("SELECT request_payload::text FROM payment_schema.payment_order WHERE id=?", String.class, paymentId);
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
        assertEquals(Map.of("payment_order", 2), response.counts());
        for (UUID id : List.of(cashfree, razorpay)) {
            String after = payload(id);
            assertFalse(after.contains("Real Person") || after.contains("9876543210") || after.contains("real.person@example.com"), after);
            assertFalse(after.contains("3210") || after.contains("@example.com"), "nothing partially visible: " + after);
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

        assertEquals(Map.of("payment_order", 0), response.counts());
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

        assertEquals(Map.of("payment_order", 1), response.counts());
        assertEquals(jdbc.queryForObject("SELECT ?::jsonb::text", String.class, odd), payload(oddPayment));
        assertEquals("[1, 2]", payload(notAnObject));
        assertFalse(payload(normal).contains("Real Person"));
    }

    @Test
    void eraseTwiceIsDoneWithZeroCounts() {
        payment(customer, CASHFREE_PAYLOAD.formatted(customer));
        settledChef();

        ErasureResponse first = erase(customer, Scope.ALL);
        Map<String, String> afterFirst = snapshots(MONEY_TABLES);
        ErasureResponse second = erase(customer, Scope.ALL);

        assertEquals(Map.of("payment_order", 1), first.counts());
        assertEquals("DONE", second.status());
        assertEquals(Map.of("payment_order", 0), second.counts());
        assertEquals(afterFirst, snapshots(MONEY_TABLES));
        // Same for a person this service never saw (worker retry after a timeout).
        UUID stranger = UUID.randomUUID();
        assertEquals(Map.of("payment_order", 0), erase(stranger, Scope.CUSTOMER).counts());
        assertEquals(Map.of(), erase(stranger, Scope.CHEF).counts());
    }

    @Test
    void eraseChefChangesNothing() {
        settledChef();
        payment(chef, CASHFREE_PAYLOAD.formatted(chef)); // the same person is also a customer: CHEF must not touch it
        refund(payment(chef, "{}"), chef, "SUCCESS");
        assertTrue(service.blockers(chef, Scope.CHEF).isEmpty());
        Map<String, String> before = snapshots(MONEY_TABLES);
        Map<String, Long> counts = MONEY_TABLES.stream().collect(Collectors.toMap(t -> t,
            t -> jdbc.queryForObject("SELECT count(*) FROM payment_schema." + t, Long.class)));
        assertTrue(counts.get("finance_payable") > 0 && counts.get("finance_payout_instruction") > 0
            && counts.get("ledger_transaction") > 0 && counts.get("finance_bank_request") > 0, "the fixture really holds money rows");

        ErasureResponse response = erase(chef, Scope.CHEF);

        assertEquals("DONE", response.status());
        assertEquals(Map.of(), response.counts());
        assertEquals(before, snapshots(MONEY_TABLES), "row contents, not only counts");
        MONEY_TABLES.forEach(t -> assertEquals(counts.get(t), jdbc.queryForObject("SELECT count(*) FROM payment_schema." + t, Long.class), t));
    }

    @Test
    void eraseCustomerLeavesChefMoneyRowsUntouched() {
        settledChef();
        UUID paymentId = payment(chef, CASHFREE_PAYLOAD.formatted(chef));
        List<String> chefTables = MONEY_TABLES.stream().filter(t -> !t.equals("payment_order") && !t.equals("refund")).toList();
        Map<String, String> before = snapshots(chefTables);

        ErasureResponse response = erase(chef, Scope.CUSTOMER);

        assertEquals(Map.of("payment_order", 1), response.counts());
        assertFalse(payload(paymentId).contains("Real Person"));
        assertEquals(before, snapshots(chefTables));
    }

    @Test
    void aBlockedEraseChangesNothing() {
        UUID paymentId = payment(customer, CASHFREE_PAYLOAD.formatted(customer));
        refund(paymentId, customer, "PROCESSING");
        payable(customer);
        control(customer, true);
        Map<String, String> before = snapshots(MONEY_TABLES);

        for (Scope scope : List.of(Scope.CUSTOMER, Scope.CHEF, Scope.ALL)) {
            ErasureResponse response = erase(customer, scope);
            assertEquals("BLOCKED", response.status(), scope.name());
            assertEquals(scope == Scope.CUSTOMER ? Set.of("REFUND_IN_FLIGHT")
                : scope == Scope.CHEF ? Set.of("PAYABLE_UNPAID", "PAYOUT_ON_HOLD")
                : Set.of("REFUND_IN_FLIGHT", "PAYABLE_UNPAID", "PAYOUT_ON_HOLD"), codes(response.blockers()), scope.name());
            assertEquals(before, snapshots(MONEY_TABLES), scope.name());
        }
        assertTrue(payload(paymentId).contains("Real Person"));
    }
}
