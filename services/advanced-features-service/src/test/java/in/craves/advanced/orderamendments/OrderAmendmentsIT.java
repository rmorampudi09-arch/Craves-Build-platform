package in.craves.advanced.orderamendments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

class OrderAmendmentsIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/order-amendments";
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;
    UUID kitchen;
    UUID aliceId;
    MenuItem biryani;
    MenuItem raita;
    MenuItem pulao;
    MenuItem mutton;
    MenuItem cake;
    String chef;
    String otherChef;
    String alice;
    String bob;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM adv_order_amendments.amendment");
        jdbc.update("DELETE FROM adv_platform.audit_event WHERE module = 'order-amendments'");
        kitchen = UUID.randomUUID();
        UUID otherKitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Chicken dum biryani", 32000);
        raita = CATALOG.add(kitchen, "Boondi raita", 4000);
        pulao = CATALOG.add(kitchen, "Veg pulao", 25000);
        mutton = CATALOG.add(kitchen, "Mutton biryani", 45000);
        cake = CATALOG.add(otherKitchen, "Plum cake", 20000);
        chef = bearer(UUID.randomUUID(), "CUSTOMER", "CHEF");
        CATALOG.chefKitchens.put(chef.substring("Bearer ".length()), kitchen);
        otherChef = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(otherChef.substring("Bearer ".length()), otherKitchen);
        aliceId = UUID.randomUUID();
        alice = bearer(aliceId, "CUSTOMER");
        bob = bearer(UUID.randomUUID(), "CUSTOMER");
    }

    Order order(String status) {
        return ORDERS.place(aliceId, kitchen, status, biryani, 2, raita, 3);
    }

    static Map<String, Object> change(UUID line, String kind, Integer quantity, MenuItem substitute, String note) {
        Map<String, Object> change = new LinkedHashMap<>();
        change.put("orderItemId", line);
        change.put("kind", kind);
        change.put("quantity", quantity);
        change.put("substituteMenuItemId", substitute == null ? null : substitute.id());
        change.put("note", note);
        return change;
    }

    String body(String note, Map<?, ?>... changes) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("changes", List.of(changes));
        body.put("note", note);
        return json.writeValueAsString(body);
    }

    ResultActions send(String path, String auth, String body) throws Exception {
        return mvc.perform(post(BASE + path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    JsonNode read(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    String version(long version) {
        return "{\"expectedVersion\":" + version + "}";
    }

    @Test
    void theCustomerAsksAndTheChefAgrees() throws Exception {
        Order order = order("CHEF_ACCEPTED");
        UUID biryaniLine = order.lines().get(0).id();
        UUID raitaLine = order.lines().get(1).id();
        String request = body("Two of us cannot come", change(raitaLine, "REDUCE", 1, null, null),
                change(biryaniLine, "ADJUST", null, null, "Less spicy please"));
        JsonNode proposed = read(mvc.perform(post(BASE + "/orders/" + order.id()).header("Authorization", alice).header("Idempotency-Key", "alice-amend-0001")
                        .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(status().isCreated()).andExpect(header().string("Idempotent-Replayed", "false"))
                .andExpect(jsonPath("$.status").value("PROPOSED")).andExpect(jsonPath("$.proposedBy").value("CUSTOMER"))
                .andExpect(jsonPath("$.foodDeltaPaise").value(-8000)).andExpect(jsonPath("$.changes[0].quantityAfter").value(1))
                .andExpect(jsonPath("$.changes[1].note").value("Less spicy please")).andExpect(jsonPath("$.expired").value(false)));
        String id = proposed.get("id").asText();
        mvc.perform(post(BASE + "/orders/" + order.id()).header("Authorization", alice).header("Idempotency-Key", "alice-amend-0001")
                        .contentType(MediaType.APPLICATION_JSON).content(request))
                .andExpect(header().string("Idempotent-Replayed", "true")).andExpect(jsonPath("$.id").value(id));
        // One open proposal per order, from either side.
        send("/orders/" + order.id(), alice, body(null, change(biryaniLine, "REMOVE", null, null, null))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AMENDMENT_PENDING")).andExpect(jsonPath("$.details[0]").value(id));
        send("/chef/orders/" + order.id(), chef, body(null, change(biryaniLine, "REMOVE", null, null, null))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("AMENDMENT_PENDING"));

        mvc.perform(get(BASE + "/chef/pending").header("Authorization", chef)).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].customerId").doesNotExist());
        mvc.perform(get(BASE + "/chef/pending").header("Authorization", otherChef)).andExpect(jsonPath("$.length()").value(0));
        send("/chef/" + id + "/accept", otherChef, version(1)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("AMENDMENT_NOT_FOUND"));
        send("/" + id + "/accept", alice, version(1)).andExpect(status().isNotFound());
        send("/chef/" + id + "/accept", chef, version(7)).andExpect(status().isPreconditionFailed());
        send("/chef/" + id + "/accept", chef, version(1)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACCEPTED"))
                .andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.answeredAt").isNotEmpty());
        send("/chef/" + id + "/accept", chef, version(1)).andExpect(status().isOk());
        send("/chef/" + id + "/decline", chef, "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("AMENDMENT_CLOSED"));
        mvc.perform(get(BASE + "/chef/pending").header("Authorization", chef)).andExpect(jsonPath("$.length()").value(0));

        // The accepted change counts: raita is down to one, so it can only be removed now, never reduced to one again.
        CLOCK.advance(Duration.ofSeconds(1));
        send("/orders/" + order.id(), alice, body(null, change(raitaLine, "REDUCE", 1, null, null))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("AMENDMENT_INVALID")).andExpect(jsonPath("$.details[0]").value(raitaLine + ": REDUCE needs a quantity below 1"));
        String second = read(send("/orders/" + order.id(), alice, body(null, change(raitaLine, "REMOVE", null, null, null)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.foodDeltaPaise").value(-4000))).get("id").asText();
        send("/chef/" + second + "/decline", chef, "{\"reason\":\"Raita is already packed\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DECLINED")).andExpect(jsonPath("$.answerNote").value("Raita is already packed"));
        mvc.perform(get(BASE + "/orders/" + order.id()).header("Authorization", alice)).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].status").value("ACCEPTED")).andExpect(jsonPath("$[1].status").value("DECLINED"));
        mvc.perform(get(BASE + "/orders/" + order.id()).header("Authorization", bob)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(BASE + "/mine").header("Authorization", alice)).andExpect(jsonPath("$[0].id").value(second));
        assertThat(jdbc.queryForList("SELECT action FROM adv_platform.audit_event WHERE module = 'order-amendments' ORDER BY id", String.class))
                .containsExactly("AMENDMENT_PROPOSED", "AMENDMENT_ACCEPTED", "AMENDMENT_PROPOSED", "AMENDMENT_DECLINED");
    }

    @Test
    void theChefProposesASubstitutionAndTheCustomerAnswers() throws Exception {
        Order order = order("PREPARING");
        UUID biryaniLine = order.lines().get(0).id();
        send("/chef/orders/" + order.id(), chef, body(null, change(biryaniLine, "REPLACE", null, mutton, null))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0]").value(biryaniLine + ": substitute costs 45000 paise, more than the 32000 paid"));
        send("/chef/orders/" + order.id(), chef, body(null, change(biryaniLine, "REPLACE", null, cake, null))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0]").value(biryaniLine + ": substitute " + cake.id() + " is not on this kitchen's menu right now"));
        send("/chef/orders/" + order.id(), otherChef, body(null, change(biryaniLine, "REMOVE", null, null, null))).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_FOUND"));
        send("/chef/orders/" + order.id(), alice, body(null, change(biryaniLine, "REMOVE", null, null, null))).andExpect(status().isForbidden());

        String id = read(send("/chef/orders/" + order.id(), chef, body("Out of chicken today", change(biryaniLine, "REPLACE", null, pulao, null)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.proposedBy").value("CHEF")).andExpect(jsonPath("$.foodDeltaPaise").value(-14000))
                .andExpect(jsonPath("$.changes[0].substituteName").value("Veg pulao")).andExpect(jsonPath("$.note").value("Out of chicken today")))
                .get("id").asText();
        mvc.perform(get(BASE + "/chef/pending").header("Authorization", chef)).andExpect(jsonPath("$.length()").value(0));
        send("/chef/" + id + "/accept", chef, version(1)).andExpect(status().isNotFound());
        send("/" + id + "/accept", bob, version(1)).andExpect(status().isNotFound());
        send("/" + id + "/accept", alice, version(1)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACCEPTED"));
        mvc.perform(get(BASE + "/chef/orders/" + order.id()).header("Authorization", chef)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("ACCEPTED"));
        mvc.perform(get(BASE + "/chef/orders/" + order.id()).header("Authorization", otherChef)).andExpect(status().isNotFound());

        // A second substitution starts from the pulao (250.00): only cheaper dishes than that now.
        send("/chef/orders/" + order.id(), chef, body(null, change(biryaniLine, "REPLACE", null, biryani, null))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0]").value(biryaniLine + ": substitute costs 32000 paise, more than the 25000 paid"));

        // An unanswered proposal lapses; the chef may withdraw it, and accepting it is refused.
        String lapsing = read(send("/chef/orders/" + order.id(), chef, body(null, change(order.lines().get(1).id(), "REMOVE", null, null, "No curd left")))
                .andExpect(status().isCreated())).get("id").asText();
        CLOCK.advance(Duration.ofMinutes(11));
        String later = bearer(aliceId, "CUSTOMER");
        mvc.perform(get(BASE + "/orders/" + order.id()).header("Authorization", later)).andExpect(jsonPath("$[1].expired").value(true));
        send("/" + lapsing + "/accept", later, version(1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("AMENDMENT_EXPIRED"));
        send("/" + lapsing + "/withdraw", later, "{}").andExpect(status().isNotFound());
        send("/chef/" + lapsing + "/withdraw", chef, "{}").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("WITHDRAWN"));
        send("/chef/" + lapsing + "/withdraw", chef, "{}").andExpect(status().isOk());
    }

    @Test
    void ordersChangeOnlyWhileTheKitchenCanStillDoIt() throws Exception {
        Order preparing = order("PREPARING");
        UUID line = preparing.lines().get(0).id();
        send("/orders/" + preparing.id(), alice, body(null, change(line, "REMOVE", null, null, null))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_AMENDABLE")).andExpect(jsonPath("$.details[0]").value("status: PREPARING"));
        Order paid = order("PAID");
        send("/chef/orders/" + paid.id(), chef, body(null, change(paid.lines().get(0).id(), "REMOVE", null, null, null))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_AMENDABLE"));
        String id = read(send("/orders/" + paid.id(), alice, body(null, change(paid.lines().get(0).id(), "REMOVE", null, null, null)))
                .andExpect(status().isCreated())).get("id").asText();
        ORDERS.status(paid.id(), "READY_FOR_PICKUP");
        send("/chef/" + id + "/accept", chef, version(1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_NOT_AMENDABLE"));
        send("/" + id + "/withdraw", alice, "{}").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("WITHDRAWN"));

        Order other = ORDERS.place(UUID.randomUUID(), kitchen, "PAID", biryani, 1);
        send("/orders/" + other.id(), alice, body(null, change(other.lines().get(0).id(), "ADJUST", null, null, "x"))).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ORDER_NOT_FOUND"));
        Order single = ORDERS.place(aliceId, kitchen, "PAID", biryani, 1);
        send("/orders/" + single.id(), alice, body(null, change(single.lines().get(0).id(), "REMOVE", null, null, null))).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.details[0]").value("every dish would be removed: cancel the order instead"));
        send("/orders/" + single.id(), alice, "{\"changes\":[]}").andExpect(status().isBadRequest());
        mvc.perform(post(BASE + "/orders/" + single.id()).contentType(MediaType.APPLICATION_JSON)
                .content(body(null, change(single.lines().get(0).id(), "ADJUST", null, null, "x")))).andExpect(status().isUnauthorized());
        ORDERS.down = true;
        send("/orders/" + single.id(), alice, body(null, change(single.lines().get(0).id(), "ADJUST", null, null, "x"))).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("ORDERS_UNAVAILABLE"));
        ORDERS.down = false;

        // A retried answer is harmless even after the order moved on.
        Order quick = order("CHEF_ACCEPTANCE_PENDING");
        String asked = read(send("/orders/" + quick.id(), alice, body(null, change(quick.lines().get(0).id(), "ADJUST", null, null, "Less oil")))
                .andExpect(status().isCreated())).get("id").asText();
        send("/chef/" + asked + "/accept", chef, version(1)).andExpect(status().isOk());
        ORDERS.status(quick.id(), "READY_FOR_PICKUP");
        send("/chef/" + asked + "/accept", chef, version(1)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACCEPTED"));

        // Each side makes at most five proposals per order, whatever became of them, and never uses up the other side's.
        for (int i = 0; i < OrderAmendmentService.MAX_PER_SIDE; i++) {
            String next = read(send("/orders/" + single.id(), alice, body(null, change(single.lines().get(0).id(), "ADJUST", null, null, "note " + i)))
                    .andExpect(status().isCreated())).get("id").asText();
            send("/" + next + "/withdraw", alice, "{}").andExpect(status().isOk());
        }
        send("/orders/" + single.id(), alice, body(null, change(single.lines().get(0).id(), "ADJUST", null, null, "one more"))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TOO_MANY_AMENDMENTS"));
        ORDERS.status(single.id(), "CHEF_ACCEPTED");
        send("/chef/orders/" + single.id(), chef, body(null, change(single.lines().get(0).id(), "ADJUST", null, null, "Made with less salt")))
                .andExpect(status().isCreated());
    }

    @Test
    void aLapsedProposalCannotBeAcceptedOnceANewerOneExistsWhateverTheClockSays() throws Exception {
        Order order = order("CHEF_ACCEPTED");
        UUID raitaLine = order.lines().get(1).id();
        String first = read(send("/chef/orders/" + order.id(), chef, body(null, change(raitaLine, "REMOVE", null, null, null)))
                .andExpect(status().isCreated())).get("id").asText();
        CLOCK.advance(Duration.ofMinutes(11));
        String second = read(send("/chef/orders/" + order.id(), chef, body(null, change(raitaLine, "REMOVE", null, null, null)))
                .andExpect(status().isCreated())).get("id").asText();
        // A replica whose clock runs behind still sees the first proposal as open; accepting it would take the raita twice.
        CLOCK.advance(Duration.ofMinutes(-2));
        send("/" + first + "/accept", alice, version(1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("AMENDMENT_EXPIRED"));
        send("/" + second + "/accept", alice, version(1)).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT sum(food_delta_paise) FROM adv_order_amendments.amendment WHERE status = 'ACCEPTED'", Long.class))
                .isEqualTo(-12000L);
    }

    @Test
    void staffReadAnOrdersChangesAndTasteDataCoversThem() throws Exception {
        Order order = order("CHEF_ACCEPTED");
        String accepted = read(send("/orders/" + order.id(), alice, body("Allergic to cashews", change(order.lines().get(0).id(), "ADJUST", null, null,
                "No cashews in the gravy"))).andExpect(status().isCreated())).get("id").asText();
        send("/chef/" + accepted + "/accept", chef, version(1)).andExpect(status().isOk());
        String open = read(send("/orders/" + order.id(), alice, body(null, change(order.lines().get(1).id(), "REDUCE", 2, null, null)))
                .andExpect(status().isCreated())).get("id").asText();

        mvc.perform(get(BASE + "/admin/orders/" + order.id()).header("Authorization", bearer(UUID.randomUUID(), "SUPPORT_ADMIN"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get(BASE + "/admin/orders/" + order.id()).header("Authorization", alice)).andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/admin/orders/" + order.id()).header("Authorization", chef)).andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", alice)).andExpect(status().isOk())
                .andExpect(jsonPath("$['order-amendments'].amendments.length()").value(2));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", alice).header("X-Confirm-Erase", "ERASE")).andExpect(status().isOk())
                .andExpect(jsonPath("$.modules", hasItem("order-amendments"))).andExpect(jsonPath("$.recordsErased").value(2));
        // The open request is gone; the accepted change stays with the order for the kitchen, without the person or their words.
        List<Map<String, Object>> left = jdbc.queryForList("SELECT id, customer_id, proposer_id, note, changes::text AS changes FROM adv_order_amendments.amendment");
        assertThat(left).hasSize(1);
        assertThat(left.get(0).get("id")).isEqualTo(UUID.fromString(accepted));
        assertThat(left.get(0).get("customer_id")).isEqualTo(OrderAmendmentService.ERASED);
        assertThat(left.get(0).get("proposer_id")).isEqualTo(OrderAmendmentService.ERASED);
        assertThat(left.get(0).get("note")).isNull();
        assertThat((String) left.get(0).get("changes")).doesNotContain("cashews").contains("ADJUST");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_order_amendments.amendment WHERE id = ?", Integer.class, UUID.fromString(open))).isZero();
        mvc.perform(get(BASE + "/chef/orders/" + order.id()).header("Authorization", chef)).andExpect(jsonPath("$[0].changes[0].note").doesNotExist());
        mvc.perform(get(BASE + "/mine").header("Authorization", alice)).andExpect(jsonPath("$.length()").value(0));
        // The order goes on: its next proposal continues the sequence although earlier ones were erased.
        send("/chef/orders/" + order.id(), chef, body(null, change(order.lines().get(1).id(), "REMOVE", null, null, null))).andExpect(status().isCreated());
    }
}
