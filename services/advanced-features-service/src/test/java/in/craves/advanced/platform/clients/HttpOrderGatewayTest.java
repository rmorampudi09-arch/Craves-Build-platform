package in.craves.advanced.platform.clients;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.clients.OrderGateway.OrderLine;
import in.craves.advanced.platform.web.ApiProblem;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

class HttpOrderGatewayTest {
    final ObjectMapper json = new ObjectMapper();

    @Test
    void readsOrderServicesOrderResponseWithMoneyInPaise() throws Exception {
        UUID order = UUID.randomUUID();
        UUID customer = UUID.randomUUID();
        UUID kitchen = UUID.randomUUID();
        UUID line = UUID.randomUUID();
        UUID dish = UUID.randomUUID();
        String body = """
                {"id":"%s","checkoutId":null,"customerIdentityId":"%s","kitchenId":"%s","kitchenName":"Amma's","status":"CHEF_ACCEPTED",
                 "currency":"INR","foodSubtotal":640.00,"grandTotal":700.50,
                 "items":[{"id":"%s","menuItemId":"%s","itemName":"Chicken dum biryani","category":"Mains","foodType":"NON_VEG",
                           "unitPrice":320.5,"quantity":2,"lineTotal":641.00}],
                 "createdAt":"2026-11-02T07:30:00Z","chefHandedOverAt":null}
                """.formatted(order, customer, kitchen, line, dish);
        Order parsed = HttpOrderGateway.order(json.readTree(body));
        assertThat(parsed).isEqualTo(new Order(order, customer, kitchen, "CHEF_ACCEPTED", List.of(
                new OrderLine(line, dish, "Chicken dum biryani", 32_050, 2)), 70_050L, java.time.Instant.parse("2026-11-02T07:30:00Z"), null));
        // Optional fields in an unexpected form read as missing instead of failing the whole order.
        Order odd = HttpOrderGateway.order(json.readTree(body.replace("700.50", "\"seven\"").replace("2026-11-02T07:30:00Z", "yesterday")));
        assertThat(odd.grandTotalPaise()).isNull();
        assertThat(odd.createdAt()).isNull();
        assertThat(odd.lines()).hasSize(1);
    }

    @Test
    void otherPeoplesOrdersReadAsMissingAndOutagesAsUnavailable() throws Exception {
        UUID id = UUID.randomUUID();
        var body = json.readTree("""
                {"id":"%s","customerIdentityId":"%s","kitchenId":"%s","status":"PAID","items":[]}
                """.formatted(id, UUID.randomUUID(), UUID.randomUUID()));
        Supplier<ApiProblem> down = () -> ApiProblem.unavailable("ORDERS_UNAVAILABLE", "down");
        assertThat(HttpOrderGateway.read(new GatewayHttp.Reply(200, body), down)).get().extracting(Order::id).isEqualTo(id);
        assertThat(HttpOrderGateway.read(new GatewayHttp.Reply(403, null), down)).isEmpty();
        assertThat(HttpOrderGateway.read(new GatewayHttp.Reply(404, null), down)).isEmpty();
        assertThatThrownBy(() -> HttpOrderGateway.read(new GatewayHttp.Reply(401, null), down))
                .hasFieldOrPropertyWithValue("code", "AUTHENTICATION_REQUIRED");
        assertThatThrownBy(() -> HttpOrderGateway.read(new GatewayHttp.Reply(502, null), down)).hasFieldOrPropertyWithValue("code", "ORDERS_UNAVAILABLE");
        assertThatThrownBy(() -> HttpOrderGateway.read(new GatewayHttp.Reply(200, json.readTree("{\"id\":1}")), down))
                .hasFieldOrPropertyWithValue("code", "ORDERS_UNAVAILABLE");
    }

    @Test
    void anUnexpectedShapeIsRefusedInsteadOfGuessed() {
        assertThatThrownBy(() -> HttpOrderGateway.order(json.readTree("{\"id\":\"x\"}"))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> HttpOrderGateway.order(json.readTree("""
                {"id":"%s","customerIdentityId":"%s","kitchenId":"%s","status":"PAID",
                 "items":[{"id":"%s","menuItemId":null,"itemName":"x","unitPrice":10.005,"quantity":1}]}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())))).isInstanceOf(ArithmeticException.class);
    }

    @Test
    void readsChefOrderPagesAndStopsWhenThereIsNoMore() throws Exception {
        String one = "{\"id\":\"%s\",\"customerIdentityId\":\"%s\",\"kitchenId\":\"%s\",\"status\":\"DELIVERED\",\"items\":[]}"
                .formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        OrderGateway.OrderPage more = HttpOrderGateway.page(json.readTree("{\"orders\":[" + one + "],\"nextCursor\":\"abc\",\"hasMore\":true}"));
        assertThat(more.orders()).hasSize(1);
        assertThat(more.nextCursor()).isEqualTo("abc");
        assertThat(HttpOrderGateway.page(json.readTree("{\"orders\":[],\"nextCursor\":\"abc\",\"hasMore\":false}")).nextCursor()).isNull();
        assertThat(HttpOrderGateway.page(json.readTree("{\"orders\":[],\"nextCursor\":null,\"hasMore\":true}")).nextCursor()).isNull();
    }
}
