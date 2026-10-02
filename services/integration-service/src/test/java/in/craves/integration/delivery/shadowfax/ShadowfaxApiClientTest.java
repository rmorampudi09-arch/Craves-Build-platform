package in.craves.integration.delivery.shadowfax;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.ShadowfaxProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateDeliveryRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ShipmentItem;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ShadowfaxApiClientTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void createTreatsHttp5xxAsUncertain() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://shadowfax.example/api/v2/orders/"))
            .andRespond(withServerError());
        ShadowfaxApiClient client = new ShadowfaxApiClient(readyProperties(), mapper, builder.build());

        assertThatThrownBy(() -> client.create(createRequest()))
            .isInstanceOf(ProviderCreateUncertainException.class);

        server.verify();
    }

    @Test
    void createTreatsMissingProviderOrderIdAsUncertain() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://shadowfax.example/api/v2/orders/"))
            .andRespond(withSuccess("""
                {"client_order_id":"client-123","order_status":"NEW"}
                """, MediaType.APPLICATION_JSON));
        ShadowfaxApiClient client = new ShadowfaxApiClient(readyProperties(), mapper, builder.build());

        assertThatThrownBy(() -> client.create(createRequest()))
            .isInstanceOf(ProviderCreateUncertainException.class);

        server.verify();
    }

    @Test
    void createTreatsClientReferenceMismatchAsUncertain() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://shadowfax.example/api/v2/orders/"))
            .andRespond(withSuccess("""
                {"sfx_order_id":"123456","client_order_id":"different-reference","order_status":"NEW"}
                """, MediaType.APPLICATION_JSON));
        ShadowfaxApiClient client = new ShadowfaxApiClient(readyProperties(), mapper, builder.build());

        assertThatThrownBy(() -> client.create(createRequest()))
            .isInstanceOf(ProviderCreateUncertainException.class);

        server.verify();
    }

    private CreateDeliveryRequest createRequest() {
        return new CreateDeliveryRequest("client-123", quoteRequest());
    }

    private QuoteRequest quoteRequest() {
        Stop pickup = new Stop(
            "Madhapur, Hyderabad",
            "Chef",
            "9876543210",
            new BigDecimal("17.4483"),
            new BigDecimal("78.3915"),
            null,
            null,
            "Pickup",
            "Plot 1",
            null,
            null,
            "Madhapur",
            "Hyderabad",
            "Telangana",
            "500081",
            "IN"
        );
        Stop dropoff = new Stop(
            "Gachibowli, Hyderabad",
            "Customer",
            "9876543211",
            new BigDecimal("17.4401"),
            new BigDecimal("78.3489"),
            null,
            null,
            "Dropoff",
            "Tower 2",
            null,
            null,
            "Gachibowli",
            "Hyderabad",
            "Telangana",
            "500032",
            "IN"
        );
        return new QuoteRequest(
            "Packaged food",
            2000,
            true,
            pickup,
            dropoff,
            List.of(new ShipmentItem(UUID.randomUUID(), "Meal", new BigDecimal("250.00"), 1, new BigDecimal("250.00"))),
            new BigDecimal("250.00"),
            "PREPAID",
            UUID.randomUUID()
        );
    }

    private ShadowfaxProperties readyProperties() {
        ShadowfaxProperties properties = new ShadowfaxProperties();
        properties.setEnabled(true);
        properties.setCreateEnabled(true);
        properties.setAccountProductVerified(true);
        properties.setBaseUrl("https://shadowfax.example");
        properties.setAuthToken("token");
        properties.setClientCode("client");
        properties.setWebhookToken("webhook-token");
        return properties;
    }
}
