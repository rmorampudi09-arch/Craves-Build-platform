package in.craves.userchef.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import in.craves.userchef.config.KitchenLaunchAlertProperties;
import in.craves.userchef.service.KitchenLaunchDiscovery.NearbyKitchen;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class KitchenLaunchDiscoveryTest {
    private static final String URL =
        "https://api.example.test/api/v1/discovery/kitchens?latitude=17.465&longitude=78.357&radiusMeters=10000&page=0&size=1";

    private KitchenLaunchAlertProperties properties;
    private MockRestServiceServer server;
    private KitchenLaunchDiscovery discovery;

    @BeforeEach
    void setUp() {
        properties = new KitchenLaunchAlertProperties();
        properties.setDiscoveryBaseUrl("https://api.example.test");
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        discovery = new KitchenLaunchDiscovery(properties, builder);
    }

    @Test
    void asksHomesNearbyQueryAndNamesTheFirstKitchen() {
        UUID id = UUID.randomUUID();
        server.expect(requestTo(URL)).andRespond(withSuccess(
            "{\"kitchens\":[{\"id\":\"" + id + "\",\"kitchenName\":\"Radha Kitchen LLP\",\"displayName\":\"Radha's Kitchen\"}]}",
            MediaType.APPLICATION_JSON));

        assertThat(discovery.firstKitchen(new BigDecimal("17.465"), new BigDecimal("78.357")))
            .contains(new NearbyKitchen(id, "Radha's Kitchen"));
        server.verify();
    }

    @Test
    void fallsBackToTheKitchenNameAndReportsNoneWhenTheListIsEmpty() {
        UUID id = UUID.randomUUID();
        server.expect(requestTo(URL)).andRespond(withSuccess(
            "{\"kitchens\":[{\"id\":\"" + id + "\",\"kitchenName\":\"Radha Kitchen\",\"displayName\":\" \"}]}",
            MediaType.APPLICATION_JSON));
        server.expect(requestTo(URL)).andRespond(withSuccess("{\"kitchens\":[]}", MediaType.APPLICATION_JSON));

        assertThat(discovery.firstKitchen(new BigDecimal("17.465"), new BigDecimal("78.357")))
            .contains(new NearbyKitchen(id, "Radha Kitchen"));
        assertThat(discovery.firstKitchen(new BigDecimal("17.465"), new BigDecimal("78.357"))).isEmpty();
        server.verify();
    }

    @Test
    void refusesToRunWithoutADiscoveryAddress() {
        properties.setDiscoveryBaseUrl("");

        assertThatThrownBy(() -> discovery.firstKitchen(BigDecimal.ONE, BigDecimal.ONE))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("CRAVES_DISCOVERY_BASE_URL");
    }
}
