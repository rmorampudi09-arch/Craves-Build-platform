package in.craves.advanced.semanticsearch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import in.craves.advanced.platform.clients.MenuSearchGateway.FoundDish;
import in.craves.advanced.support.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

class SemanticSearchIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/semantic-search";
    @Autowired
    JdbcTemplate jdbc;
    String admin;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM adv_semantic_search.concept");
        jdbc.update("DELETE FROM adv_platform.audit_event WHERE module = 'semantic-search'");
        admin = bearer(UUID.randomUUID(), "PLATFORM_ADMIN");
    }

    String concept(String body) throws Exception {
        String reply = mvc.perform(post(BASE + "/admin/concepts").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(reply, "$.id");
    }

    FoundDish dish(String name, String foodType, long distance) {
        FoundDish dish = new FoundDish(UUID.randomUUID(), UUID.randomUUID(), "Kitchen", name, null, "Mains", foodType, "MILD", 12000L, distance, null);
        MENU_SEARCH.dishes.add(dish);
        return dish;
    }

    @Test
    void conceptsTurnEverydayPhrasesIntoCatalogSearches() throws Exception {
        concept("{\"phrase\":\"Comfort Food\",\"searchTerms\":[\"Khichdi\",\"dal\"]}");
        concept("{\"phrase\":\"veg\",\"searchTerms\":[],\"foodType\":\"VEG\"}");
        FoundDish khichdi = dish("Moong khichdi", "VEG", 300);
        FoundDish dal = dish("Dal tadka", "VEG", 100);
        dish("Chicken curry", "NON_VEG", 50);

        mvc.perform(get(BASE + "/plan").param("q", "veg comfort food")).andExpect(status().isOk())
                .andExpect(jsonPath("$.matchedPhrases[0]").value("veg")).andExpect(jsonPath("$.matchedPhrases[1]").value("comfort food"))
                .andExpect(jsonPath("$.foodType").value("VEG")).andExpect(jsonPath("$.searches.length()").value(2));
        mvc.perform(get(BASE + "/dishes").param("q", "veg comfort food").param("latitude", "17.4").param("longitude", "78.4")
                        .param("radiusMeters", "5000")).andExpect(status().isOk()).andExpect(jsonPath("$.complete").value(true))
                .andExpect(jsonPath("$.dishes.length()").value(2)).andExpect(jsonPath("$.dishes[0].menuItemId").value(khichdi.menuItemId().toString()))
                .andExpect(jsonPath("$.dishes[1].menuItemId").value(dal.menuItemId().toString()));
        assertThat(MENU_SEARCH.calls).allSatisfy(call -> assertThat(call.foodType()).isEqualTo("VEG"));
        // Unknown words are searched as typed.
        mvc.perform(get(BASE + "/dishes").param("q", "Chicken!").param("latitude", "17.4").param("longitude", "78.4").param("radiusMeters", "5000"))
                .andExpect(jsonPath("$.dishes[0].itemName").value("Chicken curry")).andExpect(jsonPath("$.dishes[0].score").value(2));
    }

    @Test
    void staffMaintainConceptsWithVersionsAndNoDuplicates() throws Exception {
        String id = concept("{\"phrase\":\"comfort food\",\"searchTerms\":[\"khichdi\"]}");
        mvc.perform(post(BASE + "/admin/concepts").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"phrase\":\"COMFORT  food\",\"searchTerms\":[\"dal\"]}")).andExpect(status().isConflict());
        mvc.perform(post(BASE + "/admin/concepts").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"phrase\":\"nothing\",\"searchTerms\":[]}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_CONCEPT"));
        mvc.perform(post(BASE + "/admin/concepts").header("Authorization", bearer(UUID.randomUUID(), "SUPPORT_ADMIN")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"phrase\":\"x\",\"searchTerms\":[\"y\"]}")).andExpect(status().isForbidden());
        mvc.perform(put(BASE + "/admin/concepts/" + id).header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"phrase\":\"comfort food\",\"searchTerms\":[\"khichdi\"],\"active\":false,\"expectedVersion\":9}")).andExpect(status().isPreconditionFailed());
        mvc.perform(put(BASE + "/admin/concepts/" + id).header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phrase\":\"comfort food\",\"searchTerms\":[\"khichdi\"],\"active\":false,\"expectedVersion\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false)).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get(BASE + "/plan").param("q", "comfort food")).andExpect(jsonPath("$.matchedPhrases.length()").value(0));
        mvc.perform(get(BASE + "/admin/concepts").header("Authorization", bearer(UUID.randomUUID(), "SUPPORT_ADMIN")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(BASE + "/admin/concepts")).andExpect(status().isUnauthorized());
        Integer audits = jdbc.queryForObject("SELECT count(*) FROM adv_platform.audit_event WHERE module = 'semantic-search'", Integer.class);
        assertThat(audits).isEqualTo(2);
    }

    @Test
    void badQueriesAndCatalogOutagesAnswerClearly() throws Exception {
        mvc.perform(get(BASE + "/plan").param("q", "!!")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_QUERY"));
        mvc.perform(get(BASE + "/dishes").param("q", "dal").param("latitude", "1e-999999999").param("longitude", "1e999999999").param("radiusMeters", "5000"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_LOCATION"));
        mvc.perform(post(BASE + "/admin/concepts").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                .content("{\"phrase\":\"tiny\",\"searchTerms\":[\"" + "\u3300".repeat(20) + "\"]}")).andExpect(status().isBadRequest());
        assertThat(MENU_SEARCH.calls).isEmpty();
        MENU_SEARCH.down = true;
        mvc.perform(get(BASE + "/dishes").param("q", "dal").param("latitude", "17.4").param("longitude", "78.4").param("radiusMeters", "5000"))
                .andExpect(status().isServiceUnavailable());
    }
}
