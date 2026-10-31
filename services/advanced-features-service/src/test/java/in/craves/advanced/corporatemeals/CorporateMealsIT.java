package in.craves.advanced.corporatemeals;

import static org.assertj.core.api.Assertions.assertThat;
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
import in.craves.advanced.support.IntegrationTestBase;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

class CorporateMealsIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/corporate-meals";
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;
    MenuItem biryani;
    MenuItem idli;
    UUID managerId;
    UUID aliceId;
    UUID bobId;
    String admin;
    String manager;
    String alice;
    String bob;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM adv_corporate_meals.charge");
        jdbc.update("DELETE FROM adv_corporate_meals.invite");
        jdbc.update("DELETE FROM adv_corporate_meals.member");
        jdbc.update("DELETE FROM adv_corporate_meals.company");
        jdbc.update("DELETE FROM adv_platform.audit_event WHERE module = 'corporate-meals'");
        // Every test runs on a Monday at 13:00 India time (inside the terms' lunch window), early enough in the month that the
        // days after it stay in the same month.
        ZonedDateTime lunch = CLOCK.instant().atZone(INDIA).with(TemporalAdjusters.next(DayOfWeek.MONDAY)).withHour(13).withMinute(0)
                .withSecond(0).withNano(0);
        while (lunch.getDayOfMonth() > 20) lunch = lunch.plusWeeks(1);
        CLOCK.advance(Duration.between(CLOCK.instant(), lunch.toInstant()));
        UUID kitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Chicken dum biryani", 32000);
        idli = CATALOG.add(kitchen, "Idli sambar", 9000);
        managerId = UUID.randomUUID();
        aliceId = UUID.randomUUID();
        bobId = UUID.randomUUID();
        tokens();
    }

    /** Test tokens expire 24 hours after they are minted, so tests that move the clock a day mint new ones. */
    void tokens() {
        admin = bearer(UUID.randomUUID(), "PAYMENTS_ADMIN");
        manager = bearer(managerId, "CUSTOMER");
        alice = bearer(aliceId, "CUSTOMER");
        bob = bearer(bobId, "CUSTOMER");
    }

    ResultActions send(MockHttpServletRequestBuilder request, String auth, Object body) throws Exception {
        return mvc.perform(request.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(body instanceof String text ? text : json.writeValueAsString(body)));
    }

    JsonNode body(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    Map<String, Object> terms(int percent, long maxPerMeal, int mealsPerDay, long budget, Long memberCap) {
        Map<String, Object> terms = new LinkedHashMap<>();
        terms.put("sharePercent", percent);
        terms.put("maxPerMealPaise", maxPerMeal);
        terms.put("mealsPerDay", mealsPerDay);
        terms.put("mealDays", List.of("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"));
        terms.put("windowStart", "11:00");
        terms.put("windowEnd", "15:00");
        terms.put("monthlyBudgetPaise", budget);
        terms.put("memberMonthlyCapPaise", memberCap);
        terms.put("paymentTermsDays", 30);
        return terms;
    }

    /** A company with its terms set and the manager in place; returns its id. */
    UUID company(int seats, Map<String, Object> terms) throws Exception {
        JsonNode created = body(send(post(BASE + "/admin/companies"), admin, Map.of("name", "Acme Software", "seatLimit", seats))
                .andExpect(status().isCreated()));
        UUID id = UUID.fromString(created.get("id").asText());
        send(put(BASE + "/admin/companies/" + id + "/terms"), admin, Map.of("terms", terms, "expectedVersion", 1)).andExpect(status().isOk());
        send(put(BASE + "/admin/companies/" + id + "/members/" + managerId), admin, Map.of("role", "MANAGER", "displayName", "Meera (HR)"))
                .andExpect(status().isOk());
        return id;
    }

    String invite(int maxUses) throws Exception {
        return body(send(post(BASE + "/manager/invites"), manager, Map.of("expiresInDays", 7, "maxUses", maxUses)).andExpect(status().isCreated()))
                .get("code").asText();
    }

    ResultActions join(String auth, String code, String name) throws Exception {
        return send(post(BASE + "/join"), auth, Map.of("code", code, "displayName", name));
    }

    String cart(String kind, Integer headcount, Object... dishesAndQuantities) throws Exception {
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < dishesAndQuantities.length; i += 2) {
            items.add(Map.of("menuItemId", ((MenuItem) dishesAndQuantities[i]).id(), "quantity", dishesAndQuantities[i + 1]));
        }
        Map<String, Object> cart = new LinkedHashMap<>();
        cart.put("kind", kind);
        cart.put("headcount", headcount);
        cart.put("items", items);
        return json.writeValueAsString(cart);
    }

    ResultActions reserve(String auth, String cart) throws Exception {
        return send(post(BASE + "/charges"), auth, cart);
    }

    ResultActions confirm(String auth, String chargeId, UUID orderId) throws Exception {
        return send(post(BASE + "/charges/" + chargeId + "/confirm"), auth, Map.of("orderId", orderId));
    }

    String id(ResultActions result) throws Exception {
        return body(result).get("id").asText();
    }

    @Test
    void staffSetUpCompaniesTermsAndManagers() throws Exception {
        send(post(BASE + "/admin/companies"), alice, Map.of("name", "Acme", "seatLimit", 10)).andExpect(status().isForbidden());
        send(post(BASE + "/admin/companies"), bearer(UUID.randomUUID(), "SUPPORT_ADMIN"), Map.of("name", "Acme", "seatLimit", 10))
                .andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/admin/companies")).andExpect(status().isUnauthorized());
        JsonNode created = body(send(post(BASE + "/admin/companies"), admin, Map.of("name", "  Acme Software ", "seatLimit", 2))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.terms").doesNotExist()));
        UUID id = UUID.fromString(created.get("id").asText());
        assertThat(created.get("name").asText()).isEqualTo("Acme Software");

        // A company pays nothing until staff set its terms.
        send(put(BASE + "/admin/companies/" + id + "/members/" + managerId), admin, Map.of("role", "MANAGER", "displayName", "Meera"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("MANAGER"));
        send(post(BASE + "/quote"), manager, cart("MEAL", null, biryani, 1)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("COMPANY_TERMS_NOT_SET"));
        mvc.perform(get(BASE + "/me").header("Authorization", manager)).andExpect(status().isOk()).andExpect(jsonPath("$.allowance").doesNotExist())
                .andExpect(jsonPath("$.payingNow").value(false));

        Map<String, Object> backwards = terms(50, 15000, 1, 1_000_000, null);
        backwards.put("windowStart", "16:00");
        send(put(BASE + "/admin/companies/" + id + "/terms"), admin, Map.of("terms", backwards, "expectedVersion", 1))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_MEAL_WINDOW"));
        Map<String, Object> noBudget = terms(50, 15000, 1, 1_000_000, null);
        noBudget.remove("monthlyBudgetPaise");
        send(put(BASE + "/admin/companies/" + id + "/terms"), admin, Map.of("terms", noBudget, "expectedVersion", 1)).andExpect(status().isBadRequest());
        send(put(BASE + "/admin/companies/" + id + "/terms"), admin, Map.of("terms", terms(50, 15000, 1, 1_000_000, null), "expectedVersion", 7))
                .andExpect(status().isPreconditionFailed());
        send(put(BASE + "/admin/companies/" + id + "/terms"), admin, Map.of("terms", terms(50, 15000, 1, 1_000_000, null), "expectedVersion", 1))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.terms.sharePercent").value(50))
                .andExpect(jsonPath("$.terms.mealDays.length()").value(5)).andExpect(jsonPath("$.members").value(1));
        mvc.perform(get(BASE + "/admin/companies").header("Authorization", bearer(UUID.randomUUID(), "AUDIT_ADMIN"))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(id.toString())).andExpect(jsonPath("$[0].monthCommittedPaise").value(0));

        // Seats, one company per person, suspension.
        send(put(BASE + "/admin/companies/" + id + "/members/" + aliceId), admin, Map.of("role", "MEMBER", "displayName", "Alice"))
                .andExpect(status().isOk());
        send(put(BASE + "/admin/companies/" + id + "/members/" + UUID.randomUUID()), admin, Map.of("role", "MEMBER", "displayName", "Carol"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("COMPANY_FULL"));
        UUID other = UUID.fromString(id(send(post(BASE + "/admin/companies"), admin, Map.of("name", "Other Co", "seatLimit", 5))));
        send(put(BASE + "/admin/companies/" + other + "/members/" + aliceId), admin, Map.of("role", "MANAGER", "displayName", "Alice"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IN_ANOTHER_COMPANY"));
        send(put(BASE + "/admin/companies/" + id), admin, Map.of("name", "Acme", "seatLimit", 1, "status", "ACTIVE", "expectedVersion", 2))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("SEATS_BELOW_MEMBERS"));
        send(put(BASE + "/admin/companies/" + id), admin, Map.of("name", "Acme", "seatLimit", 5, "status", "SUSPENDED", "expectedVersion", 2))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUSPENDED")).andExpect(jsonPath("$.version").value(3));
        send(post(BASE + "/quote"), alice, cart("MEAL", null, biryani, 1)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("COMPANY_SUSPENDED"));
        assertThat(jdbc.queryForList("SELECT action FROM adv_platform.audit_event WHERE module = 'corporate-meals' AND entity_id = ? ORDER BY id",
                String.class, id.toString()))
                .containsExactly("COMPANY_CREATED", "MEMBER_ROLE_SET", "TERMS_SET", "MEMBER_ROLE_SET", "COMPANY_SUSPENDED");
    }

    @Test
    void peopleJoinWithInvitesAndManagersRunTheirCompany() throws Exception {
        company(3, terms(50, 15000, 1, 1_000_000, 20000L));
        mvc.perform(get(BASE + "/manager/company").header("Authorization", alice)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NOT_A_COMPANY_MANAGER"));
        send(post(BASE + "/manager/invites"), manager, Map.of("expiresInDays", 7, "maxUses", 4)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_MAX_USES"));
        String code = invite(2);
        assertThat(code).hasSize(43);
        mvc.perform(get(BASE + "/manager/invites").header("Authorization", manager)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].maxUses").value(2)).andExpect(jsonPath("$[0].code").doesNotExist());

        join(alice, "not-a-real-code", "Alice").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("INVITE_NOT_VALID"));
        join(alice, code, "\u2003").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BLANK_TEXT"));
        CLOCK.advance(Duration.ofSeconds(1));
        join(alice, code, "  Alice   K ").andExpect(status().isOk()).andExpect(jsonPath("$.companyName").value("Acme Software"))
                .andExpect(jsonPath("$.role").value("MEMBER")).andExpect(jsonPath("$.displayName").value("Alice K"))
                .andExpect(jsonPath("$.payingNow").value(true)).andExpect(jsonPath("$.mealsLeftToday").value(1))
                .andExpect(jsonPath("$.monthLeftPaise").value(20000)).andExpect(jsonPath("$.allowance.maxPerMealPaise").value(15000))
                .andExpect(jsonPath("$.allowance.monthlyBudgetPaise").doesNotExist());
        join(alice, code, "Alice K").andExpect(status().isOk());
        mvc.perform(get(BASE + "/manager/invites").header("Authorization", manager)).andExpect(jsonPath("$[0].uses").value(1));
        CLOCK.advance(Duration.ofSeconds(1));
        join(bob, code, "Bob").andExpect(status().isOk());
        String carol = bearer(UUID.randomUUID(), "CUSTOMER");
        join(carol, code, "Carol").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("INVITE_NOT_VALID"));
        join(carol, invite(1), "Carol").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("COMPANY_FULL"));

        // Members page in joining order; managers remove members but not managers.
        String first = body(mvc.perform(get(BASE + "/manager/members").param("limit", "2").header("Authorization", manager))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].displayName").value("Meera (HR)"))
                .andExpect(jsonPath("$.items[1].displayName").value("Alice K"))).get("nextCursor").asText();
        mvc.perform(get(BASE + "/manager/members").param("limit", "2").param("cursor", first).header("Authorization", manager))
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].displayName").value("Bob"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
        mvc.perform(delete(BASE + "/manager/members/" + managerId).header("Authorization", manager)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MANAGER_CHANGED_BY_STAFF"));
        mvc.perform(delete(BASE + "/manager/members/" + aliceId).header("Authorization", manager)).andExpect(status().isNoContent());
        mvc.perform(get(BASE + "/me").header("Authorization", alice)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_IN_A_COMPANY"));
        mvc.perform(delete(BASE + "/manager/members/" + aliceId).header("Authorization", manager)).andExpect(status().isNotFound());

        // A revoked or expired invite stops working; a person in another company cannot join.
        CLOCK.advance(Duration.ofSeconds(1));
        String spare = invite(1);
        JsonNode invites = body(mvc.perform(get(BASE + "/manager/invites").header("Authorization", manager)));
        mvc.perform(delete(BASE + "/manager/invites/" + invites.get(0).get("id").asText()).header("Authorization", manager)).andExpect(status().isNoContent());
        join(alice, spare, "Alice").andExpect(status().isNotFound());
        String later = invite(1);
        CLOCK.advance(Duration.ofDays(8));
        tokens();
        join(alice, later, "Alice").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("INVITE_NOT_VALID"));
        mvc.perform(delete(BASE + "/me").header("Authorization", bob)).andExpect(status().isNoContent());
        mvc.perform(delete(BASE + "/me").header("Authorization", bob)).andExpect(status().isNoContent());
        mvc.perform(get(BASE + "/me").header("Authorization", bob)).andExpect(status().isNotFound());
        mvc.perform(delete(BASE + "/manager/invites/" + UUID.randomUUID()).header("Authorization", manager)).andExpect(status().isNotFound());
    }

    @Test
    void membersGetTheirCompanyShareAtCheckout() throws Exception {
        company(10, terms(50, 15000, 1, 1_000_000, 20000L));
        join(alice, invite(5), "Alice").andExpect(status().isOk());
        // Half of 320.00 is 160.00, capped at 150.00 a meal.
        send(post(BASE + "/quote"), alice, cart("MEAL", null, biryani, 1)).andExpect(status().isOk()).andExpect(jsonPath("$.subtotalPaise").value(32000))
                .andExpect(jsonPath("$.companySharePaise").value(15000)).andExpect(jsonPath("$.memberSharePaise").value(17000));
        send(post(BASE + "/quote"), bob, cart("MEAL", null, biryani, 1)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_IN_A_COMPANY"));
        mvc.perform(post(BASE + "/quote").contentType(MediaType.APPLICATION_JSON).content(cart("MEAL", null, biryani, 1))).andExpect(status().isUnauthorized());
        send(post(BASE + "/quote"), alice, cart("MEAL", 3, biryani, 1)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("HEADCOUNT_ONLY_FOR_TEAM_MEALS"));
        send(post(BASE + "/quote"), alice, cart("TEAM_MEAL", 3, biryani, 3)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TEAM_MEALS_ARE_FOR_MANAGERS"));
        CATALOG.unavailable.add(idli.id());
        send(post(BASE + "/quote"), alice, cart("MEAL", null, biryani, 1, idli, 1)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ITEMS_UNAVAILABLE"));

        String body = cart("MEAL", null, biryani, 1);
        ResultActions reserved = mvc.perform(post(BASE + "/charges").header("Authorization", alice).header("Idempotency-Key", "checkout-acme-01")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("RESERVED")).andExpect(jsonPath("$.companySharePaise").value(15000));
        String charge = id(reserved);
        mvc.perform(post(BASE + "/charges").header("Authorization", alice).header("Idempotency-Key", "checkout-acme-01")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(header().string("Idempotent-Replayed", "true")).andExpect(jsonPath("$.id").value(charge));
        reserve(alice, body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CHARGE_RESERVATION_EXISTS"))
                .andExpect(jsonPath("$.details[0]").value(charge));
        UUID order = UUID.randomUUID();
        confirm(bob, charge, order).andExpect(status().isNotFound());
        confirm(alice, charge, order).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.orderId").value(order.toString()));
        confirm(alice, charge, order).andExpect(status().isOk());
        confirm(alice, charge, UUID.randomUUID()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CHARGE_CONFIRMED"));
        mvc.perform(delete(BASE + "/charges/" + charge).header("Authorization", alice)).andExpect(status().isConflict());
        reserve(alice, body).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DAILY_MEALS_USED"));
        mvc.perform(get(BASE + "/me").header("Authorization", alice)).andExpect(jsonPath("$.mealsLeftToday").value(0))
                .andExpect(jsonPath("$.monthLeftPaise").value(5000));

        // The next day only 50.00 of Alice's monthly 200.00 is left; outside the window the company pays nothing.
        CLOCK.advance(Duration.ofDays(1));
        tokens();
        String tuesday = id(reserve(alice, body).andExpect(status().isCreated()).andExpect(jsonPath("$.companySharePaise").value(5000))
                .andExpect(jsonPath("$.memberSharePaise").value(27000)));
        mvc.perform(delete(BASE + "/charges/" + tuesday).header("Authorization", alice)).andExpect(status().isNoContent());
        mvc.perform(delete(BASE + "/charges/" + tuesday).header("Authorization", alice)).andExpect(status().isNoContent());
        confirm(alice, tuesday, UUID.randomUUID()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CHARGE_RELEASED"));
        String lapsing = id(reserve(alice, body).andExpect(status().isCreated()));
        CLOCK.advance(Duration.ofMinutes(11));
        confirm(alice, lapsing, UUID.randomUUID()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CHARGE_EXPIRED"));
        CLOCK.advance(Duration.ofHours(3));
        send(post(BASE + "/quote"), alice, body).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("OUTSIDE_MEAL_HOURS"));

        // Leaving the company ends its payments, even for a reservation already made.
        CLOCK.advance(Duration.ofHours(20));
        tokens();
        String waiting = id(reserve(alice, body).andExpect(status().isCreated()));
        mvc.perform(delete(BASE + "/me").header("Authorization", alice)).andExpect(status().isNoContent());
        confirm(alice, waiting, UUID.randomUUID()).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("COMPANY_NOT_PAYING"));
    }

    @Test
    void budgetsAreNeverOverspentAndTeamMealsAreForManagers() throws Exception {
        UUID companyId = company(20, terms(100, 10000, 2, 25000, null));
        String code = invite(10);
        List<String> people = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            String person = bearer(UUID.randomUUID(), "CUSTOMER");
            join(person, code, "Person " + i).andExpect(status().isOk());
            people.add(person);
        }
        String first = id(reserve(people.get(0), cart("MEAL", null, biryani, 1)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.companySharePaise").value(10000)));
        reserve(people.get(1), cart("MEAL", null, biryani, 1)).andExpect(status().isCreated());
        reserve(people.get(2), cart("MEAL", null, biryani, 1)).andExpect(status().isCreated()).andExpect(jsonPath("$.companySharePaise").value(5000));
        reserve(people.get(3), cart("MEAL", null, biryani, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("COMPANY_BUDGET_USED"));
        mvc.perform(post(BASE + "/admin/charges/" + first + "/void").header("Authorization", bearer(UUID.randomUUID(), "SUPPORT_ADMIN"))
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Order never placed\"}")).andExpect(status().isForbidden());
        send(post(BASE + "/admin/charges/" + first + "/void"), admin, "{\"reason\":\"Order never placed\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("VOIDED"));
        reserve(people.get(3), cart("MEAL", null, biryani, 1)).andExpect(status().isCreated()).andExpect(jsonPath("$.companySharePaise").value(10000));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_platform.audit_event WHERE module = 'corporate-meals' AND action = 'CHARGE_VOIDED'",
                Integer.class)).isEqualTo(1);

        // Team meals: managers only, headcount within the seats, the budget still caps them.
        send(post(BASE + "/quote"), manager, cart("TEAM_MEAL", null, biryani, 5)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_HEADCOUNT"));
        send(post(BASE + "/quote"), manager, cart("TEAM_MEAL", 21, biryani, 5)).andExpect(status().isBadRequest());
        jdbc.update("UPDATE adv_corporate_meals.charge SET status = 'RELEASED' WHERE status = 'RESERVED'");
        send(post(BASE + "/quote"), manager, cart("TEAM_MEAL", 2, biryani, 5)).andExpect(status().isOk()).andExpect(jsonPath("$.companySharePaise").value(20000))
                .andExpect(jsonPath("$.memberSharePaise").value(140000));
        send(post(BASE + "/quote"), manager, cart("TEAM_MEAL", 5, biryani, 5)).andExpect(status().isOk()).andExpect(jsonPath("$.companySharePaise").value(25000));

        // Six people at once against a budget for two meals: exactly two get the company's share.
        send(put(BASE + "/admin/companies/" + companyId + "/terms"), admin, Map.of("terms", terms(100, 10000, 2, 20000, null), "expectedVersion", 2))
                .andExpect(status().isOk());
        List<String> rush = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            String person = bearer(UUID.randomUUID(), "CUSTOMER");
            join(person, code, "Rush " + i).andExpect(status().isOk());
            rush.add(person);
        }
        ExecutorService pool = Executors.newFixedThreadPool(6);
        List<Future<Integer>> results = new ArrayList<>();
        String meal = cart("MEAL", null, biryani, 1);
        for (String person : rush) results.add(pool.submit(() -> reserve(person, meal).andReturn().getResponse().getStatus()));
        pool.shutdown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> result : results) statuses.add(result.get());
        assertThat(statuses).filteredOn(code201 -> code201 == 201).hasSize(2);
        assertThat(statuses).filteredOn(code409 -> code409 == 409).hasSize(4);
        assertThat(jdbc.queryForObject("SELECT sum(company_share_paise) FROM adv_corporate_meals.charge WHERE status = 'RESERVED'", Long.class))
                .isEqualTo(20000L);
    }

    @Test
    void statementsBillConfirmedMealsAndTasteDataCoversThem() throws Exception {
        UUID companyId = company(10, terms(50, 15000, 2, 1_000_000, null));
        join(alice, invite(5), "Alice").andExpect(status().isOk());
        confirm(alice, id(reserve(alice, cart("MEAL", null, biryani, 1)).andExpect(status().isCreated())), UUID.randomUUID()).andExpect(status().isOk());
        confirm(alice, id(reserve(alice, cart("MEAL", null, idli, 1)).andExpect(status().isCreated())), UUID.randomUUID()).andExpect(status().isOk());
        confirm(manager, id(reserve(manager, cart("TEAM_MEAL", 4, biryani, 4)).andExpect(status().isCreated())), UUID.randomUUID())
                .andExpect(status().isOk());
        reserve(alice, cart("MEAL", null, idli, 1)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DAILY_MEALS_USED"));

        YearMonth month = YearMonth.from(CLOCK.instant().atZone(INDIA));
        // Alice: 150.00 + 45.00; the team meal: half of 1,280.00 = 640.00, under 4 × 150.00 = 600.00, so 600.00.
        mvc.perform(get(BASE + "/manager/statement").header("Authorization", manager)).andExpect(status().isOk())
                .andExpect(jsonPath("$.month").value(month.toString())).andExpect(jsonPath("$.dueDate").value(month.atEndOfMonth().plusDays(30).toString()))
                .andExpect(jsonPath("$.meals").value(2)).andExpect(jsonPath("$.teamMeals").value(1))
                .andExpect(jsonPath("$.subtotalPaise").value(32000 + 9000 + 128000)).andExpect(jsonPath("$.companySharePaise").value(15000 + 4500 + 60000))
                .andExpect(jsonPath("$.people[0].displayName").value("Meera (HR)")).andExpect(jsonPath("$.people[1].companySharePaise").value(19500));
        mvc.perform(get(BASE + "/admin/companies/" + companyId + "/statement").param("month", month.toString())
                .header("Authorization", bearer(UUID.randomUUID(), "AUDIT_ADMIN"))).andExpect(status().isOk()).andExpect(jsonPath("$.meals").value(2));
        mvc.perform(get(BASE + "/admin/companies/" + companyId + "/statement").param("month", month.minusMonths(1).toString())
                .header("Authorization", admin)).andExpect(jsonPath("$.meals").value(0)).andExpect(jsonPath("$.people.length()").value(0));
        mvc.perform(get(BASE + "/manager/statement").param("month", "November").header("Authorization", manager)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_MONTH"));
        mvc.perform(get(BASE + "/manager/statement").header("Authorization", alice)).andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", alice)).andExpect(status().isOk())
                .andExpect(jsonPath("$['corporate-meals'].membership.displayName").value("Alice"))
                .andExpect(jsonPath("$['corporate-meals'].charges.length()").value(2))
                .andExpect(jsonPath("$['corporate-meals'].namesOnCharges[0]").value("Alice"));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", alice).header("X-Confirm-Erase", "ERASE")).andExpect(status().isOk());
        mvc.perform(get(BASE + "/me").header("Authorization", alice)).andExpect(status().isNotFound());
        // Alice's meals stay on the company's statement, without her.
        mvc.perform(get(BASE + "/manager/statement").header("Authorization", manager)).andExpect(jsonPath("$.companySharePaise").value(79500))
                .andExpect(jsonPath("$.people[1].personId").value(CorporateMealsService.ERASED.toString()))
                .andExpect(jsonPath("$.people[1].displayName").doesNotExist());
        // A manager who erases their data leaves no trace on the invites they made.
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", manager).header("X-Confirm-Erase", "ERASE")).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_corporate_meals.invite WHERE created_by = ?", Integer.class, managerId)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_corporate_meals.invite", Integer.class)).isEqualTo(1);
    }
}
