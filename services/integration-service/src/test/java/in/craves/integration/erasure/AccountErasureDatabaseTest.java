package in.craves.integration.erasure;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
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
         "payment":{"cf_payment_id":"7001","payment_status":"SUCCESS","payment_amount":433.10,"payment_currency":"INR",
                    "payment_method":{"upi":{"channel":"collect","upi_id":"9876543210@ybl"}}},
         "customer_details":{"customer_name":"Real Person","customer_id":"%s","customer_email":"real.person@example.com",
                             "customer_phone":"9876543210"}},"type":"PAYMENT_SUCCESS_WEBHOOK"}""";
    private static final String RAZORPAY_WEBHOOK = """
        {"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_7001","order_id":"%s","status":"captured",
         "amount":43310,"currency":"INR","email":"real.person@example.com","contact":"+919876543210",
         "vpa":"9876543210@okaxis","card":{"last4":"1234","network":"Visa"},
         "notes":{"customer_name":"Real Person"}}}}}""";
    private static final String CASHFREE_RESPONSE = """
        {"order_id":"%s","cf_order_id":"3001","order_status":"ACTIVE","order_amount":433.10,"payment_session_id":"session_abc",
         "customer_details":{"customer_id":"%s","customer_name":"Real Person","customer_email":"real.person@example.com",
                             "customer_phone":"9876543210"}}""";
    private static final String RAZORPAY_RESPONSE = """
        {"id":"%s","amount":43310,"currency":"INR","status":"created","notes":{"customer_name":"Real Person"}}""";
    /** What Craves stores for a delivery: the command, with the pickup (kitchen) and the customer's drop-off. */
    private static final String DELIVERY_COMMAND = """
        {"commandId":"%s","orderId":"%s","chefSubOrderId":"%s","area":"Madhapur","deliveryRequest":{"matter":"Food","declaredGoodsValue":433.10,
         "pickup":{"address":"Kitchen road 1","contactName":"Chef Kitchen","contactPhone":"8888888888","latitude":17.4,"longitude":78.4},
         "dropoff":{"address":"12 Real Street, Flat 4","contactName":"Real Person","contactPhone":"9876543210","latitude":17.4412345,
           "longitude":78.3912345,"note":"Gate code 1234","addressLine1":"12 Real Street","addressLine2":"Flat 4",
           "landmark":"Near Real Temple","area":"Madhapur","city":"Hyderabad","state":"Telangana","postalCode":"500081","country":"India"}}}""";
    /** A Borzo order as the provider returns it: the kitchen is point 0, the customer point 1, the rider is the courier. */
    private static final String BORZO_ORDER = """
        {"order":{"order_id":%d,"status":"active","payment_amount":"150.00","courier":{"name":"Rider Name","phone":"7777777777"},
          "points":[{"address":"Kitchen road 1","contact_person":{"name":"Chef Kitchen","phone":"8888888888"},"latitude":"17.4","longitude":"78.4"},
            {"address":"12 Real Street, Flat 4","contact_person":{"name":"Real Person","phone":"9876543210"},"latitude":"17.4412345",
             "longitude":"78.3912345","note":"Gate code 1234","building_number":"12","delivery_id":11712,
             "tracking_url":"https://tracking.example/11712","delivery":{"status":"parcel_picked_up"},
             "checkin":{"recipient_full_name":"Real Person","recipient_position":"Neighbour"},"sign_photo_url":"https://borzo.example/real-sign.jpg"}]}}""";
    private static final String[] PERSONAL = {"Real Person", "9876543210", "real.person@example.com"};
    /** Legal records and everything of someone else's: a chef erase, a blocked erase and the other side never change them. */
    private static final List<String> MONEY_TABLES = List.of(
        "ledger_transaction", "ledger_line", "finance_payable", "finance_payout_instruction",
        "finance_payout_allocation", "finance_chef_payout_control", "finance_beneficiary_version",
        "finance_bank_request", "chef_earning_entry", "chef_referral_posting");
    /** What a CUSTOMER erase may change, besides the personal fields. */
    private static final List<String> CUSTOMER_TABLES = List.of(
        "payment_order", "refund", "payment_attempt", "payment_event", "webhook_inbox", "cashfree_webhook_delivery", "fleet_schema.trip",
        "fleet_schema.trip_event", "delivery_schema.delivery_command", "delivery_schema.delivery_assignment",
        "delivery_schema.delivery_assignment_candidate", "delivery_schema.delivery_job", "delivery_schema.delivery_event",
        "delivery_schema.delivery_webhook_inbox");
    private static final List<String> ALL_TABLES = java.util.stream.Stream.concat(MONEY_TABLES.stream(), CUSTOMER_TABLES.stream()).toList();
    private static final Set<String> COUNT_KEYS = Set.of(
        "payment_order", "payment_attempt", "payment_event", "webhook_inbox", "cashfree_webhook_delivery", "fleet_trip", "fleet_trip_event",
        "delivery_command", "delivery_assignment", "delivery_assignment_candidate", "delivery_job", "delivery_event", "delivery_webhook_inbox");
    /** CHEF and ALL also replace the kitchen's contact on the chef's own finished trips. */
    private static final String KITCHEN_KEY = "fleet_trip_kitchen";

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
        service = new AccountErasureService(jdbc, new ObjectMapper());
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

    private static UUID trip(UUID checkout, String state) {
        return trip(checkout, state, UUID.randomUUID(), "Near Real Temple");
    }

    /** One fleet trip for a checkout; the customer's name, phone and drop-off are the columns under test, the rider's are not. */
    private static UUID trip(UUID checkout, String state, UUID chefSubOrder, String landmark) {
        return trip(checkout, state, chefSubOrder, landmark, UUID.randomUUID());
    }

    /** The same, cooked by the given chef; the kitchen's address, landmark, position and the chef's phone are the chef's. */
    private static UUID trip(UUID checkout, String state, UUID chefSubOrder, String landmark, UUID chefId) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO fleet_schema.trip(id,chef_sub_order_id,order_id,chef_id,order_code,state,items_count,kitchen_name,kitchen_area,kitchen_address,"
            + "kitchen_landmark,kitchen_lat,kitchen_lng,chef_phone,customer_first_name,customer_phone,drop_area,drop_address,drop_landmark,drop_lat,drop_lng)"
            + " VALUES (?,?,?,?,'#ABCDEF12',?,2,'Kitchen','Area','Kitchen road',?,17.4612345,78.3654321,'8888888888','Real','9876543210','Drop area',"
            + "'12 Real Street, Flat 4',?,17.4412345,78.3912345)", id, chefSubOrder, checkout, chefId, state, landmark == null ? null : "Opposite the park",
            landmark);
        return id;
    }

    private static void tripEvent(UUID trip, String detail) {
        seed("INSERT INTO fleet_schema.trip_event(id,trip_id,kind,actor_type,detail) VALUES (?,?,'FAILED','RIDER',?::jsonb)", UUID.randomUUID(), trip, detail);
    }

    private static UUID job(UUID checkout, UUID chefSubOrder, String status, String snapshot) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO delivery_schema.delivery_job(id,chef_sub_order_id,order_id,provider_id,provider_delivery_id,status,quote_snapshot)"
            + " VALUES (?,?,?,'borzo',?,?,?::jsonb)", id, chefSubOrder, checkout, "borzo-" + id, status, snapshot);
        return id;
    }

    private static UUID command(UUID checkout, UUID chefSubOrder, String status) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO delivery_schema.delivery_command(id,chef_sub_order_id,order_id,command_type,status,dispatch_at,idempotency_key,payload)"
            + " VALUES (?,?,?,'QUOTE_AND_CREATE',?,now(),?,?::jsonb)", id, chefSubOrder, checkout, status, "cmd/" + id,
            DELIVERY_COMMAND.formatted(id, checkout, chefSubOrder));
        return id;
    }

    private static UUID assignment(UUID checkout, UUID chefSubOrder) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO delivery_schema.delivery_assignment(id,chef_sub_order_id,order_id,strategy,status,scoring_version,request_context)"
            + " VALUES (?,?,?,'GREEDY','ASSIGNED','test',?::jsonb)", id, chefSubOrder, checkout,
            "{\"area\":\"Madhapur\",\"distanceKm\":2.5,\"candidates\":[{\"providerId\":\"borzo\",\"providerMetadata\":"
                + BORZO_ORDER.formatted(1250032) + "}]}");
        return id;
    }

    private static UUID candidate(UUID assignment) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO delivery_schema.delivery_assignment_candidate(id,assignment_id,provider_id,candidate_rank,predicted_success_probability,"
            + "combined_score,stored_avg,momentum,exploration_sample,provider_quality_score,proximity_score,final_score,status,provider_metadata)"
            + " VALUES (?,?,'borzo',1,0.5,50,50,'STABLE',0.5,50,50,50,'RANKED',?::jsonb)", id, assignment, BORZO_ORDER.formatted(1250032));
        return id;
    }

    private static UUID deliveryEvent(UUID job, String payload) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO delivery_schema.delivery_event(id,delivery_job_id,provider_id,provider_event_id,event_type,normalized_status,payload,occurred_at,source)"
            + " VALUES (?,?,'borzo',?,'order_changed','PICKED_UP',?::jsonb,now(),'WEBHOOK')", id, job, "evt/" + id, payload);
        return id;
    }

    /** A Borzo webhook row with the ids the normalizer stores: its order id, and its own delivery id. */
    private static UUID deliveryInboxWithIds(String status, String body, String providerOrderId, String providerDeliveryId) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO delivery_schema.delivery_webhook_inbox(id,provider_id,provider_event_id,processing_status,raw_payload,provider_order_id,"
            + "provider_delivery_id) VALUES (?,'borzo',?,?,?::jsonb,?,?)", id, "inb/" + id, status, body, providerOrderId, providerDeliveryId);
        return id;
    }

    private static UUID stage(UUID trip, String provider, String state) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO fleet_schema.trip_stage(id,trip_id,seq,provider,state,deadline_at,closed_at) VALUES (?,?,1,?,?,now() + interval '10 minutes',"
            + "CASE WHEN ? = 'CLOSED' THEN now() ELSE NULL END)", id, trip, provider, state, state);
        return id;
    }

    private static void closeStage(UUID stage) {
        seed("UPDATE fleet_schema.trip_stage SET state = 'CLOSED', closed_at = now() WHERE id = ?", stage);
    }

    private static UUID deliveryInbox(UUID job, String status, String body) {
        UUID id = UUID.randomUUID();
        seed("INSERT INTO delivery_schema.delivery_webhook_inbox(id,provider_id,provider_event_id,processing_status,raw_payload,delivery_job_id)"
            + " VALUES (?,'borzo',?,?,?::jsonb,?)", id, "inb/" + id, status, body, job);
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

        Map<String, Integer> expected = new java.util.HashMap<>();
        COUNT_KEYS.forEach(k -> expected.put(k, 0));
        expected.put(KITCHEN_KEY, 0);
        expected.putAll(Map.of("payment_order", 1, "payment_attempt", 1, "payment_event", 1, "webhook_inbox", 1,
            "cashfree_webhook_delivery", 1, "fleet_trip", 1));
        assertEquals(expected, first.counts());
        assertEquals("DONE", second.status());
        assertEquals(expected.keySet(), second.counts().keySet());
        assertTrue(second.counts().values().stream().allMatch(n -> n == 0), second.counts().toString());
        assertEquals(afterFirst, snapshots(ALL_TABLES));
        // Same for a person this service never saw (worker retry after a timeout).
        UUID stranger = UUID.randomUUID();
        assertAllZero(erase(stranger, Scope.CUSTOMER));
        assertEquals(Map.of(KITCHEN_KEY, 0), erase(stranger, Scope.CHEF).counts());
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
        assertEquals(Map.of(KITCHEN_KEY, 0), response.counts(), "the chef has no trips of their own here");
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
        UUID chefSubOrderOfFleetTrip;
        UUID job, command, commandFleet, assignment, candidate, deliveryEvt, deliveryInboxProcessed, deliveryInboxDead;
        UUID jobActive, commandActive, assignmentActive, candidateActive, deliveryEvtActive, deliveryInboxActive;
        UUID commandNotStarted, deliveryInboxReceived, deliveryInboxFailed;
        UUID tripEventFinished, tripEventActive;
        // Rows that must stay as they are: still being handled.
        List<UUID> inFlightInbox() {
            return List.of(inboxReceived);
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
        // The first finished trip is the one the Craves fleet delivered for chef order cs3; the FAILED one has no landmark.
        sc.chefSubOrderOfFleetTrip = UUID.randomUUID();
        sc.tripsFinished.add(trip(paidCheckout, "DELIVERED", sc.chefSubOrderOfFleetTrip, "Near Real Temple"));
        sc.tripsFinished.add(trip(paidCheckout, "FAILED", UUID.randomUUID(), null));
        sc.tripsFinished.add(trip(paidCheckout, "CANCELLED", UUID.randomUUID(), "Near Real Temple"));
        sc.tripActive = trip(paidCheckout, "PICKED_UP");
        String note = "{\"reason\":\"CUSTOMER_UNREACHABLE\",\"callsMade\":3,\"note\":\"Real Person was not at 12 Real Street, called 9876543210\"}";
        tripEvent(sc.tripsFinished.get(0), note);
        tripEvent(sc.tripActive, note);
        sc.tripEventFinished = jdbc.queryForObject("SELECT id FROM fleet_schema.trip_event WHERE trip_id=?", UUID.class, sc.tripsFinished.get(0));
        sc.tripEventActive = jdbc.queryForObject("SELECT id FROM fleet_schema.trip_event WHERE trip_id=?", UUID.class, sc.tripActive);
        // cs1: a delivered Borzo order with all its records; cs2: one still searching for a rider; cs3: delivered by the fleet,
        // no provider job; cs4: a command that has not run yet.
        UUID cs1 = UUID.randomUUID();
        UUID cs2 = UUID.randomUUID();
        UUID cs4 = UUID.randomUUID();
        sc.job = job(paidCheckout, cs1, "DELIVERED", "{\"providerId\":\"borzo\",\"delivery\":{\"providerMetadata\":" + BORZO_ORDER.formatted(1250032) + "}}");
        sc.command = command(paidCheckout, cs1, "COMPLETED");
        sc.assignment = assignment(paidCheckout, cs1);
        sc.candidate = candidate(sc.assignment);
        sc.deliveryEvt = deliveryEvent(sc.job, BORZO_ORDER.formatted(1250032));
        sc.deliveryInboxProcessed = deliveryInbox(sc.job, "PROCESSED", BORZO_ORDER.formatted(1250032));
        sc.deliveryInboxDead = deliveryInbox(sc.job, "DEAD_LETTER", BORZO_ORDER.formatted(1250032));
        sc.deliveryInboxReceived = deliveryInbox(sc.job, "RECEIVED", BORZO_ORDER.formatted(1250032));
        sc.deliveryInboxFailed = deliveryInbox(sc.job, "FAILED", BORZO_ORDER.formatted(1250032));
        sc.jobActive = job(paidCheckout, cs2, "SEARCHING", "{\"delivery\":{\"providerMetadata\":" + BORZO_ORDER.formatted(1250033) + "}}");
        sc.commandActive = command(paidCheckout, cs2, "COMPLETED");
        sc.assignmentActive = assignment(paidCheckout, cs2);
        sc.candidateActive = candidate(sc.assignmentActive);
        sc.deliveryEvtActive = deliveryEvent(sc.jobActive, BORZO_ORDER.formatted(1250033));
        sc.deliveryInboxActive = deliveryInbox(sc.jobActive, "PROCESSED", BORZO_ORDER.formatted(1250033));
        sc.commandFleet = command(paidCheckout, sc.chefSubOrderOfFleetTrip, "COMPLETED");
        sc.commandNotStarted = command(paidCheckout, cs4, "SCHEDULED");
        return sc;
    }

    /** What the same text looks like once the person's fields are replaced and nothing else is. */
    private static String erased(String text) {
        return text.replace("9876543210@ybl", AccountErasureService.ERASED_UPI_ID).replace("9876543210@okaxis", AccountErasureService.ERASED_UPI_ID)
            .replace("+919876543210", AccountErasureService.ERASED_PHONE).replace("9876543210", AccountErasureService.ERASED_PHONE)
            .replace("Real Person", AccountErasureService.ERASED_NAME)
            .replace("real.person@example.com", AccountErasureService.ERASED_EMAIL);
    }

    /** The same for a delivery record: the customer's drop-off goes, the kitchen, the rider, amounts and ids stay. */
    private static String erasedDrop(String text) {
        return text.replace("12 Real Street, Flat 4", "[deleted]").replace("12 Real Street", "[deleted]").replace("Flat 4", "[deleted]")
            .replace("Near Real Temple", "[deleted]").replace("Gate code 1234", "[deleted]").replace("500081", "000000")
            .replace("17.4412345", "0").replace("78.3912345", "0").replace("\"building_number\": \"12\"", "\"building_number\": \"[deleted]\"")
            .replace("9876543210", AccountErasureService.ERASED_PHONE).replace("Real Person", AccountErasureService.ERASED_NAME)
            .replace("\"recipient_position\": \"Neighbour\"", "\"recipient_position\": \"[deleted]\"")
            .replace("\"https://borzo.example/real-sign.jpg\"", "\"[deleted]\"");
    }

    private static void assertErased(String table, String column, UUID id, String before) {
        String after = column(table, column, id);
        assertClean(after);
        assertEquals(erased(before), after, table + "." + column + ": only the person's fields change; amounts and ids stay");
    }

    private static String tripWithoutPersonalColumns(UUID id) {
        return jdbc.queryForObject("SELECT (to_jsonb(t) - 'customer_first_name' - 'customer_phone' - 'drop_address' - 'drop_landmark' - 'drop_lat' - 'drop_lng')::text FROM fleet_schema.trip t WHERE id=?", String.class, id);
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
    void eraseScrubsPaymentAttemptAndEventPayloadsWhateverTheOrderStatus() {
        Scene mine = scene(customer);
        Scene other = scene(UUID.randomUUID());
        Map<String, String> before = new java.util.HashMap<>();
        // A payment order has no expiry, so an abandoned one (still PAYMENT_PENDING) is scrubbed like a paid one.
        for (UUID id : List.of(mine.attemptPaid, mine.attemptRazor, mine.attemptPending)) {
            before.put(id.toString(), column("payment_schema.payment_attempt", "raw_payload", id));
        }
        for (UUID id : List.of(mine.eventPaid, mine.eventRazor, mine.eventPending)) {
            before.put(id.toString(), column("payment_schema.payment_event", "raw_payload", id));
        }
        String otherAttemptBefore = row("payment_schema.payment_attempt", other.attemptPaid);
        String otherEventBefore = row("payment_schema.payment_event", other.eventPaid);
        String attemptMoneyBefore = jdbc.queryForObject("SELECT concat_ws('|',cf_payment_id,payment_status,payment_amount,payment_currency,provider,payment_order_id)"
            + " FROM payment_schema.payment_attempt WHERE id=?", String.class, mine.attemptPaid);

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals(3, response.counts().get("payment_attempt"));
        assertEquals(3, response.counts().get("payment_event"));
        for (UUID id : List.of(mine.attemptPaid, mine.attemptRazor, mine.attemptPending)) {
            assertErased("payment_schema.payment_attempt", "raw_payload", id, before.get(id.toString()));
        }
        for (UUID id : List.of(mine.eventPaid, mine.eventRazor, mine.eventPending)) {
            assertErased("payment_schema.payment_event", "raw_payload", id, before.get(id.toString()));
        }
        assertEquals(attemptMoneyBefore, jdbc.queryForObject("SELECT concat_ws('|',cf_payment_id,payment_status,payment_amount,payment_currency,provider,payment_order_id)"
            + " FROM payment_schema.payment_attempt WHERE id=?", String.class, mine.attemptPaid));
        assertEquals(AccountErasureService.ERASED_UPI_ID, jdbc.queryForObject(
            "SELECT raw_payload->'data'->'payment'->'payment_method'->'upi'->>'upi_id' FROM payment_schema.payment_attempt WHERE id=?", String.class, mine.attemptPaid));
        assertEquals(AccountErasureService.ERASED_UPI_ID, jdbc.queryForObject(
            "SELECT raw_payload->'payload'->'payment'->'entity'->>'vpa' FROM payment_schema.payment_event WHERE id=?", String.class, mine.eventRazor));
        assertEquals("1234", jdbc.queryForObject(
            "SELECT raw_payload->'payload'->'payment'->'entity'->'card'->>'last4' FROM payment_schema.payment_event WHERE id=?", String.class, mine.eventRazor), "masked card digits stay");
        assertEquals(otherAttemptBefore, row("payment_schema.payment_attempt", other.attemptPaid));
        assertEquals(otherEventBefore, row("payment_schema.payment_event", other.eventPaid));
        ErasureResponse second = erase(customer, Scope.CUSTOMER);
        assertAllZero(second);
    }

    @Test
    void eraseScrubsProcessedWebhookRowsOnly() {
        Scene mine = scene(customer);
        Scene other = scene(UUID.randomUUID());
        Map<UUID, String> before = new java.util.HashMap<>();
        // Processed rows go whatever the payment order's status: an abandoned order never finishes.
        List<UUID> inboxToScrub = new ArrayList<>(mine.inboxFinished);
        inboxToScrub.add(mine.inboxRazor);
        inboxToScrub.add(mine.inboxPending);
        inboxToScrub.forEach(id -> before.put(id, column("payment_schema.webhook_inbox", "raw_payload", id)));
        List<UUID> deliveryToScrub = new ArrayList<>(mine.deliveryFinished);
        deliveryToScrub.add(mine.deliveryPending);
        deliveryToScrub.forEach(id -> before.put(id, column("payment_schema.cashfree_webhook_delivery", "raw_payload", id)));
        Map<UUID, String> untouched = new java.util.HashMap<>();
        mine.inFlightInbox().forEach(id -> untouched.put(id, row("payment_schema.webhook_inbox", id)));
        mine.deliveryInFlight.forEach(id -> untouched.put(id, row("payment_schema.cashfree_webhook_delivery", id)));
        other.inboxFinished.forEach(id -> untouched.put(id, row("payment_schema.webhook_inbox", id)));
        other.deliveryFinished.forEach(id -> untouched.put(id, row("payment_schema.cashfree_webhook_delivery", id)));
        String statusBefore = jdbc.queryForObject("SELECT string_agg(concat_ws('|',id,provider,event_identity,processing_status),',' ORDER BY id) FROM payment_schema.webhook_inbox",
            String.class);

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals(6, response.counts().get("webhook_inbox"), "four processed statuses, the Razorpay row and the pending order's row");
        assertEquals(3, response.counts().get("cashfree_webhook_delivery"), "COMPLETED and DEAD_LETTER, and the pending order's COMPLETED row");
        inboxToScrub.forEach(id -> assertErased("payment_schema.webhook_inbox", "raw_payload", id, before.get(id)));
        deliveryToScrub.forEach(id -> assertErased("payment_schema.cashfree_webhook_delivery", "raw_payload", id, before.get(id)));
        // RECEIVED, PROCESSING and FAILED are still being handled (FAILED is retried).
        mine.inFlightInbox().forEach(id -> assertEquals(untouched.get(id), row("payment_schema.webhook_inbox", id)));
        mine.deliveryInFlight.forEach(id -> assertEquals(untouched.get(id), row("payment_schema.cashfree_webhook_delivery", id)));
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
            assertEquals(AccountErasureService.ERASED_TEXT, jdbc.queryForObject("SELECT drop_address FROM fleet_schema.trip WHERE id=?", String.class, id));
            assertEquals(0.0, jdbc.queryForObject("SELECT drop_lat FROM fleet_schema.trip WHERE id=?", Double.class, id));
            assertEquals(0.0, jdbc.queryForObject("SELECT drop_lng FROM fleet_schema.trip WHERE id=?", Double.class, id));
            assertEquals(otherColumns.get(id), tripWithoutPersonalColumns(id), "state, rider, kitchen, chef phone, drop area and ids stay");
        }
        assertEquals(AccountErasureService.ERASED_TEXT, jdbc.queryForObject("SELECT drop_landmark FROM fleet_schema.trip WHERE id=?", String.class, mine.tripsFinished.get(0)));
        assertNull(jdbc.queryForObject("SELECT drop_landmark FROM fleet_schema.trip WHERE id=?", String.class, mine.tripsFinished.get(1)), "no landmark stays no landmark");
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

    @Test
    void eraseScrubsTheDropOffInDeliveryRecordsOfFinishedDeliveriesOnly() {
        Scene mine = scene(customer);
        Scene other = scene(UUID.randomUUID());
        Map<String, String> before = new java.util.LinkedHashMap<>();
        before.put("delivery_command/" + mine.command, column("delivery_schema.delivery_command", "payload", mine.command));
        before.put("delivery_command/" + mine.commandFleet, column("delivery_schema.delivery_command", "payload", mine.commandFleet));
        before.put("delivery_assignment/" + mine.assignment, column("delivery_schema.delivery_assignment", "request_context", mine.assignment));
        before.put("delivery_assignment_candidate/" + mine.candidate, column("delivery_schema.delivery_assignment_candidate", "provider_metadata", mine.candidate));
        before.put("delivery_job/" + mine.job, column("delivery_schema.delivery_job", "quote_snapshot", mine.job));
        before.put("delivery_event/" + mine.deliveryEvt, column("delivery_schema.delivery_event", "payload", mine.deliveryEvt));
        before.put("delivery_webhook_inbox/" + mine.deliveryInboxProcessed, column("delivery_schema.delivery_webhook_inbox", "raw_payload", mine.deliveryInboxProcessed));
        before.put("delivery_webhook_inbox/" + mine.deliveryInboxDead, column("delivery_schema.delivery_webhook_inbox", "raw_payload", mine.deliveryInboxDead));
        Map<String, String> untouched = new java.util.LinkedHashMap<>();
        untouched.put("delivery_command/" + mine.commandActive, row("delivery_schema.delivery_command", mine.commandActive));
        untouched.put("delivery_command/" + mine.commandNotStarted, row("delivery_schema.delivery_command", mine.commandNotStarted));
        untouched.put("delivery_assignment/" + mine.assignmentActive, row("delivery_schema.delivery_assignment", mine.assignmentActive));
        untouched.put("delivery_assignment_candidate/" + mine.candidateActive, row("delivery_schema.delivery_assignment_candidate", mine.candidateActive));
        untouched.put("delivery_job/" + mine.jobActive, row("delivery_schema.delivery_job", mine.jobActive));
        untouched.put("delivery_event/" + mine.deliveryEvtActive, row("delivery_schema.delivery_event", mine.deliveryEvtActive));
        untouched.put("delivery_webhook_inbox/" + mine.deliveryInboxActive, row("delivery_schema.delivery_webhook_inbox", mine.deliveryInboxActive));
        untouched.put("delivery_webhook_inbox/" + mine.deliveryInboxReceived, row("delivery_schema.delivery_webhook_inbox", mine.deliveryInboxReceived));
        untouched.put("delivery_webhook_inbox/" + mine.deliveryInboxFailed, row("delivery_schema.delivery_webhook_inbox", mine.deliveryInboxFailed));
        for (Scene o : List.of(other)) {
            untouched.put("delivery_command/" + o.command, row("delivery_schema.delivery_command", o.command));
            untouched.put("delivery_assignment/" + o.assignment, row("delivery_schema.delivery_assignment", o.assignment));
            untouched.put("delivery_assignment_candidate/" + o.candidate, row("delivery_schema.delivery_assignment_candidate", o.candidate));
            untouched.put("delivery_job/" + o.job, row("delivery_schema.delivery_job", o.job));
            untouched.put("delivery_event/" + o.deliveryEvt, row("delivery_schema.delivery_event", o.deliveryEvt));
            untouched.put("delivery_webhook_inbox/" + o.deliveryInboxProcessed, row("delivery_schema.delivery_webhook_inbox", o.deliveryInboxProcessed));
        }
        Map<String, String> othersBefore = new java.util.LinkedHashMap<>();
        othersBefore.put("job", jdbc.queryForObject("SELECT concat_ws('|',id,chef_sub_order_id,order_id,provider_id,provider_delivery_id,status) FROM delivery_schema.delivery_job WHERE id=?", String.class, mine.job));
        othersBefore.put("command", jdbc.queryForObject("SELECT concat_ws('|',id,chef_sub_order_id,order_id,command_type,status,idempotency_key) FROM delivery_schema.delivery_command WHERE id=?", String.class, mine.command));
        othersBefore.put("inbox", jdbc.queryForObject("SELECT concat_ws('|',id,provider_id,provider_event_id,processing_status,delivery_job_id) FROM delivery_schema.delivery_webhook_inbox WHERE id=?", String.class, mine.deliveryInboxProcessed));

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals(2, response.counts().get("delivery_command"), "the Borzo order's and the one the fleet delivered");
        assertEquals(1, response.counts().get("delivery_assignment"));
        assertEquals(1, response.counts().get("delivery_assignment_candidate"));
        assertEquals(1, response.counts().get("delivery_job"));
        assertEquals(1, response.counts().get("delivery_event"));
        assertEquals(2, response.counts().get("delivery_webhook_inbox"), "PROCESSED and DEAD_LETTER; RECEIVED and FAILED are still being handled");
        before.forEach((key, text) -> {
            String[] parts = key.split("/");
            String table = "delivery_schema." + parts[0];
            String column = switch (parts[0]) {
                case "delivery_command", "delivery_event" -> "payload";
                case "delivery_assignment" -> "request_context";
                case "delivery_assignment_candidate" -> "provider_metadata";
                case "delivery_job" -> "quote_snapshot";
                default -> "raw_payload";
            };
            String after = column(table, column, UUID.fromString(parts[1]));
            assertClean(after);
            assertFalse(after.contains("12 Real Street") || after.contains("Gate code") || after.contains("Real Temple") || after.contains("17.4412345")
                || after.contains("78.3912345") || after.contains("500081"), key + ": " + after);
            assertEquals(erasedDrop(text), after, key + ": only the drop-off changes; the kitchen, the rider, amounts and ids stay");
        });
        untouched.forEach((key, text) -> {
            String[] parts = key.split("/");
            assertEquals(text, row("delivery_schema." + parts[0], UUID.fromString(parts[1])), key + " is still being handled or is someone else's");
        });
        assertEquals(othersBefore.get("job"), jdbc.queryForObject("SELECT concat_ws('|',id,chef_sub_order_id,order_id,provider_id,provider_delivery_id,status) FROM delivery_schema.delivery_job WHERE id=?", String.class, mine.job));
        assertEquals(othersBefore.get("command"), jdbc.queryForObject("SELECT concat_ws('|',id,chef_sub_order_id,order_id,command_type,status,idempotency_key) FROM delivery_schema.delivery_command WHERE id=?", String.class, mine.command));
        assertEquals(othersBefore.get("inbox"), jdbc.queryForObject("SELECT concat_ws('|',id,provider_id,provider_event_id,processing_status,delivery_job_id) FROM delivery_schema.delivery_webhook_inbox WHERE id=?", String.class, mine.deliveryInboxProcessed));
        // The Borzo courier and the kitchen are not the customer's.
        assertEquals("7777777777", jdbc.queryForObject("SELECT payload->'order'->'courier'->>'phone' FROM delivery_schema.delivery_event WHERE id=?", String.class, mine.deliveryEvt));
        assertEquals("8888888888", jdbc.queryForObject("SELECT payload->'deliveryRequest'->'pickup'->>'contactPhone' FROM delivery_schema.delivery_command WHERE id=?", String.class, mine.command));
        assertAllZero(erase(customer, Scope.CUSTOMER));
    }

    @Test
    void eraseScrubsTripEventNotesOfFinishedTripsOnly() {
        Scene mine = scene(customer);
        String activeBefore = row("fleet_schema.trip_event", mine.tripEventActive);
        String before = column("fleet_schema.trip_event", "detail", mine.tripEventFinished);

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals(1, response.counts().get("fleet_trip_event"));
        String after = column("fleet_schema.trip_event", "detail", mine.tripEventFinished);
        assertClean(after);
        assertFalse(after.contains("12 Real Street") || after.contains("Real Person"), after);
        assertEquals("CUSTOMER_UNREACHABLE", jdbc.queryForObject("SELECT detail->>'reason' FROM fleet_schema.trip_event WHERE id=?", String.class, mine.tripEventFinished));
        assertEquals("3", jdbc.queryForObject("SELECT detail->>'callsMade' FROM fleet_schema.trip_event WHERE id=?", String.class, mine.tripEventFinished));
        assertEquals(AccountErasureService.ERASED_TEXT, jdbc.queryForObject("SELECT detail->>'note' FROM fleet_schema.trip_event WHERE id=?", String.class, mine.tripEventFinished));
        assertEquals(activeBefore, row("fleet_schema.trip_event", mine.tripEventActive), "the trip is still on the road");
        assertFalse(before.equals(after));
        assertAllZero(erase(customer, Scope.CUSTOMER));
    }

    @Test
    void aTripHandedBackToACourierBlocksForAWeekAndIsThenScrubbedAsFinished() {
        UUID checkout = UUID.randomUUID();
        UUID chefSubOrder = UUID.randomUUID();
        payment(customer, checkout, "PAID", "{}", null);
        // The rider gave the order back: the trip is CANCELLED (not replaced) and a Borzo stage is open to book a courier.
        UUID trip = trip(checkout, "CANCELLED", chefSubOrder, "Near Real Temple");
        tripEvent(trip, "{\"reason\":\"CUSTOMER_UNREACHABLE\",\"note\":\"Real Person was not at 12 Real Street, called 9876543210\"}");
        UUID event = jdbc.queryForObject("SELECT id FROM fleet_schema.trip_event WHERE trip_id=?", UUID.class, trip);
        UUID stage = stage(trip, "BORZO", "OPEN");
        // The courier also gave up: the job is CANCELLED and the order goes to the ops queue.
        UUID job = job(checkout, chefSubOrder, "CANCELLED", "{\"delivery\":{\"providerMetadata\":" + BORZO_ORDER.formatted(1250034) + "}}");
        UUID command = command(checkout, chefSubOrder, "COMPLETED");
        UUID event2 = deliveryEvent(job, BORZO_ORDER.formatted(1250034));
        String tripBefore = row("fleet_schema.trip", trip);
        String tripEventBefore = row("fleet_schema.trip_event", event);
        String commandBefore = row("delivery_schema.delivery_command", command);
        String jobBefore = row("delivery_schema.delivery_job", job);
        String eventBefore = row("delivery_schema.delivery_event", event2);

        // The order is still being booked: the customer side waits (the coordinator asks again the next day).
        for (Scope scope : List.of(Scope.CUSTOMER, Scope.ALL)) {
            assertEquals(Set.of("DELIVERY_IN_PROGRESS"), codes(service.blockers(customer, scope)), scope.name());
            assertEquals("BLOCKED", erase(customer, scope).status(), scope.name());
        }
        assertTrue(service.blockers(customer, Scope.CHEF).isEmpty(), "a customer's delivery is not a chef matter");
        assertEquals(tripBefore, row("fleet_schema.trip", trip), "the order is still being booked");
        assertEquals(tripEventBefore, row("fleet_schema.trip_event", event));
        assertEquals(commandBefore, row("delivery_schema.delivery_command", command));
        assertEquals(jobBefore, row("delivery_schema.delivery_job", job));
        assertEquals(eventBefore, row("delivery_schema.delivery_event", event2));

        // A stage left open for a week is abandoned: it no longer blocks and the delivery counts as finished.
        seed("UPDATE fleet_schema.trip_stage SET opened_at = now() - interval '7 days 1 minute', deadline_at = now() - interval '7 days' WHERE id = ?", stage);
        assertTrue(service.blockers(customer, Scope.ALL).isEmpty());
        ErasureResponse stale = erase(customer, Scope.CUSTOMER);

        assertEquals(1, stale.counts().get("fleet_trip"));
        assertEquals(1, stale.counts().get("fleet_trip_event"));
        assertEquals(1, stale.counts().get("delivery_command"));
        assertEquals(1, stale.counts().get("delivery_job"));
        assertEquals(1, stale.counts().get("delivery_event"));
        assertEquals(AccountErasureService.ERASED_TEXT, jdbc.queryForObject("SELECT drop_address FROM fleet_schema.trip WHERE id=?", String.class, trip));
        assertEquals("OPEN", jdbc.queryForObject("SELECT state FROM fleet_schema.trip_stage WHERE id=?", String.class, stage), "the stage itself is not touched");
        assertAllZero(erase(customer, Scope.CUSTOMER));
    }

    @Test
    void aClosedStageIsFinished() {
        UUID checkout = UUID.randomUUID();
        payment(customer, checkout, "PAID", "{}", null);
        UUID trip = trip(checkout, "CANCELLED", UUID.randomUUID(), "Near Real Temple");
        UUID stage = stage(trip, "BORZO", "OPEN");
        closeStage(stage);

        assertTrue(service.blockers(customer, Scope.ALL).isEmpty());
        assertEquals(1, erase(customer, Scope.CUSTOMER).counts().get("fleet_trip"));
    }

    // ---- the chef's own contact on the trips their kitchen sent out --------------------------------------------

    private static String tripWithoutKitchenColumns(UUID id) {
        return jdbc.queryForObject("SELECT (to_jsonb(t) - 'chef_phone' - 'kitchen_address' - 'kitchen_landmark' - 'kitchen_lat' - 'kitchen_lng')::text "
            + "FROM fleet_schema.trip t WHERE id=?", String.class, id);
    }

    @Test
    void eraseChefClearsTheKitchenContactOnTheChefsFinishedTripsOnly() {
        UUID delivered = trip(UUID.randomUUID(), "DELIVERED", UUID.randomUUID(), "Near Real Temple", chef);
        UUID noLandmark = trip(UUID.randomUUID(), "FAILED", UUID.randomUUID(), null, chef);
        UUID onTheRoad = trip(UUID.randomUUID(), "PICKED_UP", UUID.randomUUID(), "Near Real Temple", chef);
        UUID othersKitchen = trip(UUID.randomUUID(), "DELIVERED", UUID.randomUUID(), "Near Real Temple", UUID.randomUUID());
        // The chef also ordered as a customer: that trip's kitchen is somebody else's.
        UUID ownCheckout = UUID.randomUUID();
        payment(chef, ownCheckout, "PAID", "{}", null);
        UUID ownOrder = trip(ownCheckout, "DELIVERED", UUID.randomUUID(), "Near Real Temple");
        Map<UUID, String> restBefore = Map.of(delivered, tripWithoutKitchenColumns(delivered), noLandmark, tripWithoutKitchenColumns(noLandmark));
        Map<UUID, String> untouched = Map.of(onTheRoad, row("fleet_schema.trip", onTheRoad), othersKitchen, row("fleet_schema.trip", othersKitchen),
            ownOrder, row("fleet_schema.trip", ownOrder));

        ErasureResponse response = erase(chef, Scope.CHEF);

        assertEquals(Map.of(KITCHEN_KEY, 2), response.counts());
        for (UUID id : List.of(delivered, noLandmark)) {
            Map<String, Object> kitchen = jdbc.queryForMap("SELECT chef_phone, kitchen_address, kitchen_landmark, kitchen_lat, kitchen_lng, kitchen_name "
                + "FROM fleet_schema.trip WHERE id=?", id);
            assertEquals(AccountErasureService.ERASED_PHONE, kitchen.get("chef_phone"));
            assertEquals(AccountErasureService.ERASED_TEXT, kitchen.get("kitchen_address"));
            assertEquals(0.0, kitchen.get("kitchen_lat"));
            assertEquals(0.0, kitchen.get("kitchen_lng"));
            assertEquals("Kitchen", kitchen.get("kitchen_name"), "the kitchen name stays");
            // The customer's columns, the rider, state, version and ids are exactly as they were.
            assertEquals(restBefore.get(id), tripWithoutKitchenColumns(id));
        }
        assertEquals(AccountErasureService.ERASED_TEXT, jdbc.queryForObject("SELECT kitchen_landmark FROM fleet_schema.trip WHERE id=?", String.class, delivered));
        assertNull(jdbc.queryForObject("SELECT kitchen_landmark FROM fleet_schema.trip WHERE id=?", String.class, noLandmark), "no landmark stays no landmark");
        untouched.forEach((id, before) -> assertEquals(before, row("fleet_schema.trip", id), "on the road, another kitchen's, or the chef's own order"));

        String afterFirst = snapshot("fleet_schema.trip");
        assertEquals(Map.of(KITCHEN_KEY, 0), erase(chef, Scope.CHEF).counts());
        ErasureResponse all = erase(chef, Scope.ALL);
        assertEquals(0, all.counts().get(KITCHEN_KEY));
        assertEquals(1, all.counts().get("fleet_trip"), "ALL also clears the chef's own order as a customer");
        assertEquals(untouched.get(onTheRoad), row("fleet_schema.trip", onTheRoad));
        assertEquals(untouched.get(othersKitchen), row("fleet_schema.trip", othersKitchen));
        assertEquals("8888888888", jdbc.queryForObject("SELECT chef_phone FROM fleet_schema.trip WHERE id=?", String.class, ownOrder),
            "the other kitchen's phone on the chef's own order stays");
        assertFalse(afterFirst.equals(snapshot("fleet_schema.trip")), "only the customer side changed on ALL");
    }

    @Test
    void aBorzoDeliveryIdThatEqualsAJobsOrderIdDoesNotReachAnotherCustomersWebhookRow() {
        Scene mine = scene(customer);
        String jobsBorzoOrderId = jdbc.queryForObject("SELECT provider_delivery_id FROM delivery_schema.delivery_job WHERE id=?", String.class, mine.job);
        // Someone else's finished webhook row, not tied to any job of mine, whose Borzo DELIVERY id happens to be the string my job
        // keeps as its Borzo ORDER id. The two are different id spaces; only the order id may be compared.
        UUID others = deliveryInboxWithIds("PROCESSED", BORZO_ORDER.formatted(777), "777", jobsBorzoOrderId);
        // A row of mine that never got a job id, but names my job's Borzo order id as its order id: that one is mine.
        UUID unmatched = deliveryInboxWithIds("PROCESSED", BORZO_ORDER.formatted(1250032), jobsBorzoOrderId, "11712");
        String othersBefore = row("delivery_schema.delivery_webhook_inbox", others);
        String unmatchedBefore = column("delivery_schema.delivery_webhook_inbox", "raw_payload", unmatched);

        ErasureResponse response = erase(customer, Scope.CUSTOMER);

        assertEquals(3, response.counts().get("delivery_webhook_inbox"), "PROCESSED and DEAD_LETTER of the job, and the row matched by order id");
        assertEquals(othersBefore, row("delivery_schema.delivery_webhook_inbox", others), "another customer's row stays");
        assertEquals(erasedDrop(unmatchedBefore), column("delivery_schema.delivery_webhook_inbox", "raw_payload", unmatched));
        assertAllZero(erase(customer, Scope.CUSTOMER));
    }
}
