package in.craves.advanced.personalized;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.platform.clients.SavedFeedGateway.SavedItem;
import in.craves.advanced.support.IntegrationTestBase;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class PersonalizedIT extends IntegrationTestBase {
    static final String RANK = "/api/v1/advanced/personalized/rank";

    String body(UUID... dishes) {
        return "{\"items\":[" + java.util.Arrays.stream(dishes).map(d -> "{\"menuItemId\":\"" + d + "\"}").collect(Collectors.joining(",")) + "]}";
    }

    @Test
    void rankingNeedsConsentAndFallsBackWhenASourceIsDown() throws Exception {
        UUID me = UUID.randomUUID();
        String auth = bearer(me, "CUSTOMER");
        UUID plain = UUID.randomUUID();
        UUID saved = UUID.randomUUID();
        SAVED.dishes.put(auth.substring("Bearer ".length()), List.of(new SavedItem(saved, CLOCK.instant())));
        SAVED.down = true; // proves no upstream call is made without consent
        mvc.perform(post(RANK).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body(plain, saved)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.personalized").value(false)).andExpect(jsonPath("$.items[0].menuItemId").value(plain.toString()));

        mvc.perform(put("/api/v1/advanced/my-taste-data/consent").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                .content("{\"personalization\":true,\"productAnalytics\":false}")).andExpect(status().isOk());
        mvc.perform(post(RANK).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body(plain, saved)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.personalized").value(false));
        SAVED.down = false;
        mvc.perform(post(RANK).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body(plain, saved)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.personalized").value(true))
                .andExpect(jsonPath("$.items[0].menuItemId").value(saved.toString())).andExpect(jsonPath("$.items[0].reasons[0]").value("SAVED_DISH"));
    }

    @Test
    void requestsAreBounded() throws Exception {
        String auth = bearer(UUID.randomUUID(), "CUSTOMER");
        UUID[] many = IntStream.range(0, 101).mapToObj(i -> UUID.randomUUID()).toArray(UUID[]::new);
        mvc.perform(post(RANK).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body(many))).andExpect(status().isBadRequest());
        mvc.perform(post(RANK).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content("{\"items\":[]}")).andExpect(status().isBadRequest());
        mvc.perform(post(RANK).contentType(MediaType.APPLICATION_JSON).content(body(UUID.randomUUID()))).andExpect(status().isUnauthorized());
    }
}
