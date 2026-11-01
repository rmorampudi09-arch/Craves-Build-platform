package in.craves.advanced.platform.clients;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class HttpMenuSearchGatewayTest {
    @Test
    void readsCatalogDiscoveryAndSkipsEntriesWithoutAnId() throws Exception {
        UUID id = UUID.randomUUID();
        var dishes = HttpMenuSearchGateway.dishes(new ObjectMapper().readTree("""
                {"menuItems":[{"id":"%s","kitchenId":"%s","kitchenName":"asha-k","kitchenDisplayName":"Asha's Kitchen","itemName":"Dal",
                  "category":"Mains","foodType":"VEG","spiceLevel":"MILD","price":150.50,"distanceMeters":800},{"itemName":"no id"}]}
                """.formatted(id, UUID.randomUUID())));
        assertThat(dishes).singleElement().satisfies(d -> {
            assertThat(d.menuItemId()).isEqualTo(id);
            assertThat(d.kitchenName()).isEqualTo("Asha's Kitchen");
            assertThat(d.pricePaise()).isEqualTo(15050L);
            assertThat(d.distanceMeters()).isEqualTo(800);
        });
    }
}
