package in.craves.advanced.foodfacts;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.support.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class FoodFactsIT extends IntegrationTestBase {
    static final String FACTS = """
            {"ingredients":[{"name":"Basmati rice","allergens":[]},{"name":"Paneer","allergens":["MILK"]},{"name":"Cashew paste","allergens":["TREE_NUTS"]}],
             "allergens":[],"mayContain":["PEANUTS","MILK"],
             "nutrition":{"energyKcal":520,"proteinG":18,"carbohydrateG":62,"sugarsG":6,"fatG":22,"saturatedFatG":9,"fibreG":4,"sodiumMg":900},
             "servingSizeGrams":350,"source":"CHEF_DECLARED","evidenceReference":null}
            """;
    UUID chefId;
    String chef;
    String chefToken;
    MenuItem dish;
    MenuItem plain;

    @BeforeEach
    void kitchen() {
        UUID kitchen = UUID.randomUUID();
        dish = CATALOG.add(kitchen, "Paneer pulao", 21000);
        plain = CATALOG.add(kitchen, "Plain rice", 6000);
        chefId = UUID.randomUUID();
        chef = bearer(chefId, "CUSTOMER", "CHEF");
        chefToken = chef.substring("Bearer ".length());
        CATALOG.chefKitchens.put(chefToken, kitchen);
    }

    @Test
    void chefDeclaresStaffVerifiesCustomersSeeProvenance() throws Exception {
        mvc.perform(get("/api/v1/food-facts/menu-items/" + dish.id())).andExpect(status().isNotFound());
        mvc.perform(put("/api/v1/food-facts/chef/menu-items/" + dish.id()).header("Authorization", chef).contentType(MediaType.APPLICATION_JSON).content(FACTS))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.content.allergens[0]").value("TREE_NUTS"))
                .andExpect(jsonPath("$.content.allergens[1]").value("MILK"))
                .andExpect(jsonPath("$.content.mayContain.length()").value(1))
                .andExpect(jsonPath("$.content.mayContain[0]").value("PEANUTS"));
        mvc.perform(get("/api/v1/food-facts/menu-items/" + dish.id())).andExpect(status().isNotFound());

        mvc.perform(post("/api/v1/food-facts/chef/menu-items/" + dish.id() + "/submit").header("Authorization", chef).header("If-Match", "\"1\""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUBMITTED")).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get("/api/v1/food-facts/menu-items/" + dish.id()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.label").value("CHEF_DECLARED"))
                .andExpect(jsonPath("$.nutrition.energyKcal").value(520)).andExpect(jsonPath("$.disclaimer").isNotEmpty());

        String admin = bearer(UUID.randomUUID(), "COMPLIANCE_ADMIN");
        mvc.perform(get("/api/v1/food-facts/admin/queue").header("Authorization", admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.entries[0].menuItemId").value(dish.id().toString()));
        mvc.perform(post("/api/v1/food-facts/admin/menu-items/" + dish.id() + "/verify").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":1}")).andExpect(status().isPreconditionFailed());
        mvc.perform(post("/api/v1/food-facts/admin/menu-items/" + dish.id() + "/verify").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":2,\"note\":\"label photo matches\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("VERIFIED"));
        mvc.perform(get("/api/v1/food-facts/menu-items/" + dish.id())).andExpect(jsonPath("$.label").value("VERIFIED"));

        // A new declaration replaces the public facts at once (newest recipe wins); a rejection falls back to the last verified facts.
        mvc.perform(put("/api/v1/food-facts/chef/menu-items/" + dish.id()).header("Authorization", chef).contentType(MediaType.APPLICATION_JSON)
                .content(FACTS.replace("\"Cashew paste\"", "\"Peanut paste\"").replace("[\"TREE_NUTS\"]", "[\"PEANUTS\"]"))).andExpect(status().isOk());
        mvc.perform(post("/api/v1/food-facts/chef/menu-items/" + dish.id() + "/submit").header("Authorization", chef)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/food-facts/menu-items/" + dish.id())).andExpect(jsonPath("$.label").value("CHEF_DECLARED"))
                .andExpect(jsonPath("$.ingredients[2].name").value("Peanut paste"));
        mvc.perform(post("/api/v1/food-facts/admin/menu-items/" + dish.id() + "/reject").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":5}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/food-facts/admin/menu-items/" + dish.id() + "/reject").header("Authorization", admin)
                .contentType(MediaType.APPLICATION_JSON).content("{\"expectedVersion\":5,\"note\":\"photo unreadable\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
        mvc.perform(get("/api/v1/food-facts/menu-items/" + dish.id())).andExpect(jsonPath("$.label").value("VERIFIED"))
                .andExpect(jsonPath("$.ingredients[2].name").value("Cashew paste"));
    }

    @Test
    void onlyTheOwningChefCanDeclare() throws Exception {
        String other = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(other.substring("Bearer ".length()), UUID.randomUUID());
        mvc.perform(put("/api/v1/food-facts/chef/menu-items/" + dish.id()).header("Authorization", other).contentType(MediaType.APPLICATION_JSON).content(FACTS))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_YOUR_MENU_ITEM"));
        mvc.perform(put("/api/v1/food-facts/chef/menu-items/" + dish.id()).header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER"))
                .contentType(MediaType.APPLICATION_JSON).content(FACTS)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/food-facts/admin/queue").header("Authorization", chef)).andExpect(status().isForbidden());
    }

    @Test
    void freeFromOnlyListsDishesWithDeclaredFacts() throws Exception {
        String plainFacts = "{\"ingredients\":[{\"name\":\"Rice\",\"allergens\":[]}],\"source\":\"CHEF_DECLARED\"}";
        mvc.perform(put("/api/v1/food-facts/chef/menu-items/" + plain.id()).header("Authorization", chef).contentType(MediaType.APPLICATION_JSON)
                .content(plainFacts)).andExpect(status().isOk()).andExpect(jsonPath("$.warnings[0]").value("NO_ALLERGENS_DECLARED"));
        mvc.perform(post("/api/v1/food-facts/chef/menu-items/" + plain.id() + "/submit").header("Authorization", chef)).andExpect(status().isOk());
        mvc.perform(put("/api/v1/food-facts/chef/menu-items/" + dish.id()).header("Authorization", chef).contentType(MediaType.APPLICATION_JSON).content(FACTS));
        mvc.perform(post("/api/v1/food-facts/chef/menu-items/" + dish.id() + "/submit").header("Authorization", chef)).andExpect(status().isOk());

        mvc.perform(get("/api/v1/food-facts/free-from").param("allergens", "milk,peanuts"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.menuItemIds.length()").value(1))
                .andExpect(jsonPath("$.menuItemIds[0]").value(plain.id().toString()));
        mvc.perform(get("/api/v1/food-facts/free-from").param("allergens", "CHOCOLATE")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/food-facts/menu-items/lookup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"menuItemIds\":[\"" + dish.id() + "\",\"" + UUID.randomUUID() + "\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].hasNutrition").value(true));
        mvc.perform(delete("/api/v1/food-facts/chef/menu-items/" + plain.id()).header("Authorization", chef)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/food-facts/menu-items/" + plain.id())).andExpect(status().isNotFound());
    }

    @Test
    void implausibleNutritionIsFlaggedNotBlocked() throws Exception {
        String odd = FACTS.replace("\"energyKcal\":520", "\"energyKcal\":90").replace("\"sugarsG\":6", "\"sugarsG\":70");
        mvc.perform(put("/api/v1/food-facts/chef/menu-items/" + dish.id()).header("Authorization", chef).contentType(MediaType.APPLICATION_JSON).content(odd))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warnings[0]").value("ENERGY_DOES_NOT_MATCH_MACRONUTRIENTS"))
                .andExpect(jsonPath("$.warnings[1]").value("SUGARS_EXCEED_CARBOHYDRATE"));
        mvc.perform(put("/api/v1/food-facts/chef/menu-items/" + dish.id()).header("Authorization", chef).contentType(MediaType.APPLICATION_JSON)
                .content(FACTS.replace("\"servingSizeGrams\":350", "\"servingSizeGrams\":0"))).andExpect(status().isBadRequest());
    }
}
