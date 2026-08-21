package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import in.craves.order.config.CatalogClientProperties;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class CatalogClientInternalAccessTest {

    @Test
    void getKitchenUsesInternalRouteAndSharedHeader() {
        UUID kitchenId = UUID.fromString("8990a560-5720-4273-be46-5a8e9fba1169");
        UUID identityId = UUID.fromString("cedc27bd-9cd2-46d4-8dcb-ca79acc9802d");

        CatalogClientProperties properties = properties("shared-internal-secret");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        CatalogClient client = new CatalogClient(properties, builder);

        server.expect(requestTo(
                "https://catalog.test/api/v1/catalog/internal/kitchens/" + kitchenId
            ))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("X-Craves-Internal-Key", "shared-internal-secret"))
            .andRespond(withSuccess(
                """
                    {
                      "id":"8990a560-5720-4273-be46-5a8e9fba1169",
                      "identityId":"cedc27bd-9cd2-46d4-8dcb-ca79acc9802d",
                      "kitchenName":"Test Kitchen",
                      "status":"ACTIVE"
                    }
                    """,
                MediaType.APPLICATION_JSON
            ));

        CatalogClient.CatalogKitchen kitchen = client.getKitchen(kitchenId);

        assertEquals(kitchenId, kitchen.id());
        assertEquals(identityId, kitchen.identityId());
        assertEquals("ACTIVE", kitchen.status());
        server.verify();
    }

    @Test
    void getKitchenFailsClosedWhenInternalCredentialIsMissing() {
        CatalogClientProperties properties = properties(" ");
        CatalogClient client = new CatalogClient(properties, RestClient.builder());

        ResponseStatusException exception = assertThrows(
            ResponseStatusException.class,
            () -> client.getKitchen(UUID.randomUUID())
        );

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, exception.getStatusCode());
        assertEquals("Catalog internal access is not configured", exception.getReason());
    }

    @Test
    void getKitchenRejectsSanitizedOrIncompleteInternalResponse() {
        UUID kitchenId = UUID.fromString("8990a560-5720-4273-be46-5a8e9fba1169");

        CatalogClientProperties properties = properties("shared-internal-secret");
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        CatalogClient client = new CatalogClient(properties, builder);

        server.expect(requestTo(
                "https://catalog.test/api/v1/catalog/internal/kitchens/" + kitchenId
            ))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header("X-Craves-Internal-Key", "shared-internal-secret"))
            .andRespond(withSuccess(
                """
                    {
                      "id":"8990a560-5720-4273-be46-5a8e9fba1169",
                      "identityId":null,
                      "kitchenName":"Test Kitchen",
                      "status":"ACTIVE"
                    }
                    """,
                MediaType.APPLICATION_JSON
            ));

        ResponseStatusException exception = assertThrows(
            ResponseStatusException.class,
            () -> client.getKitchen(kitchenId)
        );

        assertEquals(HttpStatus.BAD_GATEWAY, exception.getStatusCode());
        assertEquals("Catalog internal kitchen response is incomplete", exception.getReason());
        server.verify();
    }

    private static CatalogClientProperties properties(String internalAccessValue) {
        CatalogClientProperties properties = new CatalogClientProperties();
        properties.setBaseUrl("https://catalog.test/api/v1/catalog");
        properties.setInternalAccessValue(internalAccessValue);
        return properties;
    }
}
