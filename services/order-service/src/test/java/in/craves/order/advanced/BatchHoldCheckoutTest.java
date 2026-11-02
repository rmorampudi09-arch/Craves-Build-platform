package in.craves.order.advanced;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import in.craves.order.web.ApiDtos.OrderItemResponse;
import in.craves.order.web.ApiDtos.OrderResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class BatchHoldCheckoutTest {
    private final ObjectMapper json = new ObjectMapper();
    private final UUID biryani = UUID.randomUUID(), raita = UUID.randomUUID(), hold = UUID.randomUUID(), order = UUID.randomUUID();

    @Test
    void parsingRefusesAnythingButOneHoldPerDish() throws Exception {
        assertEquals(Map.of(biryani, hold), BatchHoldCheckout.parse(json.readTree("[{\"holdId\":\"" + hold + "\",\"menuItemId\":\"" + biryani + "\"}]")));
        for (String bad : List.of("{}", "[]", "[{\"holdId\":\"x\",\"menuItemId\":\"" + biryani + "\"}]",
            "[{\"holdId\":\"" + hold + "\",\"menuItemId\":\"" + biryani + "\",\"extra\":1}]",
            "[{\"holdId\":\"" + hold + "\",\"menuItemId\":\"" + biryani + "\"},{\"holdId\":\"" + UUID.randomUUID() + "\",\"menuItemId\":\"" + biryani + "\"}]",
            "[{\"holdId\":\"" + hold + "\",\"menuItemId\":\"" + biryani + "\"},{\"holdId\":\"" + hold + "\",\"menuItemId\":\"" + raita + "\"}]")) {
            assertEquals(HttpStatus.BAD_REQUEST, assertThrows(OrderApiException.class, () -> BatchHoldCheckout.parse(json.readTree(bad))).status(), bad);
        }
    }

    @Test
    void confirmsEachHoldWithItsChefOrderDishAndOrderedQuantity() {
        var builder = RestClient.builder().baseUrl("https://api.test");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://api.test/api/v1/advanced/kitchen-capacity/holds/" + hold + "/confirm"))
            .andExpect(method(HttpMethod.POST)).andExpect(header("Authorization", "Bearer customer"))
            .andExpect(content().json("{\"orderId\":\"" + order + "\",\"menuItemId\":\"" + biryani + "\",\"maxPortions\":3}", true))
            .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        new BatchHoldCheckout(builder.build()).confirm(checkout(), Map.of(biryani, hold), "Bearer customer");
        server.verify();
    }

    @Test
    void refusedOrUnreachableHoldsStopTheCheckout() {
        var builder = RestClient.builder().baseUrl("https://api.test");
        var server = MockRestServiceServer.bindTo(builder).build();
        var service = new BatchHoldCheckout(builder.build());
        server.expect(requestTo("https://api.test/api/v1/advanced/kitchen-capacity/holds/" + hold + "/confirm"))
            .andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"HOLD_EXPIRED\"}"));
        var refused = assertThrows(OrderApiException.class, () -> service.confirm(checkout(), Map.of(biryani, hold), "Bearer customer"));
        assertEquals(HttpStatus.CONFLICT, refused.status());
        assertEquals("BATCH_HOLD_HOLD_EXPIRED", refused.code());

        server.reset();
        server.expect(requestTo("https://api.test/api/v1/advanced/kitchen-capacity/holds/" + hold + "/confirm")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE,
            assertThrows(OrderApiException.class, () -> service.confirm(checkout(), Map.of(biryani, hold), "Bearer customer")).status());

        assertEquals(HttpStatus.CONFLICT,
            assertThrows(OrderApiException.class, () -> service.confirm(checkout(), Map.of(UUID.randomUUID(), hold), "Bearer customer")).status());
        assertEquals(HttpStatus.CONFLICT, assertThrows(OrderApiException.class, () -> service.confirm(checkout(), Map.of(biryani, hold), null)).status());
    }

    private CheckoutResponse checkout() {
        var items = List.of(item(biryani, 2), item(raita, 1), item(biryani, 1));
        var chefOrder = new OrderResponse(order, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "K", null, "INR", BigDecimal.TEN, BigDecimal.ZERO,
            BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.TEN, null, null, null, null, items, Instant.EPOCH, Instant.EPOCH);
        return new CheckoutResponse(UUID.randomUUID(), UUID.randomUUID(), null, "INR", BigDecimal.TEN, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
            BigDecimal.TEN, null, null, null, List.of(chefOrder), Instant.EPOCH);
    }

    private static OrderItemResponse item(UUID dish, int quantity) {
        return new OrderItemResponse(UUID.randomUUID(), dish, "Dish", "MAIN", "VEG", BigDecimal.ONE, quantity, BigDecimal.valueOf(quantity));
    }
}
