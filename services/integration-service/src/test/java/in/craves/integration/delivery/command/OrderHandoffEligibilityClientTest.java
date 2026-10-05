package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withForbiddenRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.net.SocketTimeoutException;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OrderHandoffEligibilityClientTest {
    private static final String BASE = "https://order.internal/internal/v1";
    private final UUID subOrder = UUID.fromString("20000000-0000-0000-0000-000000000001");
    private final UUID checkout = UUID.fromString("20000000-0000-0000-0000-000000000002");
    private final UUID job = UUID.fromString("20000000-0000-0000-0000-000000000003");
    private MockRestServiceServer server;
    private OrderHandoffEligibilityClient client;

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder().baseUrl(BASE);
        server = MockRestServiceServer.bindTo(builder).build();
        client = new OrderHandoffEligibilityClient(builder.build(), "test-internal-key");
    }

    @Test
    void acceptsOnlyAnExplicitEligibleReplyForTheExactDeliveryIdentity() {
        expect().andRespond(withSuccess("{\"eligible\":true}", MediaType.APPLICATION_JSON));
        assertThat(client.eligible(subOrder, checkout, job, "borzo-42")).isTrue();
        server.verify();
    }

    @Test
    void refusesCommerciallyIneligibleOrder() {
        expect().andRespond(withSuccess("{\"eligible\":false}", MediaType.APPLICATION_JSON));
        assertThat(client.eligible(subOrder, checkout, job, "borzo-42")).isFalse();
        server.verify();
    }

    @Test
    void refusesForbiddenMalformedAndTimedOutChecks() {
        expect().andRespond(withForbiddenRequest());
        assertThatThrownBy(() -> client.eligible(subOrder, checkout, job, "borzo-42"))
            .isInstanceOf(RuntimeException.class);
        server.verify();

        server.reset();
        expect().andRespond(withSuccess("{\"wrong\":true}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.eligible(subOrder, checkout, job, "borzo-42"))
            .isInstanceOf(IllegalStateException.class);
        server.verify();

        server.reset();
        expect().andRespond(withException(new SocketTimeoutException("timed out")));
        assertThatThrownBy(() -> client.eligible(subOrder, checkout, job, "borzo-42"))
            .isInstanceOf(RuntimeException.class);
        server.verify();
    }

    @Test
    void missingCredentialAndIdentityNeverCallOrderService() {
        assertThatThrownBy(() -> new OrderHandoffEligibilityClient(
            RestClient.builder().baseUrl(BASE).build(), " ")
            .eligible(subOrder, checkout, job, "borzo-42"))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> client.eligible(subOrder, checkout, job, " "))
            .isInstanceOf(IllegalArgumentException.class);
        server.verify();
    }

    private org.springframework.test.web.client.ResponseActions expect() {
        return server.expect(requestTo(BASE + "/delivery-handoff-eligibility/" + subOrder
                + "?checkoutId=" + checkout + "&deliveryJobId=" + job
                + "&borzoProviderDeliveryId=borzo-42"))
            .andExpect(header("X-Craves-Internal-Secret", "test-internal-key"));
    }
}
