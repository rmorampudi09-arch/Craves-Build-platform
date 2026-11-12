package in.craves.advanced.corporatemeals;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.support.IntegrationTestBase;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.LinkedHashMap;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** M24d internal read/confirm/release; same properties as AccountErasureIT and PromotionsInternalIT so all share one Spring context. */
@TestPropertySource(properties = {
        "craves.internal.service-secret=" + CorporateMealsInternalIT.SECRET,
        "CRAVES_ADV_TASTE_MEMORY_ENABLED=false",
        "CRAVES_ADV_PARTNER_OFFERS_ENABLED=false"})
class CorporateMealsInternalIT extends IntegrationTestBase {
    static final String SECRET = "test-internal-secret-0123456789"; // same as AccountErasureIT
    static final String BASE = "/api/v1/advanced/corporate-meals";
    static final String INTERNAL = "/internal/v1/corporate-meals/charges/";
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;
    MenuItem biryani;
    UUID managerId;
    UUID alice;
    UUID bob;
    String admin;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM adv_corporate_meals.charge");
        jdbc.update("DELETE FROM adv_corporate_meals.invite");
        jdbc.update("DELETE FROM adv_corporate_meals.member");
        jdbc.update("DELETE FROM adv_corporate_meals.company");
        // A Monday at 13:00 India time, inside the lunch window, early in the month.
        ZonedDateTime lunch = CLOCK.instant().atZone(ZoneId.of("Asia/Kolkata")).with(TemporalAdjusters.next(DayOfWeek.MONDAY)).withHour(13)
                .withMinute(0).withSecond(0).withNano(0);
        while (lunch.getDayOfMonth() > 20) lunch = lunch.plusWeeks(1);
        CLOCK.advance(Duration.between(CLOCK.instant(), lunch.toInstant()));
        biryani = CATALOG.add(UUID.randomUUID(), "Chicken dum biryani", 32000);
        managerId = UUID.randomUUID();
        alice = UUID.randomUUID();
        bob = UUID.randomUUID();
        admin = bearer(UUID.randomUUID(), "PAYMENTS_ADMIN");
    }

    ResultActions send(MockHttpServletRequestBuilder request, String auth, Object body) throws Exception {
        return mvc.perform(request.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
    }

    JsonNode body(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    /** A company paying half of each meal up to 150.00, with the given monthly budget; alice and bob are members. */
    void company(long budget) throws Exception {
        Map<String, Object> terms = new LinkedHashMap<>();
        terms.put("sharePercent", 50);
        terms.put("maxPerMealPaise", 15000);
        terms.put("mealsPerDay", 2);
        terms.put("mealDays", List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"));
        terms.put("windowStart", "11:00");
        terms.put("windowEnd", "15:00");
        terms.put("monthlyBudgetPaise", budget);
        terms.put("memberMonthlyCapPaise", null);
        terms.put("paymentTermsDays", 30);
        UUID id = UUID.fromString(body(send(post(BASE + "/admin/companies"), admin, Map.of("name", "Acme Software", "seatLimit", 10))
                .andExpect(status().isCreated())).get("id").asText());
        send(put(BASE + "/admin/companies/" + id + "/terms"), admin, Map.of("terms", terms, "expectedVersion", 1)).andExpect(status().isOk());
        for (UUID person : List.of(managerId, alice, bob)) {
            send(put(BASE + "/admin/companies/" + id + "/members/" + person), admin,
                    Map.of("role", person.equals(managerId) ? "MANAGER" : "MEMBER", "displayName", "Person")).andExpect(status().isOk());
        }
    }

    String reserve(UUID person) throws Exception {
        Map<String, Object> cart = Map.of("kind", "MEAL", "items", List.of(Map.of("menuItemId", biryani.id(), "quantity", 1)));
        return body(send(post(BASE + "/charges"), bearer(person, "CUSTOMER"), cart).andExpect(status().isCreated())).get("id").asText();
    }

    ResultActions internal(String charge, String action, String secret, Map<String, Object> body) throws Exception {
        var request = post(INTERNAL + charge + "/" + action).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        if (secret != null) request.header("X-Craves-Internal-Secret", secret);
        return mvc.perform(request);
    }

    @Test
    void checkoutTermsShowTheShareToTheSecretHolderForTheOwnerOnly() throws Exception {
        company(1_000_000);
        String charge = reserve(alice);
        String path = INTERNAL + charge + "/checkout-terms";
        mvc.perform(get(path).param("personId", alice.toString())).andExpect(status().isUnauthorized());
        mvc.perform(get(path).param("personId", alice.toString()).header("Authorization", bearer(alice, "CUSTOMER"))).andExpect(status().isUnauthorized());
        mvc.perform(get(path).param("personId", bob.toString()).header("X-Craves-Internal-Secret", SECRET)).andExpect(status().isNotFound());
        mvc.perform(get(path).param("personId", new UUID(0, 0).toString()).header("X-Craves-Internal-Secret", SECRET)).andExpect(status().isNotFound());
        mvc.perform(get(path).param("personId", alice.toString()).header("X-Craves-Internal-Secret", SECRET)).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(charge)).andExpect(jsonPath("$.subtotalPaise").value(32000))
                .andExpect(jsonPath("$.companySharePaise").value(15000)).andExpect(jsonPath("$.memberSharePaise").value(17000))
                .andExpect(jsonPath("$.status").value("RESERVED"));
    }

    @Test
    void orderServiceConfirmsAndReleasesWithTheSecretOnly() throws Exception {
        company(1_000_000);
        String charge = reserve(alice);
        UUID order = UUID.randomUUID();
        Map<String, Object> confirm = Map.of("personId", alice, "orderId", order);
        internal(charge, "confirm", null, confirm).andExpect(status().isUnauthorized());
        internal(charge, "confirm", "wrong", confirm).andExpect(status().isUnauthorized());
        mvc.perform(post(INTERNAL + charge + "/confirm").header("Authorization", bearer(alice, "CUSTOMER"))
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(confirm))).andExpect(status().isUnauthorized());
        internal(charge, "confirm", SECRET, Map.of("personId", bob, "orderId", order)).andExpect(status().isNotFound());
        internal(charge, "confirm", SECRET, confirm).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED")).andExpect(jsonPath("$.orderId").value(order.toString()));
        internal(charge, "confirm", SECRET, confirm).andExpect(status().isOk());
        internal(charge, "confirm", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CHARGE_CONFIRMED"));
        // A used share is given back only for the order it served (cancelled before fulfilment); the order stays recorded.
        internal(charge, "release", SECRET, Map.of("personId", alice)).andExpect(status().isConflict());
        internal(charge, "release", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID())).andExpect(status().isConflict());
        internal(charge, "release", SECRET, Map.of("personId", alice, "orderId", order)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RELEASED")).andExpect(jsonPath("$.orderId").value(order.toString()));
        internal(charge, "release", SECRET, Map.of("personId", alice, "orderId", order)).andExpect(status().isOk());
        internal(charge, "confirm", SECRET, confirm).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CHARGE_RELEASED"));
        // An unpaid reservation is released without an order.
        String other = reserve(alice);
        internal(other, "release", SECRET, Map.of("personId", alice)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RELEASED"));
        // A share order-service released for a checkout never comes back on a late paid callback.
        UUID failed = UUID.randomUUID();
        String alices = reserve(alice);
        internal(alices, "release", SECRET, Map.of("personId", alice, "orderId", failed)).andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(failed.toString()));
        internal(alices, "confirm", SECRET, Map.of("personId", alice, "orderId", failed)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHARGE_RELEASED"));
    }

    @Test
    void aLapsedOrReleasedChargePaidLateIsHonouredOnlyWhileTheBudgetHasRoom() throws Exception {
        company(30_000); // room for two shares of 150.00
        String late = reserve(alice);
        CLOCK.advance(Duration.ofMinutes(11));
        String bobs = reserve(bob);
        // Alice paid her part after the reservation lapsed: the budget still has room, so the company share is honoured.
        internal(late, "confirm", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID())).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
        // Bob releases his own reservation after paying; meanwhile the manager takes the last room.
        mvc.perform(delete(BASE + "/charges/" + bobs).header("Authorization", bearer(bob, "CUSTOMER"))).andExpect(status().isNoContent());
        String managers = reserve(managerId);
        internal(bobs, "confirm", SECRET, Map.of("personId", bob, "orderId", UUID.randomUUID())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHARGE_EXPIRED"));
        internal(managers, "release", SECRET, Map.of("personId", managerId)).andExpect(status().isOk());
        internal(bobs, "confirm", SECRET, Map.of("personId", bob, "orderId", UUID.randomUUID())).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));
        // Erased rows carry a placeholder person that internal callers cannot use.
        internal(bobs, "release", SECRET, Map.of("personId", new UUID(0, 0))).andExpect(status().isNotFound());
    }

    @Test
    void aLateConfirmKeepsThePersonsDailyMealsAndExpiresAfterADay() throws Exception {
        company(1_000_000); // two meals a day
        String first = reserve(alice);
        mvc.perform(delete(BASE + "/charges/" + first).header("Authorization", bearer(alice, "CUSTOMER"))).andExpect(status().isNoContent());
        String second = reserve(alice);
        internal(second, "confirm", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID())).andExpect(status().isOk());
        String other = reserve(alice);
        internal(other, "confirm", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID())).andExpect(status().isOk());
        // Alice already had her two company meals today: the one she released is not honoured on a late paid callback.
        internal(first, "confirm", SECRET, Map.of("personId", alice, "orderId", UUID.randomUUID())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHARGE_EXPIRED"));
        // Bob's lapsed reservation is honoured on the day, but not a day later.
        String bobs = reserve(bob);
        CLOCK.advance(Duration.ofHours(25));
        internal(bobs, "confirm", SECRET, Map.of("personId", bob, "orderId", UUID.randomUUID())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHARGE_EXPIRED"));
    }
}
