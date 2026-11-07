package in.craves.advanced.menuoptions;

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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

/** M24c slice A: the internal checkout quote; same properties as PromotionsInternalIT so they share one Spring context. */
@TestPropertySource(properties = {
        "craves.internal.service-secret=" + MenuOptionsInternalIT.SECRET,
        "CRAVES_ADV_TASTE_MEMORY_ENABLED=false",
        "CRAVES_ADV_PARTNER_OFFERS_ENABLED=false"})
class MenuOptionsInternalIT extends IntegrationTestBase {
    static final String SECRET = "test-internal-secret-0123456789"; // same as PromotionsInternalIT and AccountErasureIT
    static final String URL = "/internal/v1/menu-options/checkout-quote";
    @Autowired
    ObjectMapper json;
    MenuItem biryani;
    MenuItem lassi;
    String ghee;
    String raita;

    @BeforeEach
    void dishes() throws Exception {
        UUID kitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Chicken dum biryani", 32000);
        lassi = CATALOG.add(kitchen, "Sweet lassi", 8000);
        String chef = bearer(UUID.randomUUID(), "CUSTOMER", "CHEF");
        CATALOG.chefKitchens.put(chef.substring("Bearer ".length()), kitchen);
        mvc.perform(put(MenuOptionsIT.BASE + "/chef/meal-periods").header("Authorization", chef).contentType(MediaType.APPLICATION_JSON)
                .content(MenuOptionsIT.HOURS)).andExpect(status().isOk());
        JsonNode options = json.readTree(mvc.perform(put(MenuOptionsIT.BASE + "/chef/menu-items/" + biryani.id()).header("Authorization", chef)
                .contentType(MediaType.APPLICATION_JSON).content(MenuOptionsIT.OPTIONS)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        ghee = options.at("/groups/0/choices/1/id").asText();
        raita = options.at("/groups/1/choices/0/id").asText();
    }

    ResultActions quote(String secret, String at, String lines) throws Exception {
        var request = post(URL).contentType(MediaType.APPLICATION_JSON).content("{\"at\":" + at + ",\"lines\":[" + lines + "]}");
        if (secret != null) request.header("X-Craves-Internal-Secret", secret);
        return mvc.perform(request);
    }

    String line(MenuItem dish, int quantity, String... choices) {
        return "{\"menuItemId\":\"" + dish.id() + "\",\"quantity\":" + quantity + ",\"choiceIds\":["
                + String.join(",", java.util.Arrays.stream(choices).map(c -> "\"" + c + "\"").toList()) + "]}";
    }

    @Test
    void pricesEveryDishWithItsOptionsAtTheOrderTime() throws Exception {
        String at = "\"" + MenuOptionsIT.LUNCHTIME + "\"";
        quote(SECRET, at, line(biryani, 2, ghee, raita) + "," + line(lassi, 1)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.lines[0].basePricePaise").value(32000)).andExpect(jsonPath("$.lines[0].unitPricePaise").value(37500))
                .andExpect(jsonPath("$.lines[0].totalPaise").value(75000)).andExpect(jsonPath("$.lines[0].optionsVersion").value(1))
                .andExpect(jsonPath("$.lines[1].unitPricePaise").value(8000)).andExpect(jsonPath("$.lines[1].optionsVersion").value(0))
                .andExpect(jsonPath("$.totalPaise").value(83000));
    }

    @Test
    void oneLineThatCannotBePricedFailsTheWholeQuote() throws Exception {
        String lunch = "\"" + MenuOptionsIT.LUNCHTIME + "\"";
        quote(SECRET, "\"2026-11-02T11:30:00Z\"", line(lassi, 1) + "," + line(biryani, 1, ghee)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_SERVED_AT_THIS_TIME"));
        quote(SECRET, lunch, line(biryani, 1, raita)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("SELECTION_INVALID"));
        CATALOG.unavailable.add(lassi.id());
        quote(SECRET, lunch, line(biryani, 1, ghee) + "," + line(lassi, 1)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ITEM_UNAVAILABLE"));
        CATALOG.unavailable.clear();
        quote(SECRET, lunch, line(lassi, 1) + "," + line(lassi, 2)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("DUPLICATE_DISH"));
    }

    @Test
    void needsTheInternalSecretAndTheOrderTime() throws Exception {
        String lunch = "\"" + MenuOptionsIT.LUNCHTIME + "\"";
        quote(null, lunch, line(lassi, 1)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INTERNAL_SECRET_REQUIRED"));
        quote("wrong", lunch, line(lassi, 1)).andExpect(status().isUnauthorized());
        mvc.perform(post(URL).header("Authorization", bearer(UUID.randomUUID(), "CUSTOMER")).contentType(MediaType.APPLICATION_JSON)
                .content("{\"at\":" + lunch + ",\"lines\":[" + line(lassi, 1) + "]}")).andExpect(status().isUnauthorized());
        quote(SECRET, "null", line(lassi, 1)).andExpect(status().isBadRequest());
        quote(SECRET, lunch, "").andExpect(status().isBadRequest());
    }
}
