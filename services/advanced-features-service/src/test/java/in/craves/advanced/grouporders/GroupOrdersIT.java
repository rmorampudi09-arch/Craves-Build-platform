package in.craves.advanced.grouporders;

import static org.assertj.core.api.Assertions.assertThat;
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
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class GroupOrdersIT extends IntegrationTestBase {
    @Autowired
    ObjectMapper json;
    UUID kitchen;
    MenuItem biryani;
    MenuItem kheer;
    MenuItem elsewhere;
    UUID hostId;
    String host;
    String guest;

    @BeforeEach
    void menu() {
        kitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Mutton Biryani", 32000);
        kheer = CATALOG.add(kitchen, "Kheer", 8000);
        elsewhere = CATALOG.add(UUID.randomUUID(), "Other kitchen dish", 10000);
        hostId = UUID.randomUUID();
        host = bearer(hostId, "CUSTOMER");
        guest = bearer(UUID.randomUUID(), "CUSTOMER");
    }

    private JsonNode body(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private JsonNode create() throws Exception {
        return body(mvc.perform(post("/api/v1/advanced/group-orders").header("Authorization", host).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kitchenId\":\"" + kitchen + "\",\"title\":\"Team lunch\",\"joinWindowMinutes\":60,\"hostDisplayName\":\"Ravi\"}"))
                .andExpect(status().isCreated()));
    }

    private ResultActions put(String token, String group, MenuItem item, int quantity) throws Exception {
        return mvc.perform(MockMvcRequestBuildersShortcut.put("/api/v1/advanced/group-orders/" + group + "/my-items/" + item.id(), token,
                "{\"quantity\":" + quantity + "}"));
    }

    @Test
    void groupBuildsASharedBasketAndHandsItToTheHostCart() throws Exception {
        JsonNode created = create();
        String group = created.get("id").asText();
        String code = created.get("joinCode").asText();
        assertThat(code).matches("[2-9A-Z]{4}-[2-9A-Z]{4}");

        mvc.perform(post("/api/v1/advanced/group-orders/join").header("Authorization", guest).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"" + code.toLowerCase() + "\",\"displayName\":\"Asha\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.participantCount").value(2)).andExpect(jsonPath("$.youAreHost").value(false));

        put(host, group, biryani, 2).andExpect(status().isOk());
        put(guest, group, biryani, 1).andExpect(status().isOk());
        put(guest, group, kheer, 3).andExpect(status().isOk());
        put(guest, group, elsewhere, 1).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("ITEM_NOT_FROM_GROUP_KITCHEN"));

        mvc.perform(get("/api/v1/advanced/group-orders/" + group).header("Authorization", guest))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subtotalPaise").value(2 * 32000 + 32000 + 3 * 8000))
                .andExpect(jsonPath("$.participants[0].role").value("HOST"))
                .andExpect(jsonPath("$.participants[0].participantId").doesNotExist())
                .andExpect(jsonPath("$.participants[1].you").value(true));

        mvc.perform(post("/api/v1/advanced/group-orders/" + group + "/checkout").header("Authorization", host).contentType(MediaType.APPLICATION_JSON)
                .content("{\"applyToCart\":true}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LOCK_FIRST"));
        mvc.perform(post("/api/v1/advanced/group-orders/" + group + "/lock").header("Authorization", guest))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("HOST_ONLY"));
        mvc.perform(post("/api/v1/advanced/group-orders/" + group + "/lock").header("Authorization", host)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("LOCKED")).andExpect(jsonPath("$.joinCode").doesNotExist());
        put(guest, group, kheer, 5).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("GROUP_LOCKED"));

        String hostToken = host.substring("Bearer ".length());
        CART.add(hostToken, UUID.randomUUID(), 1);
        mvc.perform(post("/api/v1/advanced/group-orders/" + group + "/checkout").header("Authorization", host).contentType(MediaType.APPLICATION_JSON)
                .content("{\"applyToCart\":true}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("HOST_CART_NOT_EMPTY"));
        mvc.perform(post("/api/v1/advanced/group-orders/" + group + "/checkout").header("Authorization", host).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"applyToCart\":true,\"replaceCart\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.subtotalPaise").value(3 * 32000 + 3 * 8000))
                .andExpect(jsonPath("$.lines.length()").value(2));
        assertThat(CART.carts.get(hostToken)).isEqualTo(Map.of(biryani.id(), 3, kheer.id(), 3));

        mvc.perform(post("/api/v1/advanced/group-orders/" + group + "/checkout").header("Authorization", host).contentType(MediaType.APPLICATION_JSON)
                .content("{\"applyToCart\":true}")).andExpect(status().isOk()).andExpect(jsonPath("$.appliedToCart").value(true));
        assertThat(CART.carts.get(hostToken)).isEqualTo(Map.of(biryani.id(), 3, kheer.id(), 3));
        mvc.perform(get("/api/v1/advanced/group-orders/" + group).header("Authorization", host)).andExpect(jsonPath("$.status").value("CHECKED_OUT"));
    }

    @Test
    void outsidersCannotSeeOrJoinClosedGroups() throws Exception {
        JsonNode created = create();
        String group = created.get("id").asText();
        String stranger = bearer(UUID.randomUUID(), "CUSTOMER");
        mvc.perform(get("/api/v1/advanced/group-orders/" + group).header("Authorization", stranger)).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/advanced/group-orders/join").header("Authorization", stranger).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"ZZZZ-ZZZZ\"}")).andExpect(status().isNotFound());
        CLOCK.advance(Duration.ofMinutes(61));
        String late = bearer(UUID.randomUUID(), "CUSTOMER");
        mvc.perform(post("/api/v1/advanced/group-orders/join").header("Authorization", late).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"" + created.get("joinCode").asText() + "\"}")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GROUP_CLOSED"));
        mvc.perform(get("/api/v1/advanced/group-orders/" + group).header("Authorization", host)).andExpect(jsonPath("$.status").value("LOCKED"));
        mvc.perform(post("/api/v1/advanced/group-orders/" + group + "/unlock").header("Authorization", host).contentType(MediaType.APPLICATION_JSON)
                .content("{\"joinWindowMinutes\":30}")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("OPEN"));
    }

    @Test
    void hostRemovesAParticipantAndTheirDishes() throws Exception {
        JsonNode created = create();
        String group = created.get("id").asText();
        mvc.perform(post("/api/v1/advanced/group-orders/join").header("Authorization", guest).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"" + created.get("joinCode").asText() + "\"}")).andExpect(status().isOk());
        put(guest, group, kheer, 2).andExpect(status().isOk());
        JsonNode view = body(mvc.perform(get("/api/v1/advanced/group-orders/" + group).header("Authorization", host)));
        String guestId = view.get("participants").get(1).get("participantId").asText();
        mvc.perform(delete("/api/v1/advanced/group-orders/" + group + "/participants/" + guestId).header("Authorization", host))
                .andExpect(status().isOk()).andExpect(jsonPath("$.participantCount").value(1)).andExpect(jsonPath("$.subtotalPaise").value(0));
        mvc.perform(get("/api/v1/advanced/group-orders/" + group).header("Authorization", guest)).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/advanced/group-orders/join").header("Authorization", guest).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"" + created.get("joinCode").asText() + "\"}")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("REMOVED_FROM_GROUP"));
    }

    @Test
    void unavailableDishesBlockCheckoutWithDetails() throws Exception {
        JsonNode created = create();
        String group = created.get("id").asText();
        put(host, group, biryani, 1).andExpect(status().isOk());
        mvc.perform(post("/api/v1/advanced/group-orders/" + group + "/lock").header("Authorization", host)).andExpect(status().isOk());
        CATALOG.unavailable.add(biryani.id());
        mvc.perform(post("/api/v1/advanced/group-orders/" + group + "/checkout").header("Authorization", host))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ITEMS_UNAVAILABLE"))
                .andExpect(jsonPath("$.details[0]").value(biryani.id().toString()));
    }

    @Test
    void chefsAndUnknownKitchensCannotHost() throws Exception {
        mvc.perform(post("/api/v1/advanced/group-orders").header("Authorization", bearer(UUID.randomUUID(), "CHEF")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kitchenId\":\"" + kitchen + "\",\"title\":\"x\"}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/advanced/group-orders").header("Authorization", host).contentType(MediaType.APPLICATION_JSON)
                .content("{\"kitchenId\":\"" + UUID.randomUUID() + "\",\"title\":\"x\"}")).andExpect(status().isNotFound());
    }

    /** Small helper so the test reads naturally. */
    static final class MockMvcRequestBuildersShortcut {
        static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder put(String url, String token, String body) {
            return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(url).header("Authorization", token)
                    .contentType(MediaType.APPLICATION_JSON).content(body);
        }
    }
}
