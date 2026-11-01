package in.craves.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.web.ApiDtos.PublicKitchenSummaryResponse;
import in.craves.catalog.web.DiscoveryDtos.NearbyKitchenSummaryResponse;
import org.junit.jupiter.api.Test;

/** Discovery lists cached before kitchen photos existed have no kitchenPhotoUrls; clients must still get []. */
class KitchenPhotoUrlsNeverNullTest {
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    @Test
    void nearbyKitchenCachedWithoutTheFieldReadsAsEmpty() throws Exception {
        var kitchen = json.readValue("{\"id\":\"11111111-1111-4111-8111-111111111111\",\"kitchenName\":\"K\",\"distanceMeters\":5,\"activeMenuItemCount\":1}",
            NearbyKitchenSummaryResponse.class);
        assertThat(kitchen.kitchenPhotoUrls()).isEmpty();
    }

    @Test
    void publicKitchenSummaryWithNullReadsAsEmpty() throws Exception {
        var kitchen = json.readValue("{\"id\":\"11111111-1111-4111-8111-111111111111\",\"kitchenName\":\"K\",\"activeMenuItemCount\":1,\"kitchenPhotoUrls\":null}",
            PublicKitchenSummaryResponse.class);
        assertThat(kitchen.kitchenPhotoUrls()).isEmpty();
    }
}
