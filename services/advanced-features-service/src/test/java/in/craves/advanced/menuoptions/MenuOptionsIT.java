package in.craves.advanced.menuoptions;

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
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class MenuOptionsIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/menu-options";
    static final String OPTIONS = """
            {"groups":[
              {"name":"Rice","minSelect":1,"maxSelect":1,"choices":[{"name":"Jeera rice","priceDeltaPaise":0},{"name":"Ghee rice","priceDeltaPaise":2500}]},
              {"name":"Add-ons","minSelect":0,"maxSelect":2,"choices":[{"name":"Raita","priceDeltaPaise":3000},
                {"name":"Boiled egg","priceDeltaPaise":2000},{"name":"Salan","priceDeltaPaise":1500,"available":false}]}],
             "mealPeriods":["LUNCH"]}
            """;
    static final String HOURS = """
            {"periods":[{"period":"LUNCH","startsAt":"12:00","endsAt":"15:00"},
                        {"period":"DINNER","startsAt":"19:00","endsAt":"23:00","days":["FRIDAY","SATURDAY"]}]}
            """;
    // 2 Nov 2026 is a Monday: 07:30 UTC is 13:00 in India (lunch), 11:30 UTC is 17:00 (no meal).
    static final String LUNCHTIME = "2026-11-02T07:30:00Z";
    @Autowired
    ObjectMapper json;
    UUID kitchen;
    String chef;
    String customer;
    MenuItem biryani;

    @BeforeEach
    void kitchen() {
        kitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Chicken dum biryani", 32000);
        chef = bearer(UUID.randomUUID(), "CUSTOMER", "CHEF");
        CATALOG.chefKitchens.put(chef.substring("Bearer ".length()), kitchen);
        customer = bearer(UUID.randomUUID(), "CUSTOMER");
    }

    ResultActions chefPut(String path, String body) throws Exception {
        return mvc.perform(put(BASE + "/chef" + path).header("Authorization", chef).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    ResultActions quote(String body) throws Exception {
        return mvc.perform(post(BASE + "/quote").header("Authorization", customer).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    String choice(JsonNode options, int group, int choice) {
        return options.at("/groups/" + group + "/choices/" + choice + "/id").asText();
    }

    @Test
    void chefSetsOptionsAndMealHoursCustomersGetLivePriceQuotes() throws Exception {
        mvc.perform(get(BASE + "/chef/menu-items/" + biryani.id()).header("Authorization", chef))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(0)).andExpect(jsonPath("$.kitchenId").value(kitchen.toString()));
        chefPut("/menu-items/" + biryani.id(), OPTIONS).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PERIOD_NOT_DEFINED")).andExpect(jsonPath("$.details[0]").value("LUNCH"));

        chefPut("/meal-periods", HOURS).andExpect(status().isOk()).andExpect(jsonPath("$.periods.length()").value(2))
                .andExpect(jsonPath("$.periods[0].days.length()").value(7)).andExpect(jsonPath("$.timeZone").value("Asia/Kolkata"));
        mvc.perform(get(BASE + "/kitchens/" + kitchen + "/meal-periods")).andExpect(status().isOk())
                .andExpect(jsonPath("$.periods[1].period").value("DINNER")).andExpect(jsonPath("$.servingNow").isArray());

        String saved = chefPut("/menu-items/" + biryani.id(), OPTIONS).andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1)).andExpect(jsonPath("$.mealPeriods[0]").value("LUNCH"))
                .andExpect(jsonPath("$.groups[1].choices[2].available").value(false))
                .andReturn().getResponse().getContentAsString();
        JsonNode options = json.readTree(saved);
        String ghee = choice(options, 0, 1);
        String raita = choice(options, 1, 0);
        String salan = choice(options, 1, 2);
        mvc.perform(get(BASE + "/menu-items/" + biryani.id())).andExpect(status().isOk()).andExpect(jsonPath("$.groups[0].choices[1].id").value(ghee));

        String order = "{\"menuItemId\":\"" + biryani.id() + "\",\"quantity\":2,\"choiceIds\":[%s],\"at\":\"%s\"}";
        quote(order.formatted("\"" + ghee + "\",\"" + raita + "\"", LUNCHTIME)).andExpect(status().isOk())
                .andExpect(jsonPath("$.basePricePaise").value(32000)).andExpect(jsonPath("$.unitPricePaise").value(37500))
                .andExpect(jsonPath("$.totalPaise").value(75000)).andExpect(jsonPath("$.mealPeriod").value("LUNCH"))
                .andExpect(jsonPath("$.choices[0].choiceName").value("Ghee rice")).andExpect(jsonPath("$.optionsVersion").value(1));
        quote(order.formatted("\"" + ghee + "\"", "2026-11-02T11:30:00Z")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_SERVED_AT_THIS_TIME"));
        quote(order.formatted("\"" + raita + "\"", LUNCHTIME)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SELECTION_INVALID"))
                .andExpect(jsonPath("$.details[0]").value("Rice: choose exactly 1"));
        quote(order.formatted("\"" + ghee + "\",\"" + salan + "\"", LUNCHTIME)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CHOICE_UNAVAILABLE"));
        quote(order.formatted("\"" + UUID.randomUUID() + "\"", LUNCHTIME)).andExpect(jsonPath("$.code").value("UNKNOWN_CHOICE"));
        mvc.perform(post(BASE + "/quote").contentType(MediaType.APPLICATION_JSON).content(order.formatted("", LUNCHTIME)))
                .andExpect(status().isUnauthorized());
        CATALOG.unavailable.add(biryani.id());
        quote(order.formatted("\"" + ghee + "\"", LUNCHTIME)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ITEM_UNAVAILABLE"));
        CATALOG.unavailable.clear();

        // Lunch hours cannot be dropped while a dish is labelled lunch.
        chefPut("/meal-periods", "{\"periods\":[{\"period\":\"DINNER\",\"startsAt\":\"19:00\",\"endsAt\":\"23:00\"}]}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PERIOD_IN_USE"));

        // Editing keeps choice ids (sent back), so carts holding them stay valid; stale versions are refused.
        String edited = saved.replace("\"priceDeltaPaise\":2500", "\"priceDeltaPaise\":3500");
        mvc.perform(put(BASE + "/chef/menu-items/" + biryani.id()).header("Authorization", chef).header("If-Match", "\"1\"")
                        .contentType(MediaType.APPLICATION_JSON).content(editRequest(edited)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.groups[0].choices[1].id").value(ghee));
        mvc.perform(put(BASE + "/chef/menu-items/" + biryani.id()).header("Authorization", chef).header("If-Match", "\"1\"")
                        .contentType(MediaType.APPLICATION_JSON).content(editRequest(edited)))
                .andExpect(status().isPreconditionFailed());
        quote(order.formatted("\"" + ghee + "\"", LUNCHTIME)).andExpect(jsonPath("$.unitPricePaise").value(35500));

        mvc.perform(post(BASE + "/menu-items/lookup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"menuItemIds\":[\"" + biryani.id() + "\",\"" + UUID.randomUUID() + "\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(delete(BASE + "/chef/menu-items/" + biryani.id()).header("Authorization", chef)).andExpect(status().isNoContent());
        mvc.perform(get(BASE + "/menu-items/" + biryani.id())).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("OPTIONS_NOT_FOUND"));
        quote(order.formatted("", "2026-11-02T11:30:00Z")).andExpect(status().isOk()).andExpect(jsonPath("$.unitPricePaise").value(32000))
                .andExpect(jsonPath("$.mealPeriod").doesNotExist());
    }

    /** The saved view minus the fields a request does not take. */
    String editRequest(String view) throws Exception {
        JsonNode node = json.readTree(view);
        return json.writeValueAsString(java.util.Map.of("groups", node.get("groups"), "mealPeriods", node.get("mealPeriods")));
    }

    @Test
    void onlyTheOwningChefChangesOptionsAndHours() throws Exception {
        String other = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(other.substring("Bearer ".length()), UUID.randomUUID());
        mvc.perform(put(BASE + "/chef/menu-items/" + biryani.id()).header("Authorization", other).contentType(MediaType.APPLICATION_JSON)
                .content("{\"groups\":[]}")).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_YOUR_MENU_ITEM"));
        mvc.perform(put(BASE + "/chef/meal-periods").header("Authorization", other).contentType(MediaType.APPLICATION_JSON).content(HOURS))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("KITCHEN_HAS_NO_DISHES"));
        mvc.perform(get(BASE + "/chef/meal-periods").header("Authorization", customer)).andExpect(status().isForbidden());
        chefPut("/menu-items/" + biryani.id(), "{\"groups\":[{\"name\":\"Rice\",\"minSelect\":2,\"maxSelect\":1,\"choices\":[{\"name\":\"Plain\",\"priceDeltaPaise\":0}]}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_OPTIONS"));
        chefPut("/menu-items/" + biryani.id(), "{\"groups\":[{\"name\":\"Rice\",\"minSelect\":1,\"maxSelect\":1,\"choices\":[{\"name\":\"Plain\",\"priceDeltaPaise\":-100}]}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        chefPut("/meal-periods", "{\"periods\":[{\"period\":\"LUNCH\",\"startsAt\":\"12:00\",\"endsAt\":\"12:00\"}]}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("EMPTY_WINDOW"));
    }
}
