package in.craves.advanced.promotions;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

/** M24a internal confirm/release; same properties as AccountErasureIT so both share one Spring context. */
@TestPropertySource(properties = {
        "craves.internal.service-secret=" + PromotionsInternalIT.SECRET,
        "CRAVES_ADV_TASTE_MEMORY_ENABLED=false",
        "CRAVES_ADV_PARTNER_OFFERS_ENABLED=false"})
class PromotionsInternalIT extends IntegrationTestBase {
    static final String SECRET = "test-internal-secret-0123456789"; // same as AccountErasureIT
    static final String BASE = "/api/v1/advanced/promotions";
    static final String INTERNAL = "/internal/v1/promotions/redemptions/";
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;
    MenuItem biryani;
    String admin;
    UUID alice;
    UUID bob;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM adv_promotions.redemption");
        jdbc.update("DELETE FROM adv_promotions.promotion");
        biryani = CATALOG.add(UUID.randomUUID(), "Chicken dum biryani", 32000);
        admin = bearer(UUID.randomUUID(), "PAYMENTS_ADMIN");
        alice = UUID.randomUUID();
        bob = UUID.randomUUID();
    }

    void live(long flatPaise, long budget, Integer maxRedemptions) throws Exception {
        Instant now = CLOCK.instant();
        var terms = new NewPromotion("Internal TREAT", "Offer TREAT", "Terms apply", "TREAT", DiscountKind.FLAT, null, flatPaise, null, 0L,
                List.of(), FundedBy.CRAVES, 5, budget, maxRedemptions, now.minus(Duration.ofHours(1)), now.plus(Duration.ofDays(7)), true);
        JsonNode created = json.readTree(mvc.perform(post(BASE + "/admin/promotions").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(terms))).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        ObjectNode body = json.createObjectNode();
        body.set("promotion", created.get("promotion"));
        body.put("status", "ACTIVE");
        body.put("expectedVersion", created.get("version").asLong());
        mvc.perform(put(BASE + "/admin/promotions/" + created.get("id").asText()).header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))).andExpect(status().isOk());
    }

    String reserve(UUID person) throws Exception {
        String cart = json.writeValueAsString(Map.of("code", "TREAT", "items", List.of(Map.of("menuItemId", biryani.id(), "quantity", 1))));
        return json.readTree(mvc.perform(post(BASE + "/redemptions").header("Authorization", bearer(person, "CUSTOMER"))
                .contentType(MediaType.APPLICATION_JSON).content(cart)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()).get("id").asText();
    }

    ResultActions internal(String redemption, String action, String secret, Map<String, Object> body) throws Exception {
        var request = post(INTERNAL + redemption + "/" + action).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        if (secret != null) request.header("X-Craves-Internal-Secret", secret);
        return mvc.perform(request);
    }

    @Test
    void checkoutTermsShowFundingAndLimitToTheSecretHolderForTheOwnerOnly() throws Exception {
        live(2000, 100_000, null);
        String redemption = reserve(alice);
        String path = INTERNAL + redemption + "/checkout-terms";
        mvc.perform(get(path).param("personId", alice.toString())).andExpect(status().isUnauthorized());
        mvc.perform(get(path).param("personId", alice.toString()).header("Authorization", bearer(alice, "CUSTOMER"))).andExpect(status().isUnauthorized());
        mvc.perform(get(path).param("personId", bob.toString()).header("X-Craves-Internal-Secret", SECRET)).andExpect(status().isNotFound());
        mvc.perform(get(path).param("personId", new UUID(0, 0).toString()).header("X-Craves-Internal-Secret", SECRET)).andExpect(status().isNotFound());
        mvc.perform(get(path).param("personId", alice.toString()).header("X-Craves-Internal-Secret", SECRET)).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(redemption)).andExpect(jsonPath("$.fundedBy").value("CRAVES"))
                .andExpect(jsonPath("$.perPersonLimit").value(5)).andExpect(jsonPath("$.discountPaise").value(2000))
                .andExpect(jsonPath("$.status").value("RESERVED"));
    }

    @Test
    void orderServiceConfirmsAndReleasesWithTheSecretOnly() throws Exception {
        live(2000, 100_000, null);
        String redemption = reserve(alice);
        UUID order = UUID.randomUUID();
        Map<String, Object> confirm = Map.of("personId", alice, "orderId", order);
        internal(redemption, "confirm", null, confirm).andExpect(status().isUnauthorized());
        internal(redemption, "confirm", "wrong", confirm).andExpect(status().isUnauthorized());
        mvc.perform(post(INTERNAL + redemption + "/confirm").header("Authorization", bearer(alice, "CUSTOMER"))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(confirm))).andExpect(status().isUnauthorized());
        // Another person's redemption answers like a missing one.
        internal(redemption, "confirm", SECRET, Map.of("personId", bob, "orderId", order)).andExpect(status().isNotFound());
        internal(redemption, "confirm", SECRET, confirm).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED")).andExpect(jsonPath("$.orderId").value(order.toString()));
        internal(redemption, "confirm", SECRET, confirm).andExpect(status().isOk());
        internal(redemption, "confirm", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("REDEMPTION_CONFIRMED"));
        // A used offer is given back only for the order it served (cancelled before fulfilment); the order stays recorded.
        internal(redemption, "release", SECRET, Map.of("personId", alice)).andExpect(status().isConflict());
        internal(redemption, "release", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID())).andExpect(status().isConflict());
        internal(redemption, "release", SECRET, Map.of("personId", alice, "orderId", order)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RELEASED")).andExpect(jsonPath("$.orderId").value(order.toString()));
        internal(redemption, "release", SECRET, Map.of("personId", alice, "orderId", order)).andExpect(status().isOk());
        internal(redemption, "confirm", SECRET, confirm).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REDEMPTION_RELEASED"));
        // An unpaid reservation is released without an order.
        String other = reserve(alice);
        internal(other, "release", SECRET, Map.of("personId", alice)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RELEASED"));
    }

    @Test
    void aLapsedReservationPaidLateIsHonouredOnlyWhileTheBudgetHasRoom() throws Exception {
        live(2000, 4000, null); // room for two discounts
        String late = reserve(alice);
        CLOCK.advance(Duration.ofMinutes(11));
        String bobs = reserve(bob);
        // Alice paid after her reservation lapsed: the budget still has room, so her discount is honoured.
        internal(late, "confirm", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID())).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
        CLOCK.advance(Duration.ofMinutes(11));
        reserve(UUID.randomUUID()); // takes the room Bob's lapsed reservation left
        internal(bobs, "confirm", SECRET, Map.of("personId", bob, "orderId", UUID.randomUUID())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REDEMPTION_EXPIRED"));
    }

    @Test
    void aCustomerReleaseAfterPayingStillCountsAndTheCapHolds() throws Exception {
        live(2000, 100_000, 1); // one redemption only
        String paid = reserve(alice);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(BASE + "/redemptions/" + paid)
                .header("Authorization", bearer(alice, "CUSTOMER"))).andExpect(status().isNoContent());
        String bobs = reserve(bob); // the released one stopped counting, so Bob takes the only redemption
        // Alice had already paid the net amount: her released reservation is honoured only if the cap has room, which it has not.
        internal(paid, "confirm", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REDEMPTION_EXPIRED"));
        internal(bobs, "release", SECRET, Map.of("personId", bob)).andExpect(status().isOk());
        internal(paid, "confirm", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID())).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
        // Erased rows carry a placeholder person that internal callers cannot use.
        internal(paid, "release", SECRET, Map.of("personId", new UUID(0, 0))).andExpect(status().isNotFound());
    }
}
