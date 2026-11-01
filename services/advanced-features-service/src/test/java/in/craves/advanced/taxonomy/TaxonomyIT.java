package in.craves.advanced.taxonomy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
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
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

class TaxonomyIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/taxonomy";
    @Autowired
    TaxonomyRepository repository;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;
    String chef;
    MenuItem biryani;
    MenuItem idli;
    MenuItem dal;

    @BeforeEach
    void kitchen() {
        jdbc.update("DELETE FROM adv_taxonomy.dish_tags");
        UUID kitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Chicken dum biryani", 32000);
        idli = CATALOG.add(kitchen, "Idli sambar", 9000);
        dal = CATALOG.add(kitchen, "Dal makhani", 18000);
        chef = bearer(UUID.randomUUID(), "CUSTOMER", "CHEF");
        CATALOG.chefKitchens.put(chef.substring("Bearer ".length()), kitchen);
    }

    ResultActions label(String auth, UUID dish, String body) throws Exception {
        return mvc.perform(put(BASE + "/chef/menu-items/" + dish).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    ResultActions staffPut(String auth, String path, String body) throws Exception {
        return mvc.perform(put(BASE + "/admin" + path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void seededVocabularyIsPublicTreeOrderedAndUnambiguous() throws Exception {
        assertThat(TaxonomyRules.collisions(repository.terms())).isEmpty();
        mvc.perform(get(BASE + "/vocabulary"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=300")))
                .andExpect(jsonPath("$.cuisines[0].code").value("south-indian"))
                .andExpect(jsonPath("$.cuisines[1].code").value("hyderabadi"))
                .andExpect(jsonPath("$.cuisines[1].parentCode").value("south-indian"))
                .andExpect(jsonPath("$.diets[0].code").value("jain"))
                .andExpect(jsonPath("$.disclaimer").isNotEmpty());
        mvc.perform(get(BASE + "/resolve").param("labels", "Hyd,  andhra STYLE ,Sattvic,Pizza"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("hyderabadi"))
                .andExpect(jsonPath("$[1].code").value("andhra"))
                .andExpect(jsonPath("$[2].code").value("satvik"))
                .andExpect(jsonPath("$[2].kind").value("DIET"))
                .andExpect(jsonPath("$[3].label").value("Pizza"))
                .andExpect(jsonPath("$[3].code").doesNotExist());
        mvc.perform(get(BASE + "/resolve")).andExpect(status().isBadRequest());
    }

    @Test
    void chefLabelsDishesAndCustomersBrowseByRegionAndDiet() throws Exception {
        mvc.perform(get(BASE + "/menu-items/" + biryani.id())).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TAGS_NOT_FOUND"));
        mvc.perform(get(BASE + "/chef/menu-items/" + biryani.id()).header("Authorization", chef))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(0));

        label(chef, biryani.id(), "{\"cuisines\":[\"hyderabadi\",\"mughlai\",\"hyderabadi\"],\"diets\":[\"halal\"]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1)).andExpect(jsonPath("$.cuisines.length()").value(2))
                .andExpect(jsonPath("$.declaredBy").value("CHEF"));
        label(chef, idli.id(), "{\"cuisines\":[\"udupi\"],\"diets\":[\"jain\",\"satvik\"]}").andExpect(status().isOk());
        mvc.perform(put(BASE + "/chef/menu-items/" + dal.id()).header("Authorization", chef).header("If-Match", "\"0\"")
                .contentType(MediaType.APPLICATION_JSON).content("{\"cuisines\":[\"punjabi\"],\"diets\":[\"no-onion-garlic\"]}")).andExpect(status().isOk());

        mvc.perform(get(BASE + "/menu-items/" + biryani.id())).andExpect(status().isOk())
                .andExpect(jsonPath("$.cuisines[0].name").value("Hyderabadi")).andExpect(jsonPath("$.cuisines[1].code").value("mughlai"))
                .andExpect(jsonPath("$.diets[0].code").value("halal")).andExpect(jsonPath("$.declaredBy").value("CHEF"));

        // A region finds every level below it: Udupi sits under Karnataka, under South Indian.
        mvc.perform(get(BASE + "/menu-items").param("cuisine", "south-indian")).andExpect(status().isOk())
                .andExpect(jsonPath("$.menuItemIds", containsInAnyOrder(biryani.id().toString(), idli.id().toString())));
        mvc.perform(get(BASE + "/menu-items").param("cuisine", "SOUTH-INDIAN").param("diets", "jain"))
                .andExpect(jsonPath("$.menuItemIds.length()").value(1)).andExpect(jsonPath("$.menuItemIds[0]").value(idli.id().toString()));
        mvc.perform(get(BASE + "/menu-items").param("diets", "jain,satvik")).andExpect(jsonPath("$.menuItemIds.length()").value(1));
        mvc.perform(get(BASE + "/menu-items").param("diets", "jain,halal")).andExpect(jsonPath("$.menuItemIds.length()").value(0));
        String first = mvc.perform(get(BASE + "/menu-items").param("cuisine", "north-indian").param("limit", "1"))
                .andExpect(jsonPath("$.menuItemIds.length()").value(1)).andExpect(jsonPath("$.nextCursor").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        mvc.perform(get(BASE + "/menu-items").param("cuisine", "north-indian").param("limit", "1")
                        .param("cursor", json.readTree(first).get("nextCursor").asText()))
                .andExpect(jsonPath("$.menuItemIds.length()").value(1)).andExpect(jsonPath("$.nextCursor").doesNotExist());
        mvc.perform(get(BASE + "/menu-items")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("FILTER_REQUIRED"));
        mvc.perform(get(BASE + "/menu-items").param("cuisine", "atlantis"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNKNOWN_TERM")).andExpect(jsonPath("$.details[0]").value("atlantis"));

        mvc.perform(post(BASE + "/menu-items/lookup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"menuItemIds\":[\"" + biryani.id() + "\",\"" + idli.id() + "\",\"" + UUID.randomUUID() + "\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));

        mvc.perform(put(BASE + "/chef/menu-items/" + biryani.id()).header("Authorization", chef).header("If-Match", "\"7\"")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"cuisines\":[\"hyderabadi\"]}"))
                .andExpect(status().isPreconditionFailed()).andExpect(jsonPath("$.code").value("VERSION_MISMATCH"));
        label(chef, biryani.id(), "{\"cuisines\":[\"jain\"]}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNKNOWN_TERM"));
        label(chef, biryani.id(), "{\"cuisines\":[]}").andExpect(status().isBadRequest());
        label(chef, biryani.id(), "{\"cuisines\":[\"andhra\",\"tamil\",\"kerala\",\"goan\"]}").andExpect(status().isBadRequest());

        mvc.perform(delete(BASE + "/chef/menu-items/" + dal.id()).header("Authorization", chef)).andExpect(status().isNoContent());
        mvc.perform(get(BASE + "/menu-items/" + dal.id())).andExpect(status().isNotFound());
    }

    @Test
    void onlyTheOwningChefCanLabelADish() throws Exception {
        label(chef, biryani.id(), "{\"cuisines\":[\"hyderabadi\"]}").andExpect(status().isOk());
        String other = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(other.substring("Bearer ".length()), UUID.randomUUID());
        label(other, biryani.id(), "{\"cuisines\":[\"andhra\"]}").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NOT_YOUR_MENU_ITEM"));
        mvc.perform(delete(BASE + "/chef/menu-items/" + biryani.id()).header("Authorization", other)).andExpect(status().isForbidden());
        label(bearer(UUID.randomUUID(), "CUSTOMER"), biryani.id(), "{\"cuisines\":[\"andhra\"]}").andExpect(status().isForbidden());
        mvc.perform(put(BASE + "/chef/menu-items/" + biryani.id()).contentType(MediaType.APPLICATION_JSON).content("{\"cuisines\":[\"andhra\"]}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(BASE + "/admin/terms").header("Authorization", chef)).andExpect(status().isForbidden());
    }

    @Test
    void staffKeepTheVocabularyAndCorrectLabels() throws Exception {
        String admin = bearer(UUID.randomUUID(), "CHEF_ADMIN");
        String nellore = "{\"code\":\"nellore\",\"kind\":\"CUISINE\",\"parentCode\":\"andhra\",\"name\":\"Nellore\",\"aliases\":[\"Nellore style\"],\"sortOrder\":5}";
        mvc.perform(post(BASE + "/admin/terms").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(nellore))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.version").value(1)).andExpect(jsonPath("$.status").value("ACTIVE"));
        mvc.perform(post(BASE + "/admin/terms").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON).content(nellore))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TERM_EXISTS"));
        mvc.perform(post(BASE + "/admin/terms").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"rayalaseema\",\"kind\":\"CUISINE\",\"parentCode\":\"andhra\",\"name\":\"Rayalaseema\",\"aliases\":[\"GUNTUR\"]}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LABEL_IN_USE")).andExpect(jsonPath("$.details[0]").value("guntur"));
        mvc.perform(post(BASE + "/admin/terms").header("Authorization", admin).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"keto\",\"kind\":\"DIET\",\"parentCode\":\"andhra\",\"name\":\"Keto\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DIET_HAS_NO_PARENT"));

        String andhra = "{\"parentCode\":\"%s\",\"name\":\"Andhra\",\"aliases\":[\"andhra style\"],\"sortOrder\":30,\"status\":\"%s\",\"expectedVersion\":1}";
        staffPut(admin, "/terms/andhra", andhra.formatted("nellore", "ACTIVE")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PARENT_CYCLE"));
        staffPut(admin, "/terms/andhra", andhra.formatted("south-indian", "RETIRED"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TERM_HAS_LIVE_CHILDREN"));
        String retireNellore = "{\"parentCode\":\"andhra\",\"name\":\"Nellore\",\"aliases\":[\"Nellore style\"],\"sortOrder\":5,\"status\":\"RETIRED\",\"expectedVersion\":%d}";
        staffPut(admin, "/terms/nellore", retireNellore.formatted(9)).andExpect(status().isPreconditionFailed());

        // A retired term disappears from every public answer and cannot be used again; dishes keep their region.
        label(chef, biryani.id(), "{\"cuisines\":[\"nellore\"]}").andExpect(status().isOk());
        staffPut(admin, "/terms/nellore", retireNellore.formatted(1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RETIRED")).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get(BASE + "/vocabulary")).andExpect(jsonPath("$.cuisines[*].code", not(hasItem("nellore"))));
        mvc.perform(get(BASE + "/menu-items/" + biryani.id())).andExpect(jsonPath("$.cuisines.length()").value(0));
        mvc.perform(get(BASE + "/menu-items").param("cuisine", "andhra")).andExpect(jsonPath("$.menuItemIds[0]").value(biryani.id().toString()));
        mvc.perform(get(BASE + "/resolve").param("labels", "nellore style")).andExpect(jsonPath("$[0].code").doesNotExist());
        label(chef, idli.id(), "{\"cuisines\":[\"nellore\"]}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNKNOWN_TERM"));

        // Staff correct a diet the dish does not meet; the chef's view and the public view say who set the labels.
        label(chef, idli.id(), "{\"cuisines\":[\"udupi\"],\"diets\":[\"jain\"]}").andExpect(status().isOk());
        staffPut(admin, "/menu-items/" + idli.id(), "{\"cuisines\":[\"udupi\"],\"diets\":[],\"expectedVersion\":1}").andExpect(status().isBadRequest());
        staffPut(admin, "/menu-items/" + idli.id(), "{\"cuisines\":[\"udupi\"],\"diets\":[],\"expectedVersion\":1,\"note\":\"Sambar has onion\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.declaredBy").value("STAFF")).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get(BASE + "/menu-items/" + idli.id())).andExpect(jsonPath("$.declaredBy").value("STAFF")).andExpect(jsonPath("$.diets.length()").value(0));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM adv_platform.audit_event WHERE module = 'taxonomy' AND action = 'TAGS_CORRECTED' "
                + "AND entity_id = ?", Integer.class, idli.id().toString())).isEqualTo(1);
        staffPut(admin, "/menu-items/" + UUID.randomUUID(), "{\"cuisines\":[\"udupi\"],\"expectedVersion\":1,\"note\":\"x\"}")
                .andExpect(status().isNotFound());
        mvc.perform(get(BASE + "/admin/terms").header("Authorization", admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].code", hasItem("nellore")));
    }
}
