package in.craves.advanced.trust;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.support.IntegrationTestBase;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

class TrustIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/trust";
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;
    UUID kitchen;
    UUID aliceId;
    MenuItem biryani;
    String chef;
    String otherChef;
    String alice;
    String bob;
    String support;
    String payments;
    String compliance;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM adv_trust.report");
        jdbc.update("DELETE FROM adv_trust.dispute");
        jdbc.update("DELETE FROM adv_trust.dispute_policy");
        jdbc.update("DELETE FROM adv_trust.risk_flag");
        jdbc.update("DELETE FROM adv_platform.audit_event WHERE module = 'trust'");
        kitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Chicken dum biryani", 32000);
        chef = bearer(UUID.randomUUID(), "CUSTOMER", "CHEF");
        CATALOG.chefKitchens.put(chef.substring("Bearer ".length()), kitchen);
        otherChef = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(otherChef.substring("Bearer ".length()), UUID.randomUUID());
        aliceId = UUID.randomUUID();
        alice = bearer(aliceId, "CUSTOMER");
        bob = bearer(UUID.randomUUID(), "CUSTOMER");
        support = bearer(UUID.randomUUID(), "SUPPORT_ADMIN");
        payments = bearer(UUID.randomUUID(), "PAYMENTS_ADMIN");
        compliance = bearer(UUID.randomUUID(), "COMPLIANCE_ADMIN");
    }

    ResultActions send(MockHttpServletRequestBuilder request, String auth, Object body) throws Exception {
        return mvc.perform(request.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(body instanceof String text ? text : json.writeValueAsString(body)));
    }

    JsonNode read(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    Map<String, Object> report(String type, UUID target, String reason) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("targetType", type);
        body.put("targetId", target);
        body.put("reason", reason);
        body.put("details", "The dish was labelled Jain but had onion");
        return body;
    }

    Map<String, Object> dispute(UUID orderId, String category, Long claimed) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("orderId", orderId);
        body.put("category", category);
        body.put("description", "The raita was missing");
        body.put("claimedPaise", claimed);
        return body;
    }

    Map<String, Object> decision(String outcome, Long refund, long version) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("outcome", outcome);
        body.put("refundPaise", refund);
        body.put("note", "Checked with the kitchen");
        body.put("expectedVersion", version);
        return body;
    }

    void policy(int hours) throws Exception {
        send(put(BASE + "/admin/disputes/policy"), payments, Map.of("windowHours", hours)).andExpect(status().isOk());
    }

    @Test
    void reportsGoToTheModerationQueueAndStaffDecide() throws Exception {
        Map<String, Object> wrongLabel = report("DISH", biryani.id(), "WRONG_LABEL");
        String id = read(mvc.perform(post(BASE + "/reports").header("Authorization", alice).header("Idempotency-Key", "alice-report-01")
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(wrongLabel)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("OPEN"))).get("id").asText();
        mvc.perform(post(BASE + "/reports").header("Authorization", alice).header("Idempotency-Key", "alice-report-01")
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(wrongLabel)))
                .andExpect(header().string("Idempotent-Replayed", "true")).andExpect(jsonPath("$.id").value(id));
        send(post(BASE + "/reports"), alice, wrongLabel).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REPORT_EXISTS"));
        CLOCK.advance(Duration.ofSeconds(1));
        send(post(BASE + "/reports"), bob, wrongLabel).andExpect(status().isCreated());
        Map<String, Object> blank = report("KITCHEN", kitchen, "HYGIENE");
        blank.put("details", " ");
        send(post(BASE + "/reports"), bob, blank).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BLANK_TEXT"));
        mvc.perform(post(BASE + "/reports").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(wrongLabel)))
                .andExpect(status().isUnauthorized());

        mvc.perform(get(BASE + "/admin/reports").header("Authorization", alice)).andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/admin/reports").header("Authorization", bearer(UUID.randomUUID(), "AUDIT_ADMIN"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].id").value(id)).andExpect(jsonPath("$[0].reporterId").value(aliceId.toString()));
        mvc.perform(get(BASE + "/admin/reports/targets/DISH/" + biryani.id()).header("Authorization", support)).andExpect(jsonPath("$.length()").value(2));
        send(post(BASE + "/admin/reports/" + id + "/decide"), payments, Map.of("outcome", "UPHELD", "note", "Label corrected")).andExpect(status().isForbidden());
        send(post(BASE + "/admin/reports/" + id + "/decide"), support, Map.of("outcome", "UPHELD", "note", "x")).andExpect(status().isForbidden());
        send(post(BASE + "/admin/reports/" + id + "/decide"), compliance, Map.of("outcome", "OPEN", "note", "x")).andExpect(status().isBadRequest());
        send(post(BASE + "/admin/reports/" + id + "/decide"), compliance, Map.of("outcome", "UPHELD", "note", "Label corrected")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UPHELD")).andExpect(jsonPath("$.decisionNote").value("Label corrected"));
        send(post(BASE + "/admin/reports/" + id + "/decide"), compliance, Map.of("outcome", "DISMISSED", "note", "x")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REPORT_DECIDED"));
        mvc.perform(get(BASE + "/reports/mine").header("Authorization", alice)).andExpect(jsonPath("$[0].status").value("UPHELD"))
                .andExpect(jsonPath("$[0].decisionNote").doesNotExist());
        // Once decided, the same person may report the same dish again.
        send(post(BASE + "/reports"), alice, wrongLabel).andExpect(status().isCreated());

        jdbc.update("INSERT INTO adv_trust.report (id, reporter_id, target_type, target_id, reason, details, status, created_at, updated_at) "
                + "SELECT gen_random_uuid(), ?, 'KITCHEN', gen_random_uuid(), 'SPAM', 'x', 'DISMISSED', now(), now() FROM generate_series(1, 18)", aliceId);
        send(post(BASE + "/reports"), alice, report("KITCHEN", kitchen, "HYGIENE")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TOO_MANY_REPORTS"));
    }

    @Test
    void customersDisputeTheirOrdersAndStaffDecideWithBothSides() throws Exception {
        Order order = ORDERS.place(aliceId, kitchen, "DELIVERED", biryani, 2);
        send(post(BASE + "/disputes"), alice, dispute(order.id(), "MISSING_ITEMS", null)).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("DISPUTES_NOT_CONFIGURED"));
        mvc.perform(get(BASE + "/disputes/policy")).andExpect(status().isNotFound());
        send(put(BASE + "/admin/disputes/policy"), support, Map.of("windowHours", 48)).andExpect(status().isForbidden());
        send(put(BASE + "/admin/disputes/policy"), payments, Map.of("windowHours", 0)).andExpect(status().isBadRequest());
        policy(48);
        mvc.perform(get(BASE + "/disputes/policy")).andExpect(status().isOk()).andExpect(jsonPath("$.windowHours").value(48));

        send(post(BASE + "/disputes"), bob, dispute(order.id(), "MISSING_ITEMS", null)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_FOUND"));
        send(post(BASE + "/disputes"), alice, dispute(order.id(), "MISSING_ITEMS", 64_001L)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("CLAIM_ABOVE_REFUNDABLE"));
        Order cooking = ORDERS.place(aliceId, kitchen, "CHEF_ACCEPTED", biryani, 1);
        send(post(BASE + "/disputes"), alice, dispute(cooking.id(), "LATE", null)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_DISPUTABLE"));
        String id = read(send(post(BASE + "/disputes"), alice, dispute(order.id(), "MISSING_ITEMS", 8_000L)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("OPEN")).andExpect(jsonPath("$.orderValuePaise").value(64_000))
                .andExpect(jsonPath("$.refundablePaise").value(64_000)).andExpect(jsonPath("$.claimedPaise").value(8_000))).get("id").asText();
        send(post(BASE + "/disputes"), alice, dispute(order.id(), "QUALITY", null)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DISPUTE_EXISTS"));

        // The chef sees the dispute without who opened it and adds their side; another kitchen cannot.
        mvc.perform(get(BASE + "/chef/disputes").header("Authorization", chef)).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].customerId").doesNotExist());
        mvc.perform(get(BASE + "/chef/disputes").header("Authorization", otherChef)).andExpect(jsonPath("$.length()").value(0));
        send(post(BASE + "/chef/disputes/" + id + "/statement"), otherChef, Map.of("statement", "Not ours")).andExpect(status().isNotFound());
        send(post(BASE + "/chef/disputes/" + id + "/statement"), alice, Map.of("statement", "x")).andExpect(status().isForbidden());
        send(post(BASE + "/chef/disputes/" + id + "/statement"), chef, Map.of("statement", "The raita was packed separately"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.chefStatement").value("The raita was packed separately")).andExpect(jsonPath("$.version").value(2));

        mvc.perform(get(BASE + "/admin/disputes").header("Authorization", support)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].dispute.id").value(id)).andExpect(jsonPath("$[0].customerId").value(aliceId.toString()));
        send(post(BASE + "/admin/disputes/" + id + "/decide"), bearer(UUID.randomUUID(), "COMPLIANCE_ADMIN"), decision("RESOLVED", 4_000L, 2))
                .andExpect(status().isForbidden());
        send(post(BASE + "/admin/disputes/" + id + "/decide"), support, decision("RESOLVED", 4_000L, 2)).andExpect(status().isForbidden());
        send(post(BASE + "/admin/disputes/" + id + "/decide"), payments, decision("RESOLVED", 4_000L, 1)).andExpect(status().isPreconditionFailed());
        send(post(BASE + "/admin/disputes/" + id + "/decide"), payments, decision("RESOLVED", 64_001L, 2)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("REFUND_ABOVE_REFUNDABLE"));
        send(post(BASE + "/admin/disputes/" + id + "/decide"), payments, decision("REJECTED", 100L, 2)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("REFUND_ONLY_WHEN_RESOLVED"));
        send(post(BASE + "/admin/disputes/" + id + "/decide"), payments, decision("RESOLVED", 4_000L, 2)).andExpect(status().isOk())
                .andExpect(jsonPath("$.dispute.status").value("RESOLVED")).andExpect(jsonPath("$.dispute.refundPaise").value(4_000));
        send(post(BASE + "/admin/disputes/" + id + "/decide"), payments, decision("REJECTED", null, 3)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DISPUTE_DECIDED"));
        mvc.perform(get(BASE + "/chef/disputes").header("Authorization", chef)).andExpect(jsonPath("$[0].status").value("RESOLVED"))
                .andExpect(jsonPath("$[0].decisionNote").value("Checked with the kitchen"));
        send(post(BASE + "/chef/disputes/" + id + "/statement"), chef, Map.of("statement", "late")).andExpect(status().isConflict());
        send(post(BASE + "/disputes/" + id + "/withdraw"), alice, "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DISPUTE_DECIDED"));
        mvc.perform(get(BASE + "/disputes/mine").header("Authorization", alice)).andExpect(jsonPath("$[0].decisionNote").value("Checked with the kitchen"));
        assertThat(jdbc.queryForList("SELECT action FROM adv_platform.audit_event WHERE module = 'trust' ORDER BY id", String.class))
                .containsExactly("DISPUTE_POLICY_SET", "DISPUTE_OPENED", "DISPUTE_RESOLVED");
    }

    @Test
    void disputesCloseWithTheWindowAndCanBeWithdrawnAndOpenedAgain() throws Exception {
        policy(24);
        Order order = ORDERS.place(aliceId, kitchen, "REFUND_FAILED", biryani, 1);
        String first = read(send(post(BASE + "/disputes"), alice, dispute(order.id(), "REFUND_ISSUE", null)).andExpect(status().isCreated())).get("id").asText();
        send(post(BASE + "/disputes/" + first + "/withdraw"), bob, "{}").andExpect(status().isNotFound());
        send(post(BASE + "/disputes/" + first + "/withdraw"), alice, "{}").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("WITHDRAWN"));
        send(post(BASE + "/disputes/" + first + "/withdraw"), alice, "{}").andExpect(status().isOk());
        String second = read(send(post(BASE + "/disputes"), alice, dispute(order.id(), "REFUND_ISSUE", null)).andExpect(status().isCreated())).get("id").asText();
        send(post(BASE + "/disputes/" + second + "/withdraw"), alice, "{}").andExpect(status().isOk());
        String third = read(send(post(BASE + "/disputes"), alice, dispute(order.id(), "REFUND_ISSUE", null)).andExpect(status().isCreated())).get("id").asText();
        mvc.perform(get(BASE + "/admin/disputes").param("status", "WITHDRAWN").header("Authorization", support)).andExpect(jsonPath("$.length()").value(2));
        send(post(BASE + "/disputes/" + third + "/withdraw"), alice, "{}").andExpect(status().isOk());
        send(post(BASE + "/disputes"), alice, dispute(order.id(), "REFUND_ISSUE", null)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TOO_MANY_DISPUTES"));
        mvc.perform(get(BASE + "/admin/disputes").param("status", "SIDEWAYS").header("Authorization", support)).andExpect(status().isBadRequest());

        Order later = ORDERS.place(aliceId, kitchen, "DELIVERED", biryani, 1);
        CLOCK.advance(Duration.ofHours(25));
        String fresh = bearer(aliceId, "CUSTOMER");
        send(post(BASE + "/disputes"), fresh, dispute(later.id(), "QUALITY", null)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DISPUTE_WINDOW_OVER")).andExpect(jsonPath("$.details[0]").value("windowHours: 24"));
        // A scheduled order checked out long ago but finished just now still has its window.
        ORDERS.status(later.id(), "DELIVERED");
        send(post(BASE + "/disputes"), fresh, dispute(later.id(), "QUALITY", null)).andExpect(status().isCreated());
        ORDERS.down = true;
        send(post(BASE + "/disputes"), fresh, dispute(later.id(), "QUALITY", null)).andExpect(status().isServiceUnavailable());
    }

    @Test
    void refundedOrdersRefundNothingMoreAndNobodyDecidesTheirOwnCase() throws Exception {
        policy(48);
        Order refunded = ORDERS.place(aliceId, kitchen, "REFUNDED", biryani, 1);
        send(post(BASE + "/disputes"), alice, dispute(refunded.id(), "REFUND_ISSUE", 100L)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("CLAIM_ABOVE_REFUNDABLE")).andExpect(jsonPath("$.details[0]").value("refundablePaise: 0"));
        String id = read(send(post(BASE + "/disputes"), alice, dispute(refunded.id(), "REFUND_ISSUE", null)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.refundablePaise").value(0))).get("id").asText();
        send(post(BASE + "/admin/disputes/" + id + "/decide"), payments, decision("RESOLVED", 100L, 1)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("REFUND_ABOVE_REFUNDABLE"));
        // A payments admin who is also this kitchen's chef does not decide it.
        String chefPayments = bearer(UUID.randomUUID(), "CHEF", "PAYMENTS_ADMIN");
        CATALOG.chefKitchens.put(chefPayments.substring("Bearer ".length()), kitchen);
        send(post(BASE + "/admin/disputes/" + id + "/decide"), chefPayments, decision("RESOLVED", null, 1)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("OWN_CASE"));
        send(post(BASE + "/admin/disputes/" + id + "/decide"), payments, decision("RESOLVED", null, 1)).andExpect(status().isOk());

        // A staff member who is also a customer cannot resolve their own dispute.
        UUID stafferId = UUID.randomUUID();
        String staffer = bearer(stafferId, "CUSTOMER", "PAYMENTS_ADMIN");
        Order own = ORDERS.place(stafferId, kitchen, "DELIVERED", biryani, 2);
        String mine = read(send(post(BASE + "/disputes"), staffer, dispute(own.id(), "QUALITY", null)).andExpect(status().isCreated())).get("id").asText();
        send(post(BASE + "/admin/disputes/" + mine + "/decide"), staffer, decision("RESOLVED", 64_000L, 1)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("OWN_CASE"));
        String reported = read(send(post(BASE + "/reports"), alice, report("PERSON", stafferId, "ABUSE")).andExpect(status().isCreated())).get("id").asText();
        send(post(BASE + "/admin/reports/" + reported + "/decide"), bearer(stafferId, "CUSTOMER", "COMPLIANCE_ADMIN"),
                Map.of("outcome", "DISMISSED", "note", "x")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("OWN_CASE"));
    }

    @Test
    void staffFlagRisksAndSeeCountsNeverAVerdict() throws Exception {
        UUID suspect = UUID.randomUUID();
        Map<String, Object> flag = Map.of("subjectType", "PERSON", "subjectId", suspect, "severity", "HIGH", "reason", "Five refund claims this week");
        send(post(BASE + "/admin/flags"), bearer(UUID.randomUUID(), "AUDIT_ADMIN"), flag).andExpect(status().isForbidden());
        send(post(BASE + "/admin/flags"), support, flag).andExpect(status().isForbidden());
        String id = read(send(post(BASE + "/admin/flags"), payments, flag).andExpect(status().isCreated()).andExpect(jsonPath("$.open").value(true)))
                .get("id").asText();
        send(post(BASE + "/reports"), alice, report("PERSON", suspect, "FRAUD")).andExpect(status().isCreated());
        mvc.perform(get(BASE + "/admin/subjects/PERSON/" + suspect).header("Authorization", bearer(UUID.randomUUID(), "AUDIT_ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.openFlags.length()").value(1)).andExpect(jsonPath("$.reportsOpen").value(1))
                .andExpect(jsonPath("$.disputesOpen").value(0)).andExpect(jsonPath("$.refundsDecidedPaise").value(0));
        send(post(BASE + "/admin/flags/" + id + "/clear"), payments, Map.of("note", "Refunds were genuine")).andExpect(status().isOk())
                .andExpect(jsonPath("$.open").value(false)).andExpect(jsonPath("$.clearNote").value("Refunds were genuine"));
        send(post(BASE + "/admin/flags/" + id + "/clear"), payments, Map.of("note", "again")).andExpect(status().isOk())
                .andExpect(jsonPath("$.clearNote").value("Refunds were genuine"));
        mvc.perform(get(BASE + "/admin/flags/PERSON/" + suspect).header("Authorization", support)).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(BASE + "/admin/subjects/PERSON/" + suspect).header("Authorization", support)).andExpect(jsonPath("$.openFlags.length()").value(0));
        mvc.perform(get(BASE + "/admin/subjects/KITCHEN/" + kitchen).header("Authorization", alice)).andExpect(status().isForbidden());
        send(post(BASE + "/admin/flags/" + UUID.randomUUID() + "/clear"), payments, Map.of("note", "x")).andExpect(status().isNotFound());
        // Nobody flags or clears themselves.
        UUID staffer = UUID.randomUUID();
        send(post(BASE + "/admin/flags"), bearer(staffer, "CUSTOMER", "PAYMENTS_ADMIN"),
                Map.of("subjectType", "PERSON", "subjectId", staffer, "severity", "LOW", "reason", "x")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("OWN_CASE"));
    }

    @Test
    void tasteDataCoversWhatThePersonFiledAndKeepsSafetyAndMoneyRecords() throws Exception {
        policy(48);
        Order resolved = ORDERS.place(aliceId, kitchen, "DELIVERED", biryani, 1);
        Order open = ORDERS.place(aliceId, kitchen, "DELIVERED", biryani, 1);
        String resolvedId = read(send(post(BASE + "/disputes"), alice, dispute(resolved.id(), "QUALITY", null)).andExpect(status().isCreated()))
                .get("id").asText();
        send(post(BASE + "/admin/disputes/" + resolvedId + "/decide"), payments, decision("RESOLVED", 1_000L, 1)).andExpect(status().isOk());
        read(send(post(BASE + "/disputes"), alice, dispute(open.id(), "LATE", null)).andExpect(status().isCreated()));
        Map<String, Object> hygiene = report("KITCHEN", kitchen, "HYGIENE");
        hygiene.put("orderId", resolved.id());
        String upheld = read(send(post(BASE + "/reports"), alice, hygiene).andExpect(status().isCreated())).get("id").asText();
        send(post(BASE + "/admin/reports/" + upheld + "/decide"), compliance, Map.of("outcome", "UPHELD", "note", "Inspected")).andExpect(status().isOk());
        String dismissed = read(send(post(BASE + "/reports"), alice, report("DISH", biryani.id(), "SPAM")).andExpect(status().isCreated())).get("id").asText();
        send(post(BASE + "/admin/reports/" + dismissed + "/decide"), compliance, Map.of("outcome", "DISMISSED", "note", "No issue")).andExpect(status().isOk());
        // Two people's open reports on one dish: both can still erase (erased reports share the nil UUID).
        send(post(BASE + "/reports"), alice, report("DISH", biryani.id(), "FOOD_SAFETY")).andExpect(status().isCreated());
        send(post(BASE + "/reports"), bob, report("DISH", biryani.id(), "FOOD_SAFETY")).andExpect(status().isCreated());

        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", alice)).andExpect(status().isOk())
                .andExpect(jsonPath("$.trust.reports.length()").value(3)).andExpect(jsonPath("$.trust.disputes.length()").value(2));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", alice).header("X-Confirm-Erase", "ERASE")).andExpect(status().isOk())
                .andExpect(jsonPath("$.modules", hasItem("trust")));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", bob).header("X-Confirm-Erase", "ERASE")).andExpect(status().isOk());
        // Disputes stay as order records without the person (the open one withdrawn), so the per-order caps keep counting.
        List<Map<String, Object>> disputes = jdbc.queryForList("SELECT id, customer_id, description, refund_paise, status FROM adv_trust.dispute ORDER BY created_at, id");
        assertThat(disputes).hasSize(2).allSatisfy(row -> {
            assertThat(row.get("customer_id")).isEqualTo(TrustService.ERASED);
            assertThat(row.get("description")).isNull();
        });
        assertThat(disputes).extracting(row -> row.get("status")).containsExactlyInAnyOrder("RESOLVED", "WITHDRAWN");
        assertThat(jdbc.queryForObject("SELECT refund_paise FROM adv_trust.dispute WHERE id = ?", Long.class, UUID.fromString(resolvedId))).isEqualTo(1_000L);
        // The dismissed report is gone; the upheld and open ones stay as safety signals, without the people and the order they named.
        List<Map<String, Object>> reports = jdbc.queryForList("SELECT id, reporter_id, order_id, status FROM adv_trust.report");
        assertThat(reports).hasSize(3).allSatisfy(row -> {
            assertThat(row.get("reporter_id")).isEqualTo(TrustService.ERASED);
            assertThat(row.get("order_id")).isNull();
        });
        assertThat(reports).extracting(row -> row.get("id")).contains(UUID.fromString(upheld)).doesNotContain(UUID.fromString(dismissed));
        mvc.perform(get(BASE + "/admin/subjects/KITCHEN/" + kitchen).header("Authorization", support)).andExpect(jsonPath("$.reportsUpheld").value(1))
                .andExpect(jsonPath("$.disputesResolved").value(1)).andExpect(jsonPath("$.refundsDecidedPaise").value(1_000));
    }
}
