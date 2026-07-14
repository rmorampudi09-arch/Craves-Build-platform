package in.craves.integration.delivery.borzo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.BorzoProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateDeliveryRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import java.math.BigDecimal;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class BorzoApiClientTest {
    private static final String BASE_URL = "https://robotapitest-in.borzodelivery.com/api/business/1.8";
    private MockRestServiceServer server;
    private BorzoApiClient client;

    @BeforeEach
    void setUp() {
        BorzoProperties properties = new BorzoProperties();
        properties.setEnabled(true);
        properties.setBaseUrl(BASE_URL);
        properties.setAuthToken("sandbox-token");

        RestClient.Builder builder = RestClient.builder()
            .defaultHeader(BorzoApiClient.AUTH_HEADER, properties.getAuthToken());
        server = MockRestServiceServer.bindTo(builder).build();
        client = new BorzoApiClient(
            properties,
            new ObjectMapper(),
            new BorzoStatusMapper(),
            builder.build()
        );
    }

    @Test
    void roundsGramWeightUpForAValidThermoboxQuote() {
        server.expect(requestTo(BASE_URL + "/calculate-order"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header(BorzoApiClient.AUTH_HEADER, "sandbox-token"))
            .andExpect(content().json("""
                {
                  "type": "standard",
                  "matter": "Freshly prepared packaged food",
                  "vehicle_type_id": 8,
                  "total_weight_kg": 2,
                  "is_thermobox_required": true
                }
                """, false))
            .andRespond(withSuccess("""
                {
                  "is_successful": true,
                  "order": {
                    "payment_amount": "125.50",
                    "delivery_fee_amount": "125.50",
                    "is_thermobox_required": true
                  },
                  "warnings": [],
                  "parameter_warnings": {}
                }
                """, MediaType.APPLICATION_JSON));

        var quote = client.quote(quoteRequest());

        assertThat(quote.available()).isTrue();
        assertThat(quote.paymentAmount()).isEqualByComparingTo("125.50");
        assertThat(quote.currency()).isEqualTo("INR");
        server.verify();
    }

    @Test
    void createsAnOrderWithTheCravesClientReference() {
        server.expect(requestTo(BASE_URL + "/create-order"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().json("""
                {
                  "points": [
                    {},
                    {"client_order_id": "CRV-SUBORDER-123"}
                  ]
                }
                """, false))
            .andRespond(withSuccess("""
                {
                  "is_successful": true,
                  "order": {
                    "order_id": 1250032,
                    "order_name": "50032",
                    "status": "available",
                    "payment_amount": "125.50",
                    "delivery_fee_amount": "125.50",
                    "points": [
                      {"delivery": null},
                      {
                        "tracking_url": "https://example.test/track/1",
                        "delivery": {"status": "planned"}
                      }
                    ]
                  }
                }
                """, MediaType.APPLICATION_JSON));

        var delivery = client.create(new CreateDeliveryRequest("CRV-SUBORDER-123", quoteRequest()));

        assertThat(delivery.providerDeliveryId()).isEqualTo("1250032");
        assertThat(delivery.providerStatus()).isEqualTo("planned");
        assertThat(delivery.trackingUrl()).isEqualTo("https://example.test/track/1");
        server.verify();
    }

    private static QuoteRequest quoteRequest() {
        Stop pickup = new Stop(
            "Madhapur, Hyderabad, Telangana, India",
            "Craves Test Chef",
            "919999999991",
            new BigDecimal("17.4483"),
            new BigDecimal("78.3915"),
            null,
            null,
            "Sandbox pickup"
        );
        Stop dropoff = new Stop(
            "Gachibowli, Hyderabad, Telangana, India",
            "Craves Test Customer",
            "919999999992",
            new BigDecimal("17.4401"),
            new BigDecimal("78.3489"),
            null,
            null,
            "Sandbox dropoff"
        );
        return new QuoteRequest("Freshly prepared packaged food", 1250, true, pickup, dropoff);
    }
}
