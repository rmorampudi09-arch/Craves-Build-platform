package in.craves.advanced.bulkorders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.support.IntegrationTestBase;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
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

class BulkOrdersIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/bulk-orders";
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;
    UUID kitchen;
    MenuItem biryani;
    MenuItem raita;
    MenuItem cake;
    String chef;
    String otherChef;
    String admin;
    String alice;
    String bob;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM adv_bulk_orders.request");
        jdbc.update("DELETE FROM adv_bulk_orders.policy");
        jdbc.update("DELETE FROM adv_platform.audit_event WHERE module = 'bulk-orders'");
        kitchen = UUID.randomUUID();
        UUID otherKitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Chicken dum biryani", 32000);
        raita = CATALOG.add(kitchen, "Boondi raita", 4000);
        cake = CATALOG.add(otherKitchen, "Plum cake", 50000);
        chef = bearer(UUID.randomUUID(), "CUSTOMER", "CHEF");
        CATALOG.chefKitchens.put(chef.substring("Bearer ".length()), kitchen);
        otherChef = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(otherChef.substring("Bearer ".length()), otherKitchen);
        admin = bearer(UUID.randomUUID(), "PLATFORM_ADMIN");
        alice = bearer(UUID.randomUUID(), "CUSTOMER");
        bob = bearer(UUID.randomUUID(), "CUSTOMER");
    }

    ResultActions setPolicy(String auth, int minPortions, int leadHours, int daysAhead, int depositPercent) throws Exception {
        return mvc.perform(put(BASE + "/admin/policy").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("minPortions", minPortions, "minLeadHours", leadHours, "maxDaysAhead", daysAhead,
                        "depositPercent", depositPercent))));
    }

    String request(Instant eventAt, Object... dishesAndQuantities) throws Exception {
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < dishesAndQuantities.length; i += 2) {
            items.add(Map.of("menuItemId", ((MenuItem) dishesAndQuantities[i]).id(), "quantity", dishesAndQuantities[i + 1]));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("kitchenId", kitchen);
        body.put("eventAt", eventAt.toString());
        body.put("guests", 40);
        body.put("notes", "Less spicy please");
        body.put("items", items);
        return json.writeValueAsString(body);
    }

    ResultActions create(String auth, String body) throws Exception {
        return mvc.perform(post(BASE).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    String created(String auth, String body) throws Exception {
        return json.readTree(create(auth, body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    ResultActions quote(String auth, String id, long version, Instant validUntil, Object... dishesAndPrices) throws Exception {
        List<Map<String, Object>> lines = new ArrayList<>();
        for (int i = 0; i < dishesAndPrices.length; i += 2) {
            lines.add(Map.of("menuItemId", ((MenuItem) dishesAndPrices[i]).id(), "unitPricePaise", dishesAndPrices[i + 1]));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("lines", lines);
        body.put("validUntil", validUntil.toString());
        body.put("note", "Includes packing");
        body.put("expectedVersion", version);
        return mvc.perform(post(BASE + "/chef/requests/" + id + "/quote").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    ResultActions accept(String auth, String id, long version) throws Exception {
        return mvc.perform(post(BASE + "/" + id + "/accept").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedVersion\":" + version + "}"));
    }

    ResultActions decline(String auth, String id) throws Exception {
        return mvc.perform(post(BASE + "/chef/requests/" + id + "/decline").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Fully booked that day\"}"));
    }

    @Test
    void staffSetTheRulesBeforeAnyoneCanAsk() throws Exception {
        mvc.perform(get(BASE + "/policy")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("BULK_POLICY_NOT_SET"));
        create(alice, request(CLOCK.instant().plus(Duration.ofDays(3)), biryani, 30)).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("BULK_ORDERS_NOT_CONFIGURED"));
        setPolicy(alice, 20, 24, 30, 25).andExpect(status().isForbidden());
        setPolicy(bearer(UUID.randomUUID(), "SUPPORT_ADMIN"), 20, 24, 30, 25).andExpect(status().isForbidden());
        setPolicy(admin, 20, 24, 30, 101).andExpect(status().isBadRequest());
        setPolicy(admin, 20, 720, 1, 25).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("POLICY_IMPOSSIBLE"));
        setPolicy(admin, 20, 24, 30, 25).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(get(BASE + "/policy")).andExpect(status().isOk()).andExpect(jsonPath("$.minPortions").value(20))
                .andExpect(jsonPath("$.depositPercent").value(25));
        setPolicy(bearer(UUID.randomUUID(), "PAYMENTS_ADMIN"), 30, 48, 60, 50).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get(BASE + "/policy")).andExpect(jsonPath("$.minLeadHours").value(48));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_platform.audit_event WHERE module = 'bulk-orders' AND action = 'POLICY_SET'",
                Integer.class)).isEqualTo(2);
    }

    @Test
    void customerAsksChefQuotesCustomerAccepts() throws Exception {
        setPolicy(admin, 20, 24, 30, 25).andExpect(status().isOk());
        Instant event = CLOCK.instant().plus(Duration.ofDays(3));
        create(alice, request(event, biryani, 10)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("BELOW_MIN_PORTIONS"));
        create(alice, request(event, biryani, 3000, biryani, 3000)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("QUANTITY_TOO_LARGE"));
        create(alice, request(CLOCK.instant().plus(Duration.ofHours(2)), biryani, 30)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("EVENT_TOO_SOON"));
        create(alice, request(CLOCK.instant().plus(Duration.ofDays(40)), biryani, 30)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("EVENT_TOO_FAR"));
        create(alice, request(event, biryani, 30, cake, 5)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("NOT_THIS_KITCHENS_DISHES")).andExpect(jsonPath("$.details[0]").value(cake.id().toString()));
        mvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content(request(event, biryani, 30))).andExpect(status().isUnauthorized());

        String body = request(event, biryani, 30, raita, 30);
        String id = json.readTree(mvc.perform(post(BASE).header("Authorization", alice).header("Idempotency-Key", "party-request-01")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("REQUESTED")).andExpect(jsonPath("$.portions").value(60))
                .andExpect(jsonPath("$.lines[0].listPricePaise").value(32000)).andExpect(jsonPath("$.notes").value("Less spicy please"))
                .andReturn().getResponse().getContentAsString()).get("id").asText();
        mvc.perform(post(BASE).header("Authorization", alice).header("Idempotency-Key", "party-request-01").contentType(MediaType.APPLICATION_JSON)
                .content(body)).andExpect(header().string("Idempotent-Replayed", "true")).andExpect(jsonPath("$.id").value(id));
        mvc.perform(get(BASE + "/" + id).header("Authorization", bob)).andExpect(status().isNotFound());
        mvc.perform(get(BASE + "/mine").header("Authorization", alice)).andExpect(jsonPath("$[0].id").value(id));

        mvc.perform(get(BASE + "/chef/requests").header("Authorization", chef)).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(id));
        mvc.perform(get(BASE + "/chef/requests").header("Authorization", otherChef)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(BASE + "/chef/requests").header("Authorization", alice)).andExpect(status().isForbidden());
        Instant validUntil = CLOCK.instant().plus(Duration.ofDays(1));
        quote(otherChef, id, 1, validUntil, biryani, 28000, raita, 3000).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("BULK_ORDER_NOT_FOUND"));
        quote(chef, id, 1, validUntil, biryani, 10_000_001L, raita, 3000).andExpect(status().isBadRequest());
        quote(chef, id, 1, validUntil, biryani, 28000).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QUOTE_LINES_MISMATCH"));
        quote(chef, id, 1, event.plusSeconds(60), biryani, 28000, raita, 3000).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_VALID_UNTIL"));
        quote(chef, id, 5, validUntil, biryani, 28000, raita, 3000).andExpect(status().isPreconditionFailed());
        // 30 × 280.00 + 30 × 30.00 = 9,300.00; the staff-set 25 % deposit is 2,325.00.
        quote(chef, id, 1, validUntil, biryani, 28000, raita, 3000).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("QUOTED"))
                .andExpect(jsonPath("$.totalPaise").value(930000)).andExpect(jsonPath("$.depositPaise").value(232500))
                .andExpect(jsonPath("$.version").value(2));
        mvc.perform(get(BASE + "/" + id).header("Authorization", alice)).andExpect(jsonPath("$.depositPercent").value(25))
                .andExpect(jsonPath("$.lines[1].unitPricePaise").value(3000)).andExpect(jsonPath("$.expired").value(false))
                .andExpect(jsonPath("$.quoteNote").value("Includes packing"));

        accept(alice, id, 1).andExpect(status().isPreconditionFailed());
        accept(bob, id, 2).andExpect(status().isNotFound());
        accept(alice, id, 2).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACCEPTED")).andExpect(jsonPath("$.version").value(3));
        mvc.perform(post(BASE + "/" + id + "/cancel").header("Authorization", alice)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BULK_ORDER_ACCEPTED"));
        quote(chef, id, 3, validUntil, biryani, 1000, raita, 1000).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("BULK_ORDER_CLOSED"));
        decline(chef, id).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("BULK_ORDER_ACCEPTED"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_platform.audit_event WHERE module = 'bulk-orders' AND action = 'QUOTED' AND entity_id = ?",
                Integer.class, id)).isEqualTo(1);
    }

    @Test
    void quotesLapseAndRequestsCanBeCancelledOrDeclined() throws Exception {
        setPolicy(admin, 20, 0, 30, 0).andExpect(status().isOk());
        String id = created(alice, request(CLOCK.instant().plus(Duration.ofDays(2)), biryani, 25));
        quote(chef, id, 1, CLOCK.instant().plus(Duration.ofHours(1)), biryani, 30000).andExpect(status().isOk()).andExpect(jsonPath("$.depositPaise").value(0));
        CLOCK.advance(Duration.ofHours(2));
        mvc.perform(get(BASE + "/" + id).header("Authorization", alice)).andExpect(jsonPath("$.expired").value(true));
        accept(alice, id, 2).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("QUOTE_EXPIRED"));
        quote(chef, id, 2, CLOCK.instant().plus(Duration.ofHours(5)), biryani, 29000).andExpect(status().isOk())
                .andExpect(jsonPath("$.expired").value(false)).andExpect(jsonPath("$.totalPaise").value(725000));
        mvc.perform(post(BASE + "/" + id + "/cancel").header("Authorization", alice)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        mvc.perform(post(BASE + "/" + id + "/cancel").header("Authorization", alice)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        accept(alice, id, 4).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("BULK_ORDER_NOT_QUOTED"));

        String declined = created(alice, request(CLOCK.instant().plus(Duration.ofDays(2)), biryani, 25));
        decline(chef, declined).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DECLINED"))
                .andExpect(jsonPath("$.declineReason").value("Fully booked that day"));
        quote(chef, declined, 2, CLOCK.instant().plus(Duration.ofHours(5)), biryani, 29000).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BULK_ORDER_CLOSED"));

        String lapsed = created(alice, request(CLOCK.instant().plus(Duration.ofHours(3)), biryani, 25));
        CLOCK.advance(Duration.ofHours(4));
        mvc.perform(get(BASE + "/" + lapsed).header("Authorization", alice)).andExpect(jsonPath("$.expired").value(true));
        quote(chef, lapsed, 1, CLOCK.instant().plus(Duration.ofHours(1)), biryani, 29000).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BULK_ORDER_CLOSED"));
    }

    @Test
    void openRequestsAreCappedAndTasteDataCoversThem() throws Exception {
        setPolicy(admin, 1, 0, 30, 10).andExpect(status().isOk());
        Instant soon = CLOCK.instant().plus(Duration.ofHours(2));
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < BulkOrderService.MAX_OPEN_PER_PERSON; i++) ids.add(created(alice, request(soon, biryani, 1)));
        create(alice, request(soon, biryani, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TOO_MANY_OPEN_REQUESTS"));
        mvc.perform(post(BASE + "/" + ids.get(0) + "/cancel").header("Authorization", alice)).andExpect(status().isOk());
        created(alice, request(soon, biryani, 1));
        // Once their events pass, unanswered requests no longer count as open.
        CLOCK.advance(Duration.ofHours(3));
        Instant event = CLOCK.instant().plus(Duration.ofDays(5));
        String accepted = created(alice, request(event, biryani, 2));
        quote(chef, accepted, 1, event.minusSeconds(60), biryani, 30000).andExpect(status().isOk()).andExpect(jsonPath("$.depositPaise").value(6000));
        accept(alice, accepted, 2).andExpect(status().isOk());

        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", alice)).andExpect(status().isOk())
                .andExpect(jsonPath("$['bulk-orders'].requests.length()").value(12));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", alice).header("X-Confirm-Erase", "ERASE")).andExpect(status().isOk());
        // The accepted order is still to be cooked: the chef keeps it, without the person or their notes.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_bulk_orders.request", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT customer_id FROM adv_bulk_orders.request WHERE id = ?", UUID.class, UUID.fromString(accepted)))
                .isEqualTo(BulkOrderService.ERASED);
        mvc.perform(get(BASE + "/chef/requests").header("Authorization", chef)).andExpect(jsonPath("$[0].id").value(accepted))
                .andExpect(jsonPath("$[0].notes").doesNotExist());
        mvc.perform(get(BASE + "/mine").header("Authorization", alice)).andExpect(jsonPath("$.length()").value(0));
    }
}
