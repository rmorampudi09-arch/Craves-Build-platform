package in.craves.advanced.tastememory;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.support.IntegrationTestBase;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

class TasteMemoryIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/taste-memory";
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ObjectMapper json;
    UUID me;
    String auth;

    @BeforeEach
    void person() {
        me = UUID.randomUUID();
        auth = bearer(me, "CUSTOMER");
    }

    ResultActions putJson(String auth, String path, String body) throws Exception {
        return mvc.perform(put(BASE + path).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    ResultActions lookup(String auth, UUID... ids) throws Exception {
        StringBuilder body = new StringBuilder("{\"menuItemIds\":[");
        for (int i = 0; i < ids.length; i++) body.append(i == 0 ? "" : ",").append('"').append(ids[i]).append('"');
        return mvc.perform(post(BASE + "/menu-items/lookup").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content(body.append("]}").toString()));
    }

    @Test
    void profileStartsEmptyAndKeepsOnlyWhatThePersonSets() throws Exception {
        mvc.perform(get(BASE + "/profile").header("Authorization", auth)).andExpect(status().isOk()).andExpect(jsonPath("$.spice").doesNotExist());
        putJson(auth, "/profile", "{\"spice\":\"MEDIUM\",\"oil\":\"LESS\",\"note\":\"  less salt  \"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.spice").value("MEDIUM")).andExpect(jsonPath("$.oil").value("LESS"))
                .andExpect(jsonPath("$.note").value("less salt")).andExpect(jsonPath("$.updatedAt").isNotEmpty());
        putJson(auth, "/profile", "{\"spice\":\"VOLCANIC\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
        putJson(auth, "/profile", "{\"note\":\"" + "x".repeat(201) + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(get(BASE + "/profile").header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER"))).andExpect(jsonPath("$.spice").doesNotExist());
        mvc.perform(get(BASE + "/profile")).andExpect(status().isUnauthorized());
    }

    @Test
    void dishChoicesAreRememberedListedNewestFirstAndForgotten() throws Exception {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        UUID c = UUID.randomUUID();
        UUID rice = UUID.randomUUID();
        UUID raita = UUID.randomUUID();
        putJson(auth, "/menu-items/" + a, "{\"choiceIds\":[\"" + rice + "\",\"" + raita + "\",\"" + rice + "\"],\"spice\":\"SPICY\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.choiceIds.length()").value(2)).andExpect(jsonPath("$.spice").value("SPICY"));
        CLOCK.advance(Duration.ofMinutes(1));
        putJson(auth, "/menu-items/" + b, "{\"oil\":\"LESS\"}").andExpect(status().isOk());
        CLOCK.advance(Duration.ofMinutes(1));
        putJson(auth, "/menu-items/" + c, "{}").andExpect(status().isOk()).andExpect(jsonPath("$.choiceIds.length()").value(0));

        String first = mvc.perform(get(BASE + "/menu-items").header("Authorization", auth).param("limit", "2")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].menuItemId").value(c.toString())).andExpect(jsonPath("$.items[1].menuItemId").value(b.toString()))
                .andExpect(jsonPath("$.nextCursor").isNotEmpty()).andReturn().getResponse().getContentAsString();
        mvc.perform(get(BASE + "/menu-items").header("Authorization", auth).param("limit", "2")
                        .param("cursor", json.readTree(first).get("nextCursor").asText()))
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].menuItemId").value(a.toString()))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());

        lookup(auth, a, c, UUID.randomUUID()).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        lookup(bearer(UUID.randomUUID(), "CUSTOMER"), a).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(delete(BASE + "/menu-items/" + a).header("Authorization", auth)).andExpect(status().isNoContent());
        mvc.perform(delete(BASE + "/menu-items/" + a).header("Authorization", auth)).andExpect(status().isNoContent());
        lookup(auth, a).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void eachPersonKeepsAtMostFiveHundredDishes() throws Exception {
        jdbc.update("INSERT INTO adv_taste_memory.dish_memory (person_id, menu_item_id, updated_at) "
                + "SELECT ?, gen_random_uuid(), now() FROM generate_series(1, 500)", me);
        putJson(auth, "/menu-items/" + UUID.randomUUID(), "{}").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MEMORY_FULL"));
        UUID kept = jdbc.queryForObject("SELECT menu_item_id FROM adv_taste_memory.dish_memory WHERE person_id = ? LIMIT 1", UUID.class, me);
        putJson(auth, "/menu-items/" + kept, "{\"spice\":\"MILD\"}").andExpect(status().isOk());
    }

    @Test
    void myTasteDataExportAndEraseCoverTasteMemory() throws Exception {
        UUID dish = UUID.randomUUID();
        putJson(auth, "/profile", "{\"spice\":\"MEDIUM\"}").andExpect(status().isOk());
        putJson(auth, "/menu-items/" + dish, "{\"oil\":\"LESS\",\"note\":\"no coriander\"}").andExpect(status().isOk());
        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", auth)).andExpect(status().isOk())
                .andExpect(jsonPath("$['taste-memory'].profile.spice").value("MEDIUM"))
                .andExpect(jsonPath("$['taste-memory'].dishes[0].note").value("no coriander"));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", auth).header("X-Confirm-Erase", "ERASE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.recordsErased").value(2)).andExpect(jsonPath("$.modules", hasItem("taste-memory")));
        mvc.perform(get(BASE + "/profile").header("Authorization", auth)).andExpect(jsonPath("$.spice").doesNotExist());
        lookup(auth, dish).andExpect(jsonPath("$.length()").value(0));
    }
}
