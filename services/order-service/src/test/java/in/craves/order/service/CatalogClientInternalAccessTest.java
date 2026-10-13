package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.sun.net.httpserver.HttpServer;
import in.craves.order.config.CatalogClientProperties;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

class CatalogClientInternalAccessTest {

    @Test
    void getKitchenUsesInternalRouteAndSharedHeader() {
        UUID kitchenId = UUID.fromString("8990a560-5720-4273-be46-5a8e9fba1169");
        UUID identityId = UUID.fromString("cedc27bd-9cd2-46d4-8dcb-ca79acc9802d");

        CatalogClientProperties properties = properties("shared-internal-secret");
        RestClient.Builder builder = RestClient.builder().baseUrl(properties.getBaseUrl());
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        CatalogClient client = new CatalogClient(properties, builder.build());

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
        RestClient.Builder builder = RestClient.builder().baseUrl(properties.getBaseUrl());
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        CatalogClient client = new CatalogClient(properties, builder.build());

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

    @Test
    void getKitchenReadsTheOptionalAutoAcceptSettingsAndTreatsAbsentAsUnset() {
        UUID kitchenId = UUID.fromString("8990a560-5720-4273-be46-5a8e9fba1169");
        CatalogClientProperties properties = properties("shared-internal-secret");
        RestClient.Builder builder = RestClient.builder().baseUrl(properties.getBaseUrl());
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        CatalogClient client = new CatalogClient(properties, builder.build());
        String base = "\"id\":\"8990a560-5720-4273-be46-5a8e9fba1169\",\"identityId\":\"cedc27bd-9cd2-46d4-8dcb-ca79acc9802d\"";
        String url = "https://catalog.test/api/v1/catalog/internal/kitchens/" + kitchenId;
        server.expect(requestTo(url)).andRespond(withSuccess(
            "{" + base + ",\"autoAcceptOrders\":true,\"defaultPrepMinutes\":25}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(url)).andRespond(withSuccess("{" + base + "}", MediaType.APPLICATION_JSON));

        CatalogClient.CatalogKitchen on = client.getKitchen(kitchenId);
        CatalogClient.CatalogKitchen absent = client.getKitchen(kitchenId);

        assertEquals(Boolean.TRUE, on.autoAcceptOrders());
        assertEquals(25, on.defaultPrepMinutes());
        assertNull(absent.autoAcceptOrders());
        assertNull(absent.defaultPrepMinutes());
        server.verify();
    }

    @Test
    void aCatalogThatDoesNotAnswerInTimeFailsTheCallInsteadOfHoldingTheThreadForever() throws Exception {
        HttpServer stalled = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        stalled.createContext("/", exchange -> {
            try {
                Thread.sleep(3000);
                exchange.sendResponseHeaders(200, -1);
            } catch (Exception ignored) {
                // the client gave up and closed the connection
            } finally {
                exchange.close();
            }
        });
        stalled.start();
        try {
            CatalogClientProperties properties = properties("shared-internal-secret");
            properties.setBaseUrl("http://localhost:" + stalled.getAddress().getPort() + "/api/v1/catalog");
            properties.setReadTimeout(Duration.ofMillis(300));
            CatalogClient client = new CatalogClient(properties, RestClient.builder());

            // The auto-accept path catches RuntimeException around this call, so a timeout is a normal catalog failure.
            assertTimeoutPreemptively(Duration.ofSeconds(2), () -> {
                ResourceAccessException failure = assertThrows(ResourceAccessException.class,
                    () -> client.getActiveMenuItem(UUID.randomUUID()));
                assertTrue(String.valueOf(failure.getCause()).contains("timed out"), String.valueOf(failure.getCause()));
            });
        } finally {
            stalled.stop(0);
        }
    }

    @Test
    void theDefaultTimeoutsAreShortEnoughToProtectTheSchedulerThread() {
        CatalogClientProperties properties = new CatalogClientProperties();
        assertEquals(Duration.ofSeconds(2), properties.getConnectTimeout());
        assertEquals(Duration.ofSeconds(5), properties.getReadTimeout());
    }

    private static CatalogClientProperties properties(String internalAccessValue) {
        CatalogClientProperties properties = new CatalogClientProperties();
        properties.setBaseUrl("https://catalog.test/api/v1/catalog");
        properties.setInternalAccessValue(internalAccessValue);
        return properties;
    }
}
