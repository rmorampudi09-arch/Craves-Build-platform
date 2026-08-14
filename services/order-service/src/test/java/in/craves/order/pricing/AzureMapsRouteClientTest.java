package in.craves.order.pricing;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class AzureMapsRouteClientTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void readsDistanceAndTrafficDurationFromRoutePath() throws Exception {
        var root = objectMapper.readTree("""
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": {"type": "MultiLineString", "coordinates": []},
                  "properties": {
                    "type": "RoutePath",
                    "distanceInMeters": 6125,
                    "durationInSeconds": 901,
                    "durationTrafficInSeconds": 1020
                  }
                }
              ]
            }
            """);

        var route = AzureMapsRouteClient.parseRouteResponse(root);

        assertThat(route).isNotNull();
        assertThat(route.distanceMeters()).isEqualTo(6125L);
        assertThat(route.trafficDurationSeconds()).isEqualTo(1020L);
    }
}
