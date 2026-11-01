package in.craves.advanced.savedfeed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.advanced.platform.clients.CatalogGateway.MenuItem;
import in.craves.advanced.platform.clients.SavedFeedGateway.History;
import in.craves.advanced.platform.clients.SavedFeedGateway.KitchenState;
import in.craves.advanced.platform.clients.SavedFeedGateway.PastOrder;
import in.craves.advanced.platform.clients.SavedFeedGateway.PastOrderItem;
import in.craves.advanced.platform.clients.SavedFeedGateway.PreviewDish;
import in.craves.advanced.platform.clients.SavedFeedGateway.SavedItem;
import in.craves.advanced.support.IntegrationTestBase;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SavedFeedIT extends IntegrationTestBase {
    static final String FEED = "/api/v1/advanced/saved-feed";

    @Test
    void anUnavailableFavoriteIsExplainedFromItsLastSeenKitchenWithAlternatives() throws Exception {
        UUID kitchen = UUID.randomUUID();
        MenuItem dal = CATALOG.add(kitchen, "Dal", 15000);
        MenuItem roti = CATALOG.add(kitchen, "Roti", 2000);
        String auth = bearer(UUID.randomUUID(), "CUSTOMER");
        String token = auth.substring("Bearer ".length());
        SAVED.dishes.put(token, List.of(new SavedItem(dal.id(), CLOCK.instant().minus(Duration.ofDays(2))),
                new SavedItem(roti.id(), CLOCK.instant().minus(Duration.ofDays(1)))));
        SAVED.states.put(kitchen, new KitchenState(kitchen, true, "Asha's Kitchen", "COOKING_NOW", null, true, 2,
                List.of(new PreviewDish(dal.id(), "Dal", 15000L), new PreviewDish(roti.id(), "Roti", 2000L))));

        // Both available: the first read remembers which kitchen each dish belongs to.
        mvc.perform(get(FEED).header("Authorization", auth)).andExpect(status().isOk())
                .andExpect(jsonPath("$.dishes.length()").value(2)).andExpect(jsonPath("$.dishes[0].name").value("Roti"))
                .andExpect(jsonPath("$.dishes[0].available").value(true)).andExpect(jsonPath("$.dishes[0].recovery").doesNotExist());

        CATALOG.unavailable.add(dal.id()); // switched off today: Catalog no longer shows it
        SAVED.states.put(kitchen, new KitchenState(kitchen, true, "Asha's Kitchen", "COOKING_LATER_TODAY", CLOCK.instant().plus(Duration.ofHours(3)),
                true, 1, List.of(new PreviewDish(roti.id(), "Roti", 2000L))));
        mvc.perform(get(FEED).header("Authorization", auth)).andExpect(status().isOk())
                .andExpect(jsonPath("$.dishes[1].menuItemId").value(dal.id().toString())).andExpect(jsonPath("$.dishes[1].available").value(false))
                .andExpect(jsonPath("$.dishes[1].name").value("Dal")).andExpect(jsonPath("$.dishes[1].pricePaise").doesNotExist())
                .andExpect(jsonPath("$.dishes[1].recovery.kitchenName").value("Asha's Kitchen"))
                .andExpect(jsonPath("$.dishes[1].recovery.kitchenCookingState").value("COOKING_LATER_TODAY"))
                .andExpect(jsonPath("$.dishes[1].recovery.alternatives[0].name").value("Roti"));
    }

    @Test
    void familiarityAndRegularsComeOnlyFromTheCallersOwnDeliveredOrders() throws Exception {
        UUID saved = UUID.randomUUID();
        UUID regular = UUID.randomUUID();
        UUID gone = UUID.randomUUID();
        String auth = bearer(UUID.randomUUID(), "CUSTOMER");
        String token = auth.substring("Bearer ".length());
        SAVED.kitchens.put(token, List.of(new SavedItem(saved, CLOCK.instant())));
        SAVED.dishes.put(token, List.of(new SavedItem(gone, CLOCK.instant())));
        SAVED.states.put(saved, new KitchenState(saved, true, "Saved Kitchen", "NOT_TODAY", null, false, 0, List.of()));
        SAVED.history.put(token, new History(List.of(
                new PastOrder(UUID.randomUUID(), regular, "Regular Kitchen", CLOCK.instant().minus(Duration.ofDays(1)), 3,
                        List.of(new PastOrderItem(gone, "Biryani", 2))),
                new PastOrder(UUID.randomUUID(), regular, "Regular Kitchen", CLOCK.instant().minus(Duration.ofDays(8)), 3,
                        List.of(new PastOrderItem(gone, "Biryani", 1)))), false));

        mvc.perform(get(FEED).header("Authorization", auth)).andExpect(status().isOk())
                .andExpect(jsonPath("$.familiarityComplete").value(false))
                .andExpect(jsonPath("$.kitchens[0].name").value("Saved Kitchen")).andExpect(jsonPath("$.kitchens[0].cookingState").value("NOT_TODAY"))
                .andExpect(jsonPath("$.kitchens[0].deliveredOrders").value(0))
                .andExpect(jsonPath("$.regulars[0].kitchenId").value(regular.toString())).andExpect(jsonPath("$.regulars[0].deliveredOrders").value(3))
                .andExpect(jsonPath("$.regulars[0].savedAt").doesNotExist())
                .andExpect(jsonPath("$.dishes[0].available").value(false)).andExpect(jsonPath("$.dishes[0].name").value("Biryani"))
                .andExpect(jsonPath("$.dishes[0].familiarity.timesOrdered").value(2))
                .andExpect(jsonPath("$.dishes[0].recovery.kitchenId").value(regular.toString()))
                .andExpect(jsonPath("$.dishes[0].recovery.kitchenCookingState").value("MISSING"));
        assertThat(SAVED.resolveCalls).singleElement().satisfies(ids -> assertThat(ids).containsExactly(saved, regular));
    }

    @Test
    void anEmptyFeedNeedsNoCatalogAndOutagesAnswer503() throws Exception {
        String auth = bearer(UUID.randomUUID(), "CUSTOMER");
        CATALOG.down = true;
        mvc.perform(get(FEED).header("Authorization", auth)).andExpect(status().isOk()).andExpect(jsonPath("$.dishes.length()").value(0))
                .andExpect(jsonPath("$.familiarityComplete").value(true));
        mvc.perform(get(FEED)).andExpect(status().isUnauthorized());
        SAVED.down = true;
        mvc.perform(get(FEED).header("Authorization", auth)).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("FAVORITES_UNAVAILABLE"));
    }

    @Test
    void manyKitchensAreResolvedInBatchesOfAHundred() throws Exception {
        String auth = bearer(UUID.randomUUID(), "CUSTOMER");
        List<SavedItem> many = java.util.stream.IntStream.range(0, 130).mapToObj(i -> new SavedItem(UUID.randomUUID(), CLOCK.instant())).toList();
        SAVED.kitchens.put(auth.substring("Bearer ".length()), many);
        mvc.perform(get(FEED).header("Authorization", auth)).andExpect(status().isOk()).andExpect(jsonPath("$.kitchens.length()").value(130));
        assertThat(SAVED.resolveCalls).extracting(java.util.Collection::size).containsExactly(100, 30);
    }
}
