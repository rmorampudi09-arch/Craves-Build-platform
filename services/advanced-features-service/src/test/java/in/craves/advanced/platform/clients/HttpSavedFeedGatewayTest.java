package in.craves.advanced.platform.clients;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class HttpSavedFeedGatewayTest {
    final ObjectMapper json = new ObjectMapper();

    @Test
    void readsCatalogKitchenCardsAndSkipsMalformedOnes() throws Exception {
        UUID kitchen = UUID.randomUUID();
        UUID dish = UUID.randomUUID();
        var states = HttpSavedFeedGateway.kitchens(json.readTree("""
                {"evaluatedAt":"2026-10-31T10:00:00Z","items":[
                 {"requestedType":"KITCHEN","requestedId":"%s","exists":true,"kitchenName":"Asha","cookingState":"COOKING_LATER_TODAY",
                  "nextAvailabilityAt":"2026-10-31T13:30:00Z","acceptingOrders":true,"activeAvailableDishCount":4,
                  "menuPreview":[{"menuItemId":"%s","itemName":"Dal","price":150.00},{"itemName":"no id"}]},
                 {"requestedType":"KITCHEN","exists":false}]}
                """.formatted(kitchen, dish)));
        assertThat(states).singleElement().satisfies(s -> {
            assertThat(s.kitchenId()).isEqualTo(kitchen);
            assertThat(s.cookingState()).isEqualTo("COOKING_LATER_TODAY");
            assertThat(s.nextAvailabilityAt()).hasToString("2026-10-31T13:30:00Z");
            assertThat(s.preview()).singleElement().satisfies(d -> assertThat(d.pricePaise()).isEqualTo(15000L));
        });
    }

    @Test
    void readsRepeatCandidatesAndWhetherMoreExist() throws Exception {
        String page = """
                {"items":[{"orderId":"%s","kitchenId":"%s","kitchenName":"Asha","lastOrderedAt":"2026-10-30T10:00:00Z",
                 "completedOrdersFromKitchen":4,"items":[{"menuItemId":"%s","itemName":"Dal","quantity":2}]}],"nextCursor":"x","hasMore":%s}
                """;
        var more = HttpSavedFeedGateway.history(json.readTree(page.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "true")));
        assertThat(more.complete()).isFalse();
        assertThat(more.orders()).singleElement().satisfies(o -> {
            assertThat(o.completedOrdersFromKitchen()).isEqualTo(4);
            assertThat(o.items()).singleElement().satisfies(i -> assertThat(i.quantity()).isEqualTo(2));
        });
        assertThat(HttpSavedFeedGateway.history(json.readTree(page.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "false")))
                .complete()).isTrue();
    }
}
