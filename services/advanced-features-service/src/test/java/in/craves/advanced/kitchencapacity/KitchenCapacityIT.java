package in.craves.advanced.kitchencapacity;

import static org.hamcrest.Matchers.hasItem;
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
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class KitchenCapacityIT extends IntegrationTestBase {
    static final String BASE = "/api/v1/advanced/kitchen-capacity";
    @Autowired
    ObjectMapper json;
    UUID kitchen;
    String chef;
    String alice;
    String bob;
    MenuItem biryani;
    LocalDate today;

    @BeforeEach
    void kitchen() {
        kitchen = UUID.randomUUID();
        biryani = CATALOG.add(kitchen, "Chicken dum biryani", 32000);
        chef = bearer(UUID.randomUUID(), "CUSTOMER", "CHEF");
        CATALOG.chefKitchens.put(chef.substring("Bearer ".length()), kitchen);
        alice = bearer(UUID.randomUUID(), "CUSTOMER");
        bob = bearer(UUID.randomUUID(), "CUSTOMER");
        today = CLOCK.instant().atZone(ZoneId.of("Asia/Kolkata")).toLocalDate();
    }

    ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, String auth, String body) throws Exception {
        return mvc.perform(request.header("Authorization", auth).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    String batch(int portions) throws Exception {
        String body = "{\"menuItemId\":\"" + biryani.id() + "\",\"serviceDate\":\"" + today + "\",\"portions\":" + portions
                + ",\"orderCutoff\":\"" + CLOCK.instant().plus(Duration.ofHours(3)) + "\"}";
        String created = send(post(BASE + "/chef/batches"), chef, body).andExpect(status().isCreated())
                .andExpect(jsonPath("$.remaining").value(portions)).andExpect(jsonPath("$.version").value(1))
                .andReturn().getResponse().getContentAsString();
        return json.readTree(created).get("id").asText();
    }

    String hold(String auth, String batchId, int portions) throws Exception {
        String held = send(post(BASE + "/batches/" + batchId + "/holds"), auth, "{\"portions\":" + portions + "}").andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("HELD")).andReturn().getResponse().getContentAsString();
        return json.readTree(held).get("id").asText();
    }

    @Test
    void portionsAreHeldConfirmedAndNeverOversold() throws Exception {
        String batchId = batch(3);
        mvc.perform(get(BASE + "/menu-items/" + biryani.id() + "/batches")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].remaining").value(3)).andExpect(jsonPath("$[0].open").value(true));

        String first = send(post(BASE + "/batches/" + batchId + "/holds").header("Idempotency-Key", "alice-hold-1"), alice, "{\"portions\":2}")
                .andExpect(status().isCreated()).andExpect(header().string("Idempotent-Replayed", "false")).andReturn().getResponse().getContentAsString();
        String aliceHold = json.readTree(first).get("id").asText();
        send(post(BASE + "/batches/" + batchId + "/holds").header("Idempotency-Key", "alice-hold-1"), alice, "{\"portions\":2}")
                .andExpect(header().string("Idempotent-Replayed", "true")).andExpect(jsonPath("$.id").value(aliceHold));
        send(post(BASE + "/batches/" + batchId + "/holds"), alice, "{\"portions\":1}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("HOLD_EXISTS")).andExpect(jsonPath("$.details[0]").value(aliceHold));

        CLOCK.advance(Duration.ofMinutes(6));
        send(post(BASE + "/batches/" + batchId + "/holds"), bob, "{\"portions\":2}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SOLD_OUT")).andExpect(jsonPath("$.details[0]").value("remaining: 1"));
        String bobHold = hold(bob, batchId, 1);
        mvc.perform(get(BASE + "/menu-items/" + biryani.id() + "/batches").param("date", today.toString()))
                .andExpect(jsonPath("$[0].remaining").value(0)).andExpect(jsonPath("$[0].open").value(false));

        // Alice's hold (10 minutes) runs out; Bob's is still live.
        CLOCK.advance(Duration.ofMinutes(5));
        String order = "{\"orderId\":\"%s\"}";
        UUID bobOrder = UUID.randomUUID();
        send(post(BASE + "/holds/" + aliceHold + "/confirm"), alice, order.formatted(UUID.randomUUID())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("HOLD_EXPIRED"));
        send(post(BASE + "/holds/" + bobHold + "/confirm"), alice, order.formatted(bobOrder)).andExpect(status().isNotFound());
        send(post(BASE + "/holds/" + bobHold + "/confirm"), bob, order.formatted(bobOrder)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED")).andExpect(jsonPath("$.orderId").value(bobOrder.toString()));
        send(post(BASE + "/holds/" + bobHold + "/confirm"), bob, order.formatted(bobOrder)).andExpect(status().isOk());
        send(post(BASE + "/holds/" + bobHold + "/confirm"), bob, order.formatted(UUID.randomUUID())).andExpect(status().isConflict());
        mvc.perform(delete(BASE + "/holds/" + bobHold).header("Authorization", bob)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("HOLD_CONFIRMED"));

        String again = hold(alice, batchId, 2);
        mvc.perform(get(BASE + "/chef/batches").header("Authorization", chef)).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].held").value(2)).andExpect(jsonPath("$[0].confirmed").value(1)).andExpect(jsonPath("$[0].remaining").value(0));
        mvc.perform(delete(BASE + "/holds/" + again).header("Authorization", alice)).andExpect(status().isNoContent());
        mvc.perform(delete(BASE + "/holds/" + again).header("Authorization", alice)).andExpect(status().isNoContent());
        mvc.perform(get(BASE + "/menu-items/" + biryani.id() + "/batches")).andExpect(jsonPath("$[0].remaining").value(2));
        mvc.perform(post(BASE + "/batches/" + batchId + "/holds").contentType(MediaType.APPLICATION_JSON).content("{\"portions\":1}"))
                .andExpect(status().isUnauthorized());
        send(post(BASE + "/batches/" + UUID.randomUUID() + "/holds"), alice, "{\"portions\":1}").andExpect(status().isNotFound());
    }

    @Test
    void chefsRunTheirBatchesAndOnlyTheirs() throws Exception {
        String batchId = batch(3);
        String aliceHold = hold(alice, batchId, 2);
        String change = "{\"portions\":%d,\"status\":\"%s\",\"expectedVersion\":%d}";
        send(put(BASE + "/chef/batches/" + batchId), chef, change.formatted(1, "OPEN", 1)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PORTIONS_BELOW_TAKEN"));
        send(put(BASE + "/chef/batches/" + batchId), chef, change.formatted(5, "OPEN", 7)).andExpect(status().isPreconditionFailed());
        send(put(BASE + "/chef/batches/" + batchId), chef, change.formatted(5, "CLOSED", 1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED")).andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.held").value(2));
        send(post(BASE + "/batches/" + batchId + "/holds"), bob, "{\"portions\":1}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BATCH_CLOSED"));
        send(post(BASE + "/holds/" + aliceHold + "/confirm"), alice, "{\"orderId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isOk());

        String other = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(other.substring("Bearer ".length()), UUID.randomUUID());
        send(put(BASE + "/chef/batches/" + batchId), other, change.formatted(5, "OPEN", 2)).andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/chef/batches").header("Authorization", other)).andExpect(jsonPath("$.length()").value(0));
        String forDish = "{\"menuItemId\":\"" + biryani.id() + "\",\"serviceDate\":\"%s\",\"portions\":4}";
        send(post(BASE + "/chef/batches"), other, forDish.formatted(today)).andExpect(status().isForbidden());
        send(post(BASE + "/chef/batches"), alice, forDish.formatted(today)).andExpect(status().isForbidden());
        send(post(BASE + "/chef/batches"), chef, forDish.formatted(today.minusDays(1))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SERVICE_DATE"));
        send(post(BASE + "/chef/batches"), chef, forDish.formatted(today.plusDays(31))).andExpect(status().isBadRequest());
        send(post(BASE + "/chef/batches"), chef, "{\"menuItemId\":\"" + biryani.id() + "\",\"serviceDate\":\"" + today
                + "\",\"portions\":4,\"orderCutoff\":\"" + CLOCK.instant().minusSeconds(60) + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_CUTOFF"));
    }

    @Test
    void chefSetsExtraPreparationTimeForAWhile() throws Exception {
        mvc.perform(get(BASE + "/kitchens/" + kitchen + "/load")).andExpect(status().isOk()).andExpect(jsonPath("$.extraPrepMinutes").value(0));
        send(put(BASE + "/chef/load"), chef, "{\"extraPrepMinutes\":20,\"until\":\"" + CLOCK.instant().plus(Duration.ofHours(2)) + "\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.extraPrepMinutes").value(20));
        mvc.perform(get(BASE + "/kitchens/" + kitchen + "/load")).andExpect(jsonPath("$.extraPrepMinutes").value(20));
        CLOCK.advance(Duration.ofHours(3));
        mvc.perform(get(BASE + "/kitchens/" + kitchen + "/load")).andExpect(jsonPath("$.extraPrepMinutes").value(0))
                .andExpect(jsonPath("$.until").doesNotExist());
        send(put(BASE + "/chef/load"), chef, "{\"extraPrepMinutes\":20,\"until\":\"" + CLOCK.instant().plus(Duration.ofHours(25)) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_UNTIL"));
        send(put(BASE + "/chef/load"), chef, "{\"extraPrepMinutes\":181,\"until\":\"" + CLOCK.instant().plus(Duration.ofHours(1)) + "\"}")
                .andExpect(status().isBadRequest());
        send(put(BASE + "/chef/load"), alice, "{\"extraPrepMinutes\":5,\"until\":\"" + CLOCK.instant().plus(Duration.ofHours(1)) + "\"}")
                .andExpect(status().isForbidden());
    }

    @Test
    void onePersonIsCappedAndTheChefVoidsHoldsNoRealOrderBacks() throws Exception {
        String batchId = batch(100);
        String big = hold(alice, batchId, 50);
        send(post(BASE + "/holds/" + big + "/confirm"), alice, "{\"orderId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isOk());
        send(post(BASE + "/batches/" + batchId + "/holds"), alice, "{\"portions\":1}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PERSON_LIMIT")).andExpect(jsonPath("$.details[0]").value("yours: 50"));

        mvc.perform(get(BASE + "/chef/batches/" + batchId + "/holds").header("Authorization", chef)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].status").value("CONFIRMED"))
                .andExpect(jsonPath("$[0].personId").doesNotExist());
        String other = bearer(UUID.randomUUID(), "CHEF");
        CATALOG.chefKitchens.put(other.substring("Bearer ".length()), UUID.randomUUID());
        send(post(BASE + "/chef/holds/" + big + "/void"), other, "{\"reason\":\"no such order\"}").andExpect(status().isForbidden());
        mvc.perform(get(BASE + "/chef/batches/" + batchId + "/holds").header("Authorization", other)).andExpect(status().isForbidden());
        send(post(BASE + "/chef/holds/" + big + "/void"), chef, "{}").andExpect(status().isBadRequest());
        send(post(BASE + "/chef/holds/" + big + "/void"), chef, "{\"reason\":\"no such order\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RELEASED"));
        send(post(BASE + "/chef/holds/" + big + "/void"), chef, "{\"reason\":\"no such order\"}").andExpect(status().isOk());
        mvc.perform(get(BASE + "/menu-items/" + biryani.id() + "/batches")).andExpect(jsonPath("$[0].remaining").value(100));
        hold(alice, batchId, 1);
    }

    @Test
    void aBatchStopsTakingHoldsWhenItsIndiaDateIsOver() throws Exception {
        String created = send(post(BASE + "/chef/batches"), chef, "{\"menuItemId\":\"" + biryani.id() + "\",\"serviceDate\":\"" + today + "\",\"portions\":5}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String batchId = json.readTree(created).get("id").asText();
        CLOCK.advance(Duration.ofDays(2));
        String later = bearer(UUID.randomUUID(), "CUSTOMER"); // the earlier tokens expired after 24 hours
        send(post(BASE + "/batches/" + batchId + "/holds"), later, "{\"portions\":1}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BATCH_CLOSED"));
        mvc.perform(get(BASE + "/menu-items/" + biryani.id() + "/batches").param("date", today.toString()))
                .andExpect(jsonPath("$[0].remaining").value(5)).andExpect(jsonPath("$[0].open").value(false));
    }

    @Test
    void erasingTasteDataUnlinksHoldsButKeepsPortionsCounted() throws Exception {
        String batchId = batch(2);
        String held = hold(alice, batchId, 1);
        send(post(BASE + "/holds/" + held + "/confirm"), alice, "{\"orderId\":\"" + UUID.randomUUID() + "\"}").andExpect(status().isOk());
        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", alice))
                .andExpect(jsonPath("$['kitchen-capacity'].holds[0].status").value("CONFIRMED"));
        mvc.perform(delete("/api/v1/advanced/my-taste-data").header("Authorization", alice).header("X-Confirm-Erase", "ERASE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.recordsErased").value(1)).andExpect(jsonPath("$.modules", hasItem("kitchen-capacity")));
        mvc.perform(get("/api/v1/advanced/my-taste-data/export").header("Authorization", alice))
                .andExpect(jsonPath("$['kitchen-capacity'].holds.length()").value(0));
        mvc.perform(get(BASE + "/menu-items/" + biryani.id() + "/batches")).andExpect(jsonPath("$[0].remaining").value(1));
    }
}
