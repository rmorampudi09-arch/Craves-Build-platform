package in.craves.advanced.foodlists;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.support.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

class FoodListsIT extends IntegrationTestBase {
    @Autowired
    ObjectMapper json;

    private JsonNode body(org.springframework.test.web.servlet.ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private String createList(String token, String name) throws Exception {
        return body(mvc.perform(post("/api/v1/advanced/food-lists").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\"}")).andExpect(status().isCreated())).get("id").asText();
    }

    @Test
    void ownerBuildsAListAndSeesLiveAvailability() throws Exception {
        UUID kitchen = UUID.randomUUID();
        MenuItem biryani = CATALOG.add(kitchen, "Chicken Biryani", 24900);
        MenuItem pulao = CATALOG.add(kitchen, "Veg Pulao", 15900);
        String token = bearer(UUID.randomUUID(), "CUSTOMER");
        String list = createList(token, "Sunday lunch");

        mvc.perform(put("/api/v1/advanced/food-lists/" + list + "/items/" + biryani.id()).header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"extra raita\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.itemCount").value(1));
        mvc.perform(put("/api/v1/advanced/food-lists/" + list + "/items/" + pulao.id()).header("Authorization", token)).andExpect(status().isOk());
        CATALOG.unavailable.add(pulao.id());

        mvc.perform(get("/api/v1/advanced/food-lists/" + list).header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].availability").value("AVAILABLE"))
                .andExpect(jsonPath("$.items[0].pricePaise").value(24900))
                .andExpect(jsonPath("$.items[0].note").value("extra raita"))
                .andExpect(jsonPath("$.items[1].availability").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.items[1].itemName").value("Veg Pulao"))
                .andExpect(jsonPath("$.visibility").value("PRIVATE"));

        CATALOG.down = true;
        mvc.perform(get("/api/v1/advanced/food-lists/" + list).header("Authorization", token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].availability").value("UNKNOWN"));
    }

    @Test
    void namesAreUniquePerOwnerAndListsArePrivate() throws Exception {
        String alice = bearer(UUID.randomUUID(), "CUSTOMER");
        String bob = bearer(UUID.randomUUID(), "CUSTOMER");
        String list = createList(alice, "Office");
        mvc.perform(post("/api/v1/advanced/food-lists").header("Authorization", alice).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"office\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LIST_NAME_TAKEN"));
        createList(bob, "Office");
        mvc.perform(get("/api/v1/advanced/food-lists/" + list).header("Authorization", bob)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/advanced/food-lists/" + list).header("Authorization", bob)).andExpect(status().isNotFound());
    }

    @Test
    void unknownDishIsRefused() throws Exception {
        String token = bearer(UUID.randomUUID(), "CUSTOMER");
        String list = createList(token, "Snacks");
        mvc.perform(put("/api/v1/advanced/food-lists/" + list + "/items/" + UUID.randomUUID()).header("Authorization", token))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("MENU_ITEM_NOT_FOUND"));
    }

