package in.craves.advanced.liveactivities;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.support.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class LiveActivitiesIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/live-activities";
    static final String TOKEN = "{\"pushToken\":\"" + "ab12".repeat(16) + "\"}";

    ResultActions start(String auth, UUID order, String body) throws Exception {
        return mvc.perform(put(BASE + "/orders/" + order).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    void aCustomerFollowsTheirOwnOrderUntilItIsDelivered() throws Exception {
        UUID me = UUID.randomUUID();
        String auth = bearer(me, "CUSTOMER");
        UUID kitchen = UUID.randomUUID();
        MenuItem dal = CATALOG.add(kitchen, "Dal", 15000);
        Order order = ORDERS.place(me, kitchen, "CHEF_ACCEPTED", dal, 1);

        start(auth, order.id(), "{\"pushToken\":\"not hex\"}").andExpect(status().isBadRequest());
        start(auth, order.id(), TOKEN).andExpect(status().isOk()).andExpect(jsonPath("$.stage").value("COOKING")).andExpect(jsonPath("$.step").value(2));
        start(auth, order.id(), TOKEN).andExpect(status().isOk()); // a new token for the same order replaces the old one
        mvc.perform(get(BASE).header("Authorization", auth)).andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].active").value(true))
                .andExpect(jsonPath("$[0].pushToken").doesNotExist());

        ORDERS.orders.put(order.id(), new Order(order.id(), me, kitchen, "OUT_FOR_DELIVERY", order.lines(), null, order.createdAt(), CLOCK.instant()));
        mvc.perform(get(BASE + "/orders/" + order.id() + "/state").header("Authorization", auth)).andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("ON_THE_WAY")).andExpect(jsonPath("$.isFinal").value(false));
        ORDERS.orders.put(order.id(), new Order(order.id(), me, kitchen, "DELIVERED", order.lines(), null, order.createdAt(), CLOCK.instant()));
        mvc.perform(get(BASE + "/orders/" + order.id() + "/state").header("Authorization", auth)).andExpect(jsonPath("$.isFinal").value(true));
        mvc.perform(get(BASE).header("Authorization", auth)).andExpect(jsonPath("$[0].active").value(false)); // a finished order ends it
        start(auth, order.id(), TOKEN).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ORDER_FINISHED"));

        mvc.perform(delete(BASE + "/orders/" + order.id()).header("Authorization", auth)).andExpect(status().isNoContent());
        mvc.perform(delete(BASE + "/orders/" + order.id()).header("Authorization", auth)).andExpect(status().isNoContent());
        mvc.perform(get(BASE).header("Authorization", auth)).andExpect(jsonPath("$[0].active").value(false));
        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", auth)).andExpect(status().isOk())
                .andExpect(jsonPath("$['live-activities'].activities.length()").value(1));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", auth).header("X-Confirm-Erase", "ERASE")).andExpect(status().isOk());
        mvc.perform(get(BASE).header("Authorization", auth)).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void someoneElsesOrderIsNotFoundAndActiveActivitiesAreCapped() throws Exception {
        UUID me = UUID.randomUUID();
        String auth = bearer(me, "CUSTOMER");
        UUID kitchen = UUID.randomUUID();
        MenuItem dal = CATALOG.add(kitchen, "Dal", 15000);
        Order theirs = ORDERS.place(UUID.randomUUID(), kitchen, "PAID", dal, 1);
        start(auth, theirs.id(), TOKEN).andExpect(status().isNotFound());
        mvc.perform(get(BASE + "/orders/" + theirs.id() + "/state").header("Authorization", auth)).andExpect(status().isNotFound());
        for (int i = 0; i < LiveActivityService.MAX_ACTIVE; i++) {
            start(auth, ORDERS.place(me, kitchen, "PAID", dal, 1).id(), TOKEN).andExpect(status().isOk());
        }
        start(auth, ORDERS.place(me, kitchen, "PAID", dal, 1).id(), TOKEN).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TOO_MANY_ACTIVITIES"));
        CLOCK.advance(java.time.Duration.ofHours(23).plusMinutes(30)); // stale ones no longer hold the cap (tokens are valid for 24 h)
        start(bearer(me, "CUSTOMER"), ORDERS.place(me, kitchen, "PAID", dal, 1).id(), TOKEN).andExpect(status().isConflict());
        CLOCK.advance(java.time.Duration.ofHours(1));
        start(bearer(me, "CUSTOMER"), ORDERS.place(me, kitchen, "PAID", dal, 1).id(), TOKEN).andExpect(status().isOk());
        ORDERS.down = true;
        mvc.perform(get(BASE + "/orders/" + theirs.id() + "/state").header("Authorization", bearer(me, "CUSTOMER"))).andExpect(status().isServiceUnavailable());
        mvc.perform(get(BASE)).andExpect(status().isUnauthorized());
    }
}
