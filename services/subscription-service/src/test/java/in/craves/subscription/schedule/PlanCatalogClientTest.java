package in.craves.subscription.schedule;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class PlanCatalogClientTest {
    private static final String BASE = "https://catalog.test/api/v1/catalog";
    private static final UUID ITEM = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID KITCHEN = UUID.fromString("22222222-2222-4222-8222-222222222222");
    private static final UUID CHEF = UUID.fromString("33333333-3333-4333-8333-333333333333");

    private final RestClient.Builder builder = RestClient.builder();
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

    private static String item() {
        return """
            {"id":"%s","kitchenId":"%s","itemName":"Chicken Biryani","category":"Biryani","foodType":"NON_VEG",
             "price":220,"currency":"INR","available":true,"status":"ACTIVE"}
            """.formatted(ITEM, KITCHEN);
    }

    private static String kitchen(UUID identityId) {
        return """
            {"id":"%s","identityId":%s,"status":"ACTIVE"}
            """.formatted(KITCHEN, identityId == null ? "null" : "\"" + identityId + "\"");
    }

    @Test
    void readsKitchenOwnershipFromTheInternalRouteBecauseThePublicProfileHidesTheChef() {
        server.expect(requestTo(BASE + "/menu-items/" + ITEM)).andRespond(withSuccess(item(), MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE + "/internal/kitchens/" + KITCHEN))
            .andExpect(header("X-Craves-Internal-Key", "shared-secret"))
            .andRespond(withSuccess(kitchen(CHEF), MediaType.APPLICATION_JSON));

        PlanCatalogClient.MenuItem result = new PlanCatalogClient(BASE, "shared-secret", builder).requireSellableOwnedItem(ITEM, CHEF);

        assertThat(result.id()).isEqualTo(ITEM);
        server.verify();
    }

    @Test
    void refusesADishFromAnotherChefsKitchen() {
        server.expect(requestTo(BASE + "/menu-items/" + ITEM)).andRespond(withSuccess(item(), MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE + "/internal/kitchens/" + KITCHEN))
            .andRespond(withSuccess(kitchen(UUID.randomUUID()), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> new PlanCatalogClient(BASE, "shared-secret", builder).requireSellableOwnedItem(ITEM, CHEF))
            .isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void saysInternalAccessIsMissingInsteadOfBlamingTheChef() {
        server.expect(requestTo(BASE + "/menu-items/" + ITEM)).andRespond(withSuccess(item(), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> new PlanCatalogClient(BASE, "", builder).requireSellableOwnedItem(ITEM, CHEF))
            .isInstanceOfSatisfying(ResponseStatusException.class,
                e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }
}
