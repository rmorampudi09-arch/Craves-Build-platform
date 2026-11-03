package in.craves.advanced.mydata;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.support.IntegrationTestBase;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

class MyDataIT extends IntegrationTestBase {
    static final String EXPORT = "/api/v1/advanced/my-data/export";
    final ObjectMapper json = new ObjectMapper();
    @Autowired
    JdbcTemplate jdbc;
    UUID person;
    String customer;

    @BeforeEach
    void sources() throws Exception {
        person = UUID.randomUUID();
        customer = bearer(person, "CUSTOMER");
        ACCOUNTS.answer("/api/v1/customer/profile", 200, json.readTree("{\"firstName\":\"Asha\",\"email\":\"asha@example.in\"}"));
        ACCOUNTS.answer("/api/v1/customer/addresses", 200, json.readTree("[{\"label\":\"Home\"}]"));
        // Two pages of orders: the export follows nextCursor until hasMore is false.
        ACCOUNTS.answer("/api/v1/orders/page?limit=100", 200, json.readTree("{\"orders\":[{\"id\":\"o1\"},{\"id\":\"o2\"}],\"nextCursor\":\"c/2+\",\"hasMore\":true}"));
        ACCOUNTS.answer("/api/v1/orders/page?limit=100&cursor=c%2F2%2B", 200, json.readTree("{\"orders\":[{\"id\":\"o3\"}],\"nextCursor\":null,\"hasMore\":false}"));
        ACCOUNTS.answer("/api/v1/customer/favorites", 200, json.readTree("[{\"menuItemId\":\"m1\"}]"));
        ACCOUNTS.answer("/api/v1/customer/favorite-chefs?limit=100", 200, json.readTree("{\"items\":[{\"chefIdentityId\":\"c1\"}],\"nextCursor\":null}"));
        ACCOUNTS.answer("/api/v1/customer/favorite-kitchens?limit=100", 200, json.readTree("{\"items\":[{\"kitchenId\":\"k1\"}],\"nextCursor\":\"n1\"}"));
        ACCOUNTS.answer("/api/v1/customer/favorite-kitchens?limit=100&cursor=n1", 200, json.readTree("{\"items\":[{\"kitchenId\":\"k2\"}]}"));
        ACCOUNTS.answer("/api/v1/kitchens/me", 200, json.readTree("{\"name\":\"Asha's Kitchen\"}"));
    }

    @Test
    void customerGetsEveryServiceAndTheAdvancedFeaturesInOneDownload() throws Exception {
        mvc.perform(get(EXPORT)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/advanced/account-deletion").header("Authorization", customer).header("X-Confirm-Delete", "DELETE")
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isCreated());
        jdbc.update("INSERT INTO adv_taste_data.consent (person_id, personalization, product_analytics, updated_at) VALUES (?, true, false, now())", person);

        mvc.perform(get(EXPORT).header("Authorization", customer)).andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"craves-my-data.json\""))
                .andExpect(header().string("Cache-Control", Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.personId").value(person.toString())).andExpect(jsonPath("$.complete").value(true))
                .andExpect(jsonPath("$.missing.length()").value(0)).andExpect(jsonPath("$.profile.firstName").value("Asha"))
                .andExpect(jsonPath("$.addresses[0].label").value("Home")).andExpect(jsonPath("$.orders.length()").value(3))
                .andExpect(jsonPath("$.orders[2].id").value("o3")).andExpect(jsonPath("$.favoriteDishes.length()").value(1))
                .andExpect(jsonPath("$.favoriteChefs.length()").value(1)).andExpect(jsonPath("$.favoriteKitchens.length()").value(2))
                .andExpect(jsonPath("$.kitchen").doesNotExist())
                .andExpect(jsonPath("$.advancedFeatures.consent.personalization").value(true))
                .andExpect(jsonPath("$.advancedFeatures['account-deletion'].requests.length()").value(1));
        // Every source was read with the caller's token; a customer's export never asks for a kitchen.
        assertThat(ACCOUNTS.reads).hasSize(8).allMatch(read -> read.endsWith(" token")).noneMatch(read -> read.startsWith("/api/v1/kitchens/me"));
    }

    @Test
    void chefsGetTheirKitchenAndMissingSectionsAreNamed() throws Exception {
        ACCOUNTS.answer("/api/v1/customer/profile", 404, null);
        ACCOUNTS.answer("/api/v1/orders/page?limit=100&cursor=c%2F2%2B", 0, null);
        ACCOUNTS.answer("/api/v1/customer/addresses", 404, null);
        ACCOUNTS.answer("/api/v1/customer/favorites", 503, null);
        mvc.perform(get(EXPORT).header("Authorization", bearer(person, "CUSTOMER", "CHEF"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.kitchen.name").value("Asha's Kitchen")).andExpect(jsonPath("$.profile").doesNotExist())
                .andExpect(jsonPath("$.orders").doesNotExist()).andExpect(jsonPath("$.complete").value(false))
                .andExpect(jsonPath("$.missing").value(Matchers.contains("addresses", "orders", "favoriteDishes")));
    }

    @Test
    void ridersAndStaffAreNotAskedForCustomerRecords() throws Exception {
        mvc.perform(get(EXPORT).header("Authorization", bearer(person, "RIDER"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.complete").value(true)).andExpect(jsonPath("$.profile").doesNotExist());
        assertThat(ACCOUNTS.reads).isEmpty();
    }

    @Test
    void anExpiredSessionAtASourceAsksToSignInAgainAndABrokenModuleIsOnlyMissing() throws Exception {
        ACCOUNTS.answer("/api/v1/customer/addresses", 401, null);
        mvc.perform(get(EXPORT).header("Authorization", customer)).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

        ACCOUNTS.answer("/api/v1/customer/addresses", 200, json.readTree("[]"));
        jdbc.execute("ALTER TABLE adv_food_lists.food_list RENAME TO food_list_away");
        try {
            mvc.perform(get(EXPORT).header("Authorization", customer)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.complete").value(false)).andExpect(jsonPath("$.missing").value(Matchers.contains("food-lists")))
                    .andExpect(jsonPath("$.profile.firstName").value("Asha"));
        } finally {
            jdbc.execute("ALTER TABLE adv_food_lists.food_list_away RENAME TO food_list");
        }
    }
}
