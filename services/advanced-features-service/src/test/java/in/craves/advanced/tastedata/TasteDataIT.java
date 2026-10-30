package in.craves.advanced.tastedata;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.support.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class TasteDataIT extends IntegrationTestBase {
    @Test
    void exportShowsEverythingAndEraseRemovesIt() throws Exception {
        String me = bearer(UUID.randomUUID(), "CUSTOMER");
        mvc.perform(post("/api/v1/food-lists").header("Authorization", me).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Mine\"}"))
                .andExpect(status().isCreated());
        mvc.perform(put("/api/v1/my-taste-data/consent").header("Authorization", me).contentType(MediaType.APPLICATION_JSON)
                .content("{\"personalization\":true,\"productAnalytics\":false}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.personalization").value(true));

        mvc.perform(get("/api/v1/my-taste-data/export").header("Authorization", me))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$['food-lists'].foodLists[0].name").value("Mine"))
                .andExpect(jsonPath("$.consent.personalization").value(true))
                .andExpect(jsonPath("$['group-orders'].groupOrders.length()").value(0));

        mvc.perform(delete("/api/v1/my-taste-data").header("Authorization", me)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CONFIRMATION_REQUIRED"));
        mvc.perform(delete("/api/v1/my-taste-data").header("Authorization", me).header("X-Confirm-Erase", "ERASE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.recordsErased").value(2));
        mvc.perform(get("/api/v1/food-lists").header("Authorization", me)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/v1/my-taste-data/consent").header("Authorization", me)).andExpect(jsonPath("$.personalization").value(false));
    }
}
