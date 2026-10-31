package in.craves.advanced.promotions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.promotions.PromotionsDtos.DiscountKind;
import in.craves.advanced.promotions.PromotionsDtos.FundedBy;
import in.craves.advanced.promotions.PromotionsDtos.NewPromotion;
import in.craves.advanced.support.IntegrationTestBase;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

class PromotionsIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/promotions";
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;
    UUID kitchen;
    UUID otherKitchen;
    MenuItem biryani;
    MenuItem idli;
    MenuItem cake;
    String admin;
    String alice;
    String bob;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM adv_promotions.redemption");
        jdbc.update("DELETE FROM adv_promotions.promotion");
        kitchen = UUID.randomUUID();
        otherKitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Chicken dum biryani", 32000);
        idli = CATALOG.add(kitchen, "Idli sambar", 9000);
        cake = CATALOG.add(otherKitchen, "Plum cake", 50000);
        admin = bearer(UUID.randomUUID(), "PAYMENTS_ADMIN");
        alice = bearer(UUID.randomUUID(), "CUSTOMER");
        bob = bearer(UUID.randomUUID(), "CUSTOMER");
    }

    NewPromotion terms(String code, DiscountKind kind, Integer percentOff, Long flatPaise, Long cap, long minOrder, List<UUID> kitchens,
                       int perPerson, long budget, Integer maxRedemptions, boolean listed) {
        Instant now = CLOCK.instant();
        return new NewPromotion("Internal " + code, "Offer " + code, "Terms apply", code, kind, percentOff, flatPaise, cap, minOrder, kitchens,
                FundedBy.CRAVES, perPerson, budget, maxRedemptions, now.minus(Duration.ofHours(1)), now.plus(Duration.ofDays(7)), listed);
    }

    NewPromotion flat(String code, long paise, long minOrder, int perPerson, long budget, Integer maxRedemptions) {
        return terms(code, DiscountKind.FLAT, null, paise, null, minOrder, List.of(), perPerson, budget, maxRedemptions, true);
    }

    ResultActions createRequest(String auth, Object body) throws Exception {
        return mvc.perform(post(BASE + "/admin/promotions").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    JsonNode create(NewPromotion terms) throws Exception {
        return json.readTree(createRequest(admin, terms).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    ResultActions change(JsonNode promotion, UUID id, String status, long version) throws Exception {
        ObjectNode body = json.createObjectNode();
        body.set("promotion", promotion);
        body.put("status", status);
        body.put("expectedVersion", version);
        return mvc.perform(put(BASE + "/admin/promotions/" + id).header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)));
    }

    UUID live(NewPromotion terms) throws Exception {
        JsonNode created = create(terms);
        UUID id = UUID.fromString(created.get("id").asText());
        change(created.get("promotion"), id, "ACTIVE", created.get("version").asLong()).andExpect(status().isOk());
        return id;
    }

    String cart(String code, Object... dishesAndQuantities) throws Exception {
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < dishesAndQuantities.length; i += 2) {
            items.add(Map.of("menuItemId", ((MenuItem) dishesAndQuantities[i]).id(), "quantity", dishesAndQuantities[i + 1]));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("items", items);
        return json.writeValueAsString(body);
    }

    ResultActions quote(String auth, String cart) throws Exception {
        return mvc.perform(post(BASE + "/quote").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(cart));
    }

    ResultActions reserve(String auth, String cart) throws Exception {
        return mvc.perform(post(BASE + "/redemptions").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(cart));
    }

    ResultActions confirm(String auth, String redemptionId, UUID orderId) throws Exception {
        return mvc.perform(post(BASE + "/redemptions/" + redemptionId + "/confirm").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"orderId\":\"" + orderId + "\"}"));
    }

    String id(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    JsonNode adminView(UUID id) throws Exception {
        JsonNode all = json.readTree(mvc.perform(get(BASE + "/admin/promotions").header("Authorization", admin))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (JsonNode promotion : all) if (promotion.get("id").asText().equals(id.toString())) return promotion;
        throw new AssertionError("promotion " + id + " not listed");
    }

    @Test
    void staffSetEveryValueAndOnlyStaffCan() throws Exception {
        NewPromotion feast = terms("feast20", DiscountKind.PERCENT, 20, null, 5000L, 30000, List.of(kitchen), 1, 1_000_000, null, true);
        createRequest(alice, feast).andExpect(status().isForbidden());
        createRequest(bearer(UUID.randomUUID(), "SUPPORT_ADMIN"), feast).andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/admin/promotions").header("Authorization", bearer(UUID.randomUUID(), "SUPPORT_ADMIN"))).andExpect(status().isOk());
        mvc.perform(get(BASE + "/admin/promotions")).andExpect(status().isUnauthorized());
        createRequest(admin, terms("MIXED", DiscountKind.FLAT, 10, 5000L, null, 0, List.of(), 1, 100_000, null, true))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PROMOTION"))
                .andExpect(jsonPath("$.details[0]").value("FLAT_NEEDS_FLAT_PAISE_ONLY"));
        createRequest(admin, terms("NOWHERE", DiscountKind.FLAT, null, 5000L, null, 0, List.of(UUID.randomUUID()), 1, 100_000, null, true))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNKNOWN_KITCHEN"));
        Map<String, Object> noMinimum = json.convertValue(flat("NOMIN", 5000, 0, 1, 100_000, null), Map.class);
        noMinimum.remove("minOrderPaise");
        createRequest(admin, noMinimum).andExpect(status().isBadRequest());

        JsonNode created = create(feast);
        UUID id = UUID.fromString(created.get("id").asText());
        assertThat(created.get("status").asText()).isEqualTo("DRAFT");
        assertThat(created.at("/promotion/code").asText()).isEqualTo("FEAST20");
        createRequest(admin, feast).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CODE_IN_USE"));
        mvc.perform(get(BASE + "/offers")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        // A draft's code answers like an unknown one, so codes cannot be discovered before launch.
        quote(alice, cart("FEAST20", biryani, 1)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("PROMO_CODE_UNKNOWN"));

        JsonNode promotion = created.get("promotion");
        change(promotion, id, "ACTIVE", 7).andExpect(status().isPreconditionFailed());
        change(promotion, id, "PAUSED", 1).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("INVALID_STATUS_CHANGE"));
        change(promotion, id, "ACTIVE", 1).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.activatedAt").isNotEmpty()).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get(BASE + "/offers")).andExpect(status().isOk()).andExpect(jsonPath("$[0].code").value("FEAST20"))
                .andExpect(jsonPath("$[0].percentOff").value(20)).andExpect(jsonPath("$[0].totalBudgetPaise").doesNotExist());
        mvc.perform(get(BASE + "/offers").param("kitchenId", otherKitchen.toString())).andExpect(jsonPath("$.length()").value(0));

        // Live terms are frozen; the wording, budget and status still change.
        ((ObjectNode) promotion).put("minOrderPaise", 1000);
        change(promotion, id, "ACTIVE", 2).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TERMS_FROZEN"))
                .andExpect(jsonPath("$.details[0]").value("minOrderPaise"));
        ((ObjectNode) promotion).put("minOrderPaise", 30000).put("title", "Feast week").put("totalBudgetPaise", 2_000_000);
        change(promotion, id, "ACTIVE", 2).andExpect(status().isOk()).andExpect(jsonPath("$.promotion.title").value("Feast week"))
                .andExpect(jsonPath("$.version").value(3));
        // Pausing never depends on Catalog: kitchens the promotion already names are not asked about again.
        CATALOG.down = true;
        change(promotion, id, "PAUSED", 3).andExpect(status().isOk());
        CATALOG.down = false;
        mvc.perform(get(BASE + "/offers")).andExpect(jsonPath("$.length()").value(0));
        quote(alice, cart("feast20", biryani, 1)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("PROMO_NOT_ACTIVE"));
        change(promotion, id, "ENDED", 4).andExpect(status().isOk());
        change(promotion, id, "ACTIVE", 5).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROMOTION_ENDED"));
        quote(alice, cart("feast20", biryani, 1)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("PROMO_ENDED"));
        assertThat(jdbc.queryForList("SELECT action FROM adv_platform.audit_event WHERE module = 'promotions' AND entity_id = ? ORDER BY id",
                String.class, id.toString()))
                .containsExactly("PROMOTION_CREATED", "PROMOTION_ACTIVE", "PROMOTION_UPDATED", "PROMOTION_PAUSED", "PROMOTION_ENDED");
    }

    @Test
    void customersQuoteReserveConfirmAndRelease() throws Exception {
        UUID feast = live(terms("FEAST20", DiscountKind.PERCENT, 20, null, 5000L, 30000, List.of(kitchen), 1, 1_000_000, null, true));
        // Only the kitchen's dishes count: 20 % of 320.00 is 64.00, capped at 50.00.
        quote(alice, cart("feast20", biryani, 1, cake, 1)).andExpect(status().isOk()).andExpect(jsonPath("$.subtotalPaise").value(82000))
                .andExpect(jsonPath("$.eligibleSubtotalPaise").value(32000)).andExpect(jsonPath("$.discountPaise").value(5000))
                .andExpect(jsonPath("$.promotion.id").value(feast.toString()));
        quote(alice, cart("FEAST20", idli, 2)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("PROMO_MIN_ORDER"))
                .andExpect(jsonPath("$.details[0]").value("minOrderPaise: 30000"));
        quote(alice, cart("FEAST20", cake, 1)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("PROMO_NOT_FOR_THESE_DISHES"));
        quote(alice, cart("NOSUCHCODE", biryani, 1)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("PROMO_CODE_UNKNOWN"));
        mvc.perform(post(BASE + "/quote").contentType(MediaType.APPLICATION_JSON).content(cart("FEAST20", biryani, 1))).andExpect(status().isUnauthorized());
        CATALOG.unavailable.add(idli.id());
        quote(alice, cart("FEAST20", biryani, 1, idli, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ITEMS_UNAVAILABLE"))
                .andExpect(jsonPath("$.details[0]").value(idli.id().toString()));

        String body = cart("FEAST20", biryani, 1);
        ResultActions reserved = mvc.perform(post(BASE + "/redemptions").header("Authorization", alice).header("Idempotency-Key", "checkout-0001")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("RESERVED")).andExpect(jsonPath("$.discountPaise").value(5000));
        String redemption = id(reserved);
        mvc.perform(post(BASE + "/redemptions").header("Authorization", alice).header("Idempotency-Key", "checkout-0001")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(header().string("Idempotent-Replayed", "true")).andExpect(jsonPath("$.id").value(redemption));
        reserve(alice, body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROMO_RESERVATION_EXISTS"))
                .andExpect(jsonPath("$.details[0]").value(redemption));

        UUID order = UUID.randomUUID();
        confirm(bob, redemption, order).andExpect(status().isNotFound());
        confirm(alice, redemption, order).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.orderId").value(order.toString()));
        confirm(alice, redemption, order).andExpect(status().isOk());
        confirm(alice, redemption, UUID.randomUUID()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REDEMPTION_CONFIRMED"));
        mvc.perform(delete(BASE + "/redemptions/" + redemption).header("Authorization", alice)).andExpect(status().isConflict());
        reserve(alice, body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROMO_PERSON_LIMIT"));
        assertThat(adminView(feast).get("confirmed").asInt()).isEqualTo(1);
        assertThat(adminView(feast).get("committedPaise").asLong()).isEqualTo(5000);

        // A released reservation gives the offer back; an expired one stops counting and can no longer be confirmed.
        String bobs = id(reserve(bob, body).andExpect(status().isCreated()));
        mvc.perform(delete(BASE + "/redemptions/" + bobs).header("Authorization", bob)).andExpect(status().isNoContent());
        mvc.perform(delete(BASE + "/redemptions/" + bobs).header("Authorization", bob)).andExpect(status().isNoContent());
        confirm(bob, bobs, UUID.randomUUID()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REDEMPTION_RELEASED"));
        String again = id(reserve(bob, body).andExpect(status().isCreated()));
        assertThat(adminView(feast).get("reserved").asInt()).isEqualTo(1);
        CLOCK.advance(Duration.ofMinutes(11));
        confirm(bob, again, UUID.randomUUID()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REDEMPTION_EXPIRED"));
        assertThat(adminView(feast).get("reserved").asInt()).isZero();
        String third = id(reserve(bob, body).andExpect(status().isCreated()));

        // Promotions never stack: an order carries at most one.
        live(flat("TREAT", 2000, 0, 1, 100_000, null));
        String treat = id(reserve(bob, cart("TREAT", biryani, 1)).andExpect(status().isCreated()));
        confirm(bob, third, order).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_HAS_PROMOTION"));
        confirm(bob, treat, UUID.randomUUID()).andExpect(status().isOk());
    }

    @Test
    void budgetsAndCapsAreNeverOverspent() throws Exception {
        UUID hundred = live(flat("HUNDRED", 10000, 0, 5, 25000, null));
        String carol = bearer(UUID.randomUUID(), "CUSTOMER");
        String first = id(reserve(carol, cart("HUNDRED", biryani, 1)).andExpect(status().isCreated()));
        reserve(alice, cart("HUNDRED", idli, 2)).andExpect(status().isCreated());
        reserve(bob, cart("HUNDRED", biryani, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROMO_EXHAUSTED"));

        JsonNode view = adminView(hundred);
        ((ObjectNode) view.get("promotion")).put("totalBudgetPaise", 15000);
        change(view.get("promotion"), hundred, "ACTIVE", view.get("version").asLong()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BELOW_COMMITTED"));

        mvc.perform(post(BASE + "/admin/redemptions/" + first + "/void").header("Authorization", bearer(UUID.randomUUID(), "SUPPORT_ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Order was never placed\"}")).andExpect(status().isForbidden());
        mvc.perform(post(BASE + "/admin/redemptions/" + first + "/void").header("Authorization", admin)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Order was never placed\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("VOIDED"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_platform.audit_event WHERE module = 'promotions' AND action = 'REDEMPTION_VOIDED' "
                + "AND entity_id = ?", Integer.class, first)).isEqualTo(1);
        confirm(carol, first, UUID.randomUUID()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REDEMPTION_RELEASED"));
        reserve(bob, cart("HUNDRED", biryani, 1)).andExpect(status().isCreated());

        live(flat("ONCE", 1000, 0, 1, 1_000_000, 1));
        reserve(alice, cart("ONCE", biryani, 1)).andExpect(status().isCreated());
        reserve(bob, cart("ONCE", biryani, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROMO_EXHAUSTED"));
    }

    @Test
    void concurrentReservationsNeverOverspendTheBudget() throws Exception {
        live(flat("RUSH", 10000, 0, 1, 20000, null));
        ExecutorService pool = Executors.newFixedThreadPool(6);
        List<Future<Integer>> results = new ArrayList<>();
        String body = cart("RUSH", biryani, 1);
        for (int i = 0; i < 6; i++) {
            String person = bearer(UUID.randomUUID(), "CUSTOMER");
            results.add(pool.submit(() -> reserve(person, body).andReturn().getResponse().getStatus()));
        }
        pool.shutdown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> result : results) statuses.add(result.get());
        assertThat(statuses).filteredOn(code -> code == 201).hasSize(2);
        assertThat(statuses).filteredOn(code -> code == 409).hasSize(4);
        assertThat(jdbc.queryForObject("SELECT sum(discount_paise) FROM adv_promotions.redemption", Long.class)).isEqualTo(20000L);
    }

    @Test
    void offersWithoutACodePickTheBestForTheCart() throws Exception {
        UUID minimum = live(terms(null, DiscountKind.FLAT, null, 3000L, null, 20000, List.of(), 3, 1_000_000, null, true));
        UUID tenOff = live(terms(null, DiscountKind.PERCENT, 10, null, null, 0, List.of(kitchen), 3, 1_000_000, null, true));
        UUID quiet = live(terms(null, DiscountKind.FLAT, null, 1000L, null, 0, List.of(), 3, 1_000_000, null, false));

        quote(alice, cart(null, biryani, 1)).andExpect(status().isOk()).andExpect(jsonPath("$.discountPaise").value(3200))
                .andExpect(jsonPath("$.promotion.id").value(tenOff.toString())).andExpect(jsonPath("$.promotion.code").doesNotExist());
        quote(alice, cart(null, idli, 1)).andExpect(jsonPath("$.discountPaise").value(1000)).andExpect(jsonPath("$.promotion.id").value(quiet.toString()));
        quote(alice, cart(null, cake, 1)).andExpect(jsonPath("$.discountPaise").value(3000)).andExpect(jsonPath("$.promotion.id").value(minimum.toString()));
        mvc.perform(get(BASE + "/offers")).andExpect(jsonPath("$[*].id", containsInAnyOrder(minimum.toString(), tenOff.toString())));
        mvc.perform(get(BASE + "/offers").param("kitchenId", otherKitchen.toString()))
                .andExpect(jsonPath("$[*].id", containsInAnyOrder(minimum.toString()))).andExpect(jsonPath("$[*].id", not(hasItem(quiet.toString()))));
        reserve(alice, cart(null, biryani, 1)).andExpect(status().isCreated()).andExpect(jsonPath("$.promotionId").value(tenOff.toString()));

        for (UUID id : List.of(minimum, tenOff, quiet)) {
            JsonNode view = adminView(id);
            change(view.get("promotion"), id, "ENDED", view.get("version").asLong()).andExpect(status().isOk());
        }
        quote(bob, cart(null, biryani, 1)).andExpect(status().isOk()).andExpect(jsonPath("$.discountPaise").value(0))
                .andExpect(jsonPath("$.promotion").doesNotExist());
        reserve(bob, cart(null, biryani, 1)).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("NO_OFFER_APPLIES"));
    }

    @Test
    void staffPageRedemptionsAndTasteDataCoversThem() throws Exception {
        UUID feast = live(flat("FEAST", 5000, 0, 2, 1_000_000, null));
        String alices = id(reserve(alice, cart("FEAST", biryani, 1)).andExpect(status().isCreated()));
        confirm(alice, alices, UUID.randomUUID()).andExpect(status().isOk());
        CLOCK.advance(Duration.ofSeconds(1));
        String bobs = id(reserve(bob, cart("FEAST", biryani, 1)).andExpect(status().isCreated()));

        String first = mvc.perform(get(BASE + "/admin/promotions/" + feast + "/redemptions").param("limit", "1").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(bobs)).andExpect(jsonPath("$.nextCursor").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        mvc.perform(get(BASE + "/admin/promotions/" + feast + "/redemptions").param("limit", "1")
                        .param("cursor", json.readTree(first).get("nextCursor").asText()).header("Authorization", bearer(UUID.randomUUID(), "AUDIT_ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(alices)).andExpect(jsonPath("$.nextCursor").doesNotExist());
        mvc.perform(get(BASE + "/admin/promotions/" + feast + "/redemptions").header("Authorization", alice)).andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/admin/promotions/" + UUID.randomUUID() + "/redemptions").header("Authorization", admin)).andExpect(status().isNotFound());

        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", alice)).andExpect(status().isOk())
                .andExpect(jsonPath("$.promotions.redemptions[0].id").value(alices));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", alice).header("X-Confirm-Erase", "ERASE")).andExpect(status().isOk());
        // A used discount stays counted against the budget, without the person.
        assertThat(jdbc.queryForObject("SELECT person_id FROM adv_promotions.redemption WHERE id = ?", UUID.class, UUID.fromString(alices)))
                .isEqualTo(PromotionsService.ERASED);
        assertThat(adminView(feast).get("committedPaise").asLong()).isEqualTo(10000);

        mvc.perform(delete(BASE + "/redemptions/" + bobs).header("Authorization", bob)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", bob).header("X-Confirm-Erase", "ERASE")).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_promotions.redemption WHERE id = ?", Integer.class, UUID.fromString(bobs))).isZero();
    }
}