    @Test
    void reorderAndVersionChecks() throws Exception {
        UUID kitchen = UUID.randomUUID();
        MenuItem a = CATALOG.add(kitchen, "A", 100);
        MenuItem b = CATALOG.add(kitchen, "B", 200);
        String token = bearer(UUID.randomUUID(), "CUSTOMER");
        String list = createList(token, "Order");
        mvc.perform(put("/api/v1/advanced/food-lists/" + list + "/items/" + a.id()).header("Authorization", token)).andExpect(status().isOk());
        JsonNode after = body(mvc.perform(put("/api/v1/advanced/food-lists/" + list + "/items/" + b.id()).header("Authorization", token)));
        long version = after.get("version").asLong();
        mvc.perform(put("/api/v1/advanced/food-lists/" + list + "/items-order").header("Authorization", token).header("If-Match", "\"" + (version - 1) + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"menuItemIds\":[\"" + b.id() + "\",\"" + a.id() + "\"]}"))
                .andExpect(status().isPreconditionFailed());
        mvc.perform(put("/api/v1/advanced/food-lists/" + list + "/items-order").header("Authorization", token).header("If-Match", "\"" + version + "\"")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"menuItemIds\":[\"" + b.id() + "\",\"" + a.id() + "\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].menuItemId").value(b.id().toString()));
        mvc.perform(put("/api/v1/advanced/food-lists/" + list + "/items-order").header("Authorization", token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"menuItemIds\":[\"" + b.id() + "\"]}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(patch("/api/v1/advanced/food-lists/" + list).header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Renamed\",\"description\":\"for Fridays\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Renamed"));
    }

    @Test
    void shareLinkWorksWithoutSignInUntilRevoked() throws Exception {
        MenuItem dish = CATALOG.add(UUID.randomUUID(), "Dal", 9900);
        UUID ownerId = UUID.randomUUID();
        String owner = bearer(ownerId, "CUSTOMER");
        String list = createList(owner, "Hostel favourites");
        mvc.perform(put("/api/v1/advanced/food-lists/" + list + "/items/" + dish.id()).header("Authorization", owner)).andExpect(status().isOk());
        JsonNode link = body(mvc.perform(post("/api/v1/advanced/food-lists/" + list + "/share").header("Authorization", owner)
                .contentType(MediaType.APPLICATION_JSON).content("{\"expiresInDays\":7}")).andExpect(status().isCreated()));
        String token = link.get("token").asText();

        mvc.perform(get("/api/v1/advanced/shared-food-lists/" + token))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Robots-Tag", "noindex"))
                .andExpect(jsonPath("$.name").value("Hostel favourites"))
                .andExpect(jsonPath("$.items[0].itemName").value("Dal"))
                .andExpect(jsonPath("$.ownerId").doesNotExist());
        mvc.perform(get("/api/v1/advanced/food-lists/" + list).header("Authorization", owner))
                .andExpect(jsonPath("$.visibility").value("SHARED")).andExpect(jsonPath("$.share.viewCount").value(1));

        String friend = bearer(UUID.randomUUID(), "CUSTOMER");
        mvc.perform(post("/api/v1/advanced/shared-food-lists/" + token + "/copy").header("Authorization", friend))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.itemCount").value(1)).andExpect(jsonPath("$.visibility").value("PRIVATE"));
        mvc.perform(post("/api/v1/advanced/shared-food-lists/" + token + "/copy").header("Authorization", friend))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Hostel favourites (copy)"));

        mvc.perform(delete("/api/v1/advanced/food-lists/" + list + "/share").header("Authorization", owner)).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/advanced/shared-food-lists/" + token)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/advanced/shared-food-lists/not-a-token")).andExpect(status().isNotFound());
    }

    @Test
    void createIsIdempotentPerKey() throws Exception {
        String token = bearer(UUID.randomUUID(), "CUSTOMER");
        String first = body(mvc.perform(post("/api/v1/advanced/food-lists").header("Authorization", token).header("Idempotency-Key", "create-list-0001")
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Breakfast\"}")).andExpect(status().isCreated())
                .andExpect(header().string("Idempotent-Replayed", "false"))).get("id").asText();
        mvc.perform(post("/api/v1/advanced/food-lists").header("Authorization", token).header("Idempotency-Key", "create-list-0001")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Breakfast\"}"))
                .andExpect(status().isCreated()).andExpect(header().string("Idempotent-Replayed", "true")).andExpect(jsonPath("$.id").value(first));
        mvc.perform(post("/api/v1/advanced/food-lists").header("Authorization", token).header("Idempotency-Key", "create-list-0001")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Dinner\"}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_REUSED"));
    }

    @Test
    void validationErrorsAreClear() throws Exception {
        String token = bearer(UUID.randomUUID(), "CUSTOMER");
        mvc.perform(post("/api/v1/advanced/food-lists").header("Authorization", token).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        mvc.perform(post("/api/v1/advanced/food-lists").header("Authorization", token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"x\",\"unexpected\":1}")).andExpect(status().isBadRequest());
    }
}
