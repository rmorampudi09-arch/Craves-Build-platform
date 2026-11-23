package in.craves.integration.delivery.borzo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.BorzoProperties;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateDeliveryRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.CreateReconciliationStatus;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateRejectedException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import java.math.BigDecimal;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

class BorzoApiClientTest {
    private static final String BASE_URL = "https://robotapitest-in.borzodelivery.com/api/business/1.8";
    private MockRestServiceServer server;
    private BorzoApiClient client;
    private BorzoProperties properties;

    @BeforeEach
    void setUp() {
        properties = new BorzoProperties();
        properties.setEnabled(true);
        properties.setCreateEnabled(true);
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
    void rollbackBlocksNewBookingsButKeepsExistingOrdersManageable() {
        properties.setCreateEnabled(false);

        assertThatThrownBy(() -> client.quote(quoteRequest()))
            .isInstanceOf(BorzoApiClient.BorzoApiException.class)
            .hasMessageContaining("new bookings are disabled");
        assertThatThrownBy(() -> client.create(
            new CreateDeliveryRequest("CRV-SUBORDER-123", quoteRequest())))
            .isInstanceOf(BorzoApiClient.BorzoApiException.class)
            .hasMessageContaining("new bookings are disabled");

        server.expect(requestTo(BASE_URL + "/orders?order_id=1250032&count=1"))
            .andRespond(withSuccess("""
                {"is_successful":true,"orders":[{"order_id":1250032,"status":"available"}]}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE_URL + "/courier?order_id=1250032"))
            .andRespond(withSuccess("{\"is_successful\":true,\"courier\":null}",
                MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE_URL + "/cancel-order"))
            .andRespond(withSuccess("""
                {"is_successful":true,"order":{"order_id":1250032,"status":"canceled"}}
                """, MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE_URL + "/orders?offset=0&count=50"))
            .andRespond(withSuccess("""
                {"is_successful":true,"orders_count":1,"orders":[
                  {"order_id":1250032,"created_datetime":"2026-07-24T08:30:00+05:30",
                   "status":"available","points":[{},
                     {"client_order_id":"CRV-SUBORDER-123","delivery":{"status":"planned"}}]}
                ]}
                """, MediaType.APPLICATION_JSON));

        assertThat(client.readOrder("1250032").providerDeliveryId()).isEqualTo("1250032");
        assertThat(client.readCourier("1250032")).isNull();
        assertThat(client.cancel("1250032").status())
            .isEqualTo(in.craves.integration.delivery.provider.DeliveryProviderAdapter.DeliveryStatus.CANCELLED);
        assertThat(client.reconcileCreate("CRV-SUBORDER-123",
            Instant.parse("2026-07-24T02:59:00Z")).status())
            .isEqualTo(CreateReconciliationStatus.FOUND);

        server.verify();
    }

    @Test
    void roundsGramWeightUpForAValidThermoboxQuote() {
        server.expect(requestTo(BASE_URL + "/calculate-order"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(header(BorzoApiClient.AUTH_HEADER, "sandbox-token"))
            .andExpect(content().json("""
                {
                  "type": "hyperlocal",
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
                  "type": "hyperlocal",
                  "points": [
                    {"note": "Craves order #0BDE0000. Match this number with the kitchen."},
                    {"client_order_id": "CRV-SUBORDER-123", "note": "Craves order #0BDE0000."}
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

    @Test
    void compactsUuidClientReferenceToBorzoMaximumLength() {
        String uuidReference = "397aeab4-4df3-489d-881a-796c68cfba3c";

        server.expect(requestTo(BASE_URL + "/create-order"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().json("""
                {
                  "points": [
                    {},
                    {"client_order_id": "397aeab44df3489d881a796c68cfba3c"}
                  ]
                }
                """, false))
            .andRespond(withSuccess("""
                {
                  "is_successful": true,
                  "order": {
                    "order_id": 1250033,
                    "order_name": "50033",
                    "status": "available",
                    "payment_amount": "125.50",
                    "delivery_fee_amount": "125.50",
                    "points": [
                      {"delivery": null},
                      {
                        "tracking_url": "https://example.test/track/2",
                        "delivery": {"status": "planned"}
                      }
                    ]
                  }
                }
                """, MediaType.APPLICATION_JSON));

        var delivery = client.create(
            new CreateDeliveryRequest(uuidReference, quoteRequest())
        );

        assertThat(delivery.providerDeliveryId()).isEqualTo("1250033");
        server.verify();
    }

    @Test
    void marksCreateOutcomeUncertainWhenTheProviderResponseIsNotReceived() {
        server.expect(requestTo(BASE_URL + "/create-order"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(request -> {
                throw new ResourceAccessException("read timed out");
            });

        ProviderCreateUncertainException error = catchThrowableOfType(
            () -> client.create(new CreateDeliveryRequest("CRV-SUBORDER-123", quoteRequest())),
            ProviderCreateUncertainException.class
        );

        assertThat(error.providerId()).isEqualTo("borzo");
        assertThat(error.clientReference()).isEqualTo("CRV-SUBORDER-123");
        assertThat(error.attemptedAt()).isNotNull();
        server.verify();
    }

    // The booking journal on (CRAVES_DELIVERY_BOOKING_JOURNAL_ENABLED): Borzo's answer is read as refused or unknown.

    @Test
    void aRefusalBorzoDocumentsAsNothingCreatedMovesOnAndAsksForOneLookup() {
        journal("verify");
        ProviderCreateRejectedException refused = refusedBy(HttpStatus.BAD_REQUEST,
            "{\"is_successful\":false,\"errors\":[\"invalid_parameters\"],\"parameter_errors\":{\"points\":[{},{\"contact_person\":{\"phone\":[\"invalid_phone\"]}}]}}");
        assertThat(refused.providerId()).isEqualTo("borzo");
        assertThat(refused.verifyLater()).isTrue();
        assertThat(refused).hasMessageContaining("invalid_parameters");
    }

    @Test
    void aRefusalInASuccessfulHttpAnswerIsStillARefusal() {
        journal("verify");
        assertThat(refusedBy(HttpStatus.OK, "{\"is_successful\":false,\"errors\":[\"insufficient_balance\"]}").verifyLater()).isTrue();
    }

    @Test
    void anOverloadedBorzoIsNotAskedToLookTheRefusalUp() {
        journal("verify");
        assertThat(refusedBy(HttpStatus.BAD_REQUEST, "{\"is_successful\":false,\"errors\":[\"requests_limit_exceeded\"]}").verifyLater()).isFalse();
        assertThat(refusedBy(HttpStatus.TOO_MANY_REQUESTS, "{\"is_successful\":false,\"errors\":[\"invalid_parameters\"]}").verifyLater()).isFalse();
    }

    @Test
    void trustedRefusalsAreNeverLookedUp() {
        journal("trust");
        assertThat(refusedBy(HttpStatus.BAD_REQUEST, "{\"is_successful\":false,\"errors\":[\"invalid_parameters\"]}").verifyLater()).isFalse();
    }

    @Test
    void aFailedConnectionIsNotProofTheRequestNeverLeft() {
        journal("verify");
        server.expect(requestTo(BASE_URL + "/create-order")).andRespond(request -> {
            throw new ResourceAccessException("connect failed", new java.net.ConnectException("Connection refused"));
        });
        assertThat(catchThrowableOfType(() -> client.create(new CreateDeliveryRequest("CRV-SUBORDER-123", quoteRequest())),
            ProviderCreateUncertainException.class)).isNotNull();
    }

    @Test
    void anythingBorzoDoesNotDocumentAsNothingCreatedStaysUnknown() {
        journal("verify");
        unknownAfter(HttpStatus.BAD_REQUEST, "{\"is_successful\":false,\"errors\":[\"order_is_duplicate\"]}");
        unknownAfter(HttpStatus.BAD_REQUEST, "{\"is_successful\":false,\"errors\":[\"unexpected_error\"]}");
        unknownAfter(HttpStatus.BAD_REQUEST, "{\"is_successful\":false,\"errors\":[\"invalid_parameters\",\"a_code_added_later\"]}");
        unknownAfter(HttpStatus.BAD_REQUEST, "{\"is_successful\":false,\"errors\":[]}");
        unknownAfter(HttpStatus.BAD_REQUEST, "<html>Bad Request</html>");
        unknownAfter(HttpStatus.INTERNAL_SERVER_ERROR, "{\"is_successful\":false,\"errors\":[\"invalid_parameters\"]}");
        unknownAfter(HttpStatus.SERVICE_UNAVAILABLE, "{\"is_successful\":false,\"errors\":[\"service_unavailable\"]}");
        unknownAfter(HttpStatus.UNAUTHORIZED, "");
    }

    @Test
    void refusalsAreUnknownAsBeforeWithTheJournalOffOrInUnknownMode() {
        unknownAfter(HttpStatus.BAD_REQUEST, "{\"is_successful\":false,\"errors\":[\"invalid_parameters\"]}");
        journal("unknown");
        unknownAfter(HttpStatus.BAD_REQUEST, "{\"is_successful\":false,\"errors\":[\"invalid_parameters\"]}");
    }

    private void journal(String borzoRefusals) {
        DeliveryCommandProperties commandProperties = new DeliveryCommandProperties();
        commandProperties.setBookingJournalEnabled(true);
        commandProperties.setBorzoRefusals(borzoRefusals);
        client.setCommandProperties(commandProperties);
    }

    private ProviderCreateRejectedException refusedBy(HttpStatus status, String body) {
        server.reset();
        server.expect(requestTo(BASE_URL + "/create-order")).andExpect(method(HttpMethod.POST))
            .andRespond(withStatus(status).contentType(MediaType.APPLICATION_JSON).body(body));
        ProviderCreateRejectedException refused = catchThrowableOfType(
            () -> client.create(new CreateDeliveryRequest("CRV-SUBORDER-123", quoteRequest())), ProviderCreateRejectedException.class);
        assertThat(refused).as("%s %s", status, body).isNotNull();
        server.verify();
        return refused;
    }

    private void unknownAfter(HttpStatus status, String body) {
        server.reset();
        server.expect(requestTo(BASE_URL + "/create-order")).andExpect(method(HttpMethod.POST))
            .andRespond(withStatus(status).contentType(MediaType.APPLICATION_JSON).body(body));
        assertThat(catchThrowableOfType(() -> client.create(new CreateDeliveryRequest("CRV-SUBORDER-123", quoteRequest())),
            ProviderCreateUncertainException.class)).as("%s %s", status, body).isNotNull();
        server.verify();
    }

    /** Webhook-first tracking's poll: the courier is read only for a reading that changes the job and has a rider. */
    @Test
    void webhookFirstPollReadsTheCourierOnlyForNewsAboutARiderAndEveryRequestIsCounted() {
        String assigned = """
            {"is_successful":true,"orders":[{"order_id":1250032,"status":"active","points":[{},{"delivery":{"status":"courier_assigned"}}]}]}
            """;
        server.expect(requestTo(BASE_URL + "/orders?order_id=1250032&count=1")).andRespond(withSuccess(assigned, MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE_URL + "/orders?order_id=1250032&count=1")).andRespond(withSuccess(assigned, MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE_URL + "/courier?order_id=1250032"))
            .andRespond(withSuccess("{\"is_successful\":true,\"courier\":{\"courier_id\":7,\"name\":\"Asha\"}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE_URL + "/orders?order_id=1250032&count=1")).andRespond(withSuccess("""
            {"is_successful":true,"orders":[{"order_id":1250032,"status":"available"}]}
            """, MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE_URL + "/orders?order_id=1250032&count=1"))
            .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).contentType(MediaType.APPLICATION_JSON).body("{}"));
        in.craves.integration.delivery.provider.CourierApiUsage.drainCalls();
        in.craves.integration.delivery.provider.CourierApiUsage.drainRateLimited();

        assertThat(client.track("1250032", delivery -> false).courier()).as("nothing new").isNull();
        assertThat(client.track("1250032", delivery -> true).courier().name()).isEqualTo("Asha");
        assertThat(client.track("1250032", delivery -> true).courier()).as("still searching: there is no rider to read").isNull();
        assertThatThrownBy(() -> client.track("1250032", delivery -> true)).isInstanceOf(BorzoApiClient.BorzoApiException.class);

        server.verify();
        assertThat(in.craves.integration.delivery.provider.CourierApiUsage.drainCalls()).containsEntry("borzo", 5L);
        assertThat(in.craves.integration.delivery.provider.CourierApiUsage.drainRateLimited()).containsEntry("borzo", 1L);
    }

    @Test
    void serverErrorAfterCreateRequestRequiresReconciliation() {
        server.expect(requestTo(BASE_URL + "/create-order"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withServerError());

        ProviderCreateUncertainException error = catchThrowableOfType(
            () -> client.create(new CreateDeliveryRequest("CRV-SUBORDER-123", quoteRequest())),
            ProviderCreateUncertainException.class
        );

        assertThat(error.providerId()).isEqualTo("borzo");
        server.verify();
    }

    @Test
    void malformedSuccessAfterCreateRequestRequiresReconciliation() {
        server.expect(requestTo(BASE_URL + "/create-order"))
            .andExpect(method(HttpMethod.POST))
            .andRespond(withSuccess("{\"is_successful\":true}", MediaType.APPLICATION_JSON));

        ProviderCreateUncertainException error = catchThrowableOfType(
            () -> client.create(new CreateDeliveryRequest("CRV-SUBORDER-123", quoteRequest())),
            ProviderCreateUncertainException.class
        );

        assertThat(error.providerId()).isEqualTo("borzo");
        server.verify();
    }

    @Test
    void reconcilesAnUncertainCreateByExactClientReference() {
        server.expect(requestTo(BASE_URL + "/orders?offset=0&count=50"))
            .andExpect(method(HttpMethod.GET))
            .andExpect(header(BorzoApiClient.AUTH_HEADER, "sandbox-token"))
            .andRespond(withSuccess("""
                {
                  "is_successful": true,
                  "orders_count": 1,
                  "orders": [
                    {
                      "order_id": 1250032,
                      "order_name": "50032",
                      "created_datetime": "2026-07-24T08:30:00+05:30",
                      "status": "available",
                      "payment_amount": "125.50",
                      "delivery_fee_amount": "125.50",
                      "points": [
                        {"client_order_id": null, "delivery": null},
                        {
                          "client_order_id": "CRV-SUBORDER-123",
                          "tracking_url": "https://example.test/track/1",
                          "delivery": {"status": "planned"}
                        }
                      ]
                    }
                  ]
                }
                """, MediaType.APPLICATION_JSON));

        var result = client.reconcileCreate(
            "CRV-SUBORDER-123",
            Instant.parse("2026-07-24T02:59:00Z")
        );

        assertThat(result.status()).isEqualTo(CreateReconciliationStatus.FOUND);
        assertThat(result.delivery().providerDeliveryId()).isEqualTo("1250032");
        assertThat(result.delivery().trackingUrl()).isEqualTo("https://example.test/track/1");
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
            "Craves order #0BDE0000. Match this number with the kitchen."
        );
        Stop dropoff = new Stop(
            "Gachibowli, Hyderabad, Telangana, India",
            "Craves Test Customer",
            "919999999992",
            new BigDecimal("17.4401"),
            new BigDecimal("78.3489"),
            null,
            null,
            "Craves order #0BDE0000."
        );
        return new QuoteRequest("Freshly prepared packaged food", 1250, true, pickup, dropoff);
    }
}
