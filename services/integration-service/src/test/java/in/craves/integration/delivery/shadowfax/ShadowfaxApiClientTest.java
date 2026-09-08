package in.craves.integration.delivery.shadowfax;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.ShadowfaxProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateDeliveryRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderQuote;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ShipmentItem;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class ShadowfaxApiClientTest {
    private MockRestServiceServer server;
    private ShadowfaxApiClient client;

    @BeforeEach
    void setUp() {
        ShadowfaxProperties properties = new ShadowfaxProperties();
        properties.setEnabled(true);
        properties.setBaseUrl(ShadowfaxProperties.STAGING_BASE_URL);
        properties.setAuthToken("staging-token");
        properties.setClientCode("craves001");
        properties.setMaximumAcceptedEtaMinutes(60);
        RestClient.Builder builder = RestClient.builder()
            .defaultHeader(ShadowfaxApiClient.AUTH_HEADER, "Token staging-token");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new ShadowfaxApiClient(
            properties, new ObjectMapper(), new ShadowfaxStatusMapper(), builder.build()
        );
    }

    @Test
    void quotesOnlyFromTheHyperlocalServiceabilityEndpoint() {
        server.expect(requestTo(ShadowfaxProperties.STAGING_BASE_URL + "/api/v1/order-serviceability/"))
            .andExpect(method(HttpMethod.PUT))
            .andExpect(header("Authorization", "Token staging-token"))
            .andExpect(content().json("""
                {
                  "pickup_latitude":"17.4401",
                  "pickup_longitude":"78.3489",
                  "drop_latitude":"17.4435",
                  "drop_longitude":"78.3772",
                  "paid":"true",
                  "stage_of_check":"pre_order",
                  "order_value":350,
                  "rain_flag":false,
                  "client_surge":0
                }
                """))
            .andRespond(withSuccess("""
                {
                  "serviceable":true,
                  "delivery_cost":78.50,
                  "pickup_eta":8,
                  "drop_eta":22,
                  "rain_surge_amount":0
                }
                """, MediaType.APPLICATION_JSON));

        ProviderQuote quote = client.quote(request());

        assertThat(quote.available()).isTrue();
        assertThat(quote.deliveryFeeAmount()).isEqualByComparingTo("78.50");
        assertThat(quote.providerMetadata().path("total_eta_minutes").asInt()).isEqualTo(30);
        server.verify();
    }

    @Test
    void createsARealHyperlocalMarketplaceOrder() {
        QuoteRequest quoteRequest = request();
        ProviderQuote quote = new ProviderQuote(
            "shadowfax", true, new BigDecimal("350"), new BigDecimal("78.50"),
            "INR", List.of(), new ObjectMapper().createObjectNode(), Instant.now()
        );
        server.expect(requestTo(ShadowfaxProperties.STAGING_BASE_URL + "/api/v2/orders/"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().json("""
                {
                  "has_tip":false,
                  "tip_amount":0,
                  "client_code":"craves001",
                  "order_details":{
                    "order_value":350,
                    "paid":"true",
                    "client_order_id":"CRV_SUBORDER_123",
                    "rain_flag":false
                  },
                  "pickup_details":{"city":"Hyderabad"},
                  "drop_details":{"city":"Hyderabad"},
                  "order_items":[{"name":"Meal","price":350,"quantity":1}]
                }
                """, false))
            .andRespond(withSuccess("""
                {
                  "message":"Success",
                  "data":{
                    "client_code":"craves001",
                    "status":"ACCEPTED",
                    "sfx_order_id":20611002,
                    "order_details":{"client_order_id":"CRV_SUBORDER_123"},
                    "track_url":"https://api.shadowfax.in/track/example/",
                    "delivery_cost":78.50
                  }
                }
                """, MediaType.APPLICATION_JSON));

        var delivery = client.create(
            new CreateDeliveryRequest("CRV_SUBORDER_123", quoteRequest, quote)
        );

        assertThat(delivery.providerDeliveryId()).isEqualTo("20611002");
        assertThat(delivery.providerStatus()).isEqualTo("ACCEPTED");
        assertThat(delivery.status().name()).isEqualTo("SEARCHING");
        server.verify();
    }

    private static QuoteRequest request() {
        UUID itemId = UUID.fromString("04c05d75-3cd6-4dff-a79d-1aa82a0ebacf");
        Stop pickup = new Stop(
            "Kitchen, Gachibowli", "Chef", "9876543210",
            new BigDecimal("17.4401"), new BigDecimal("78.3489"),
            OffsetDateTime.parse("2026-09-08T19:00:00+05:30"),
            OffsetDateTime.parse("2026-09-08T19:15:00+05:30"), null,
            null, null, null, null, "Hyderabad", "Telangana", "500032", "IN"
        );
        Stop drop = new Stop(
            "Customer, Madhapur", "Customer", "9987654321",
            new BigDecimal("17.4435"), new BigDecimal("78.3772"),
            null, null, null, null, null, null, null,
            "Hyderabad", "Telangana", "500081", "IN"
        );
        return new QuoteRequest(
            "Fresh meal", 750, true, pickup, drop,
            List.of(new ShipmentItem(itemId, "Meal", new BigDecimal("350"), 1, new BigDecimal("350"))),
            new BigDecimal("350"), "PREPAID", UUID.randomUUID()
        );
    }
}
