package in.craves.subscription.address;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.subscription.exception.ApiException;
import java.io.IOException;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class SubscriptionDeliveryAddressClientTest {
    static final UUID CUSTOMER = UUID.fromString("33333333-3333-4333-8333-333333333333");
    static final UUID ADDRESS = UUID.fromString("66666666-6666-4666-8666-666666666666");
    static final String SECRET = "synthetic-test-internal-secret";
    MockRestServiceServer server;
    SubscriptionDeliveryAddressClient client;

    @BeforeEach void setup() {
        var builder = RestClient.builder().baseUrl("http://localhost");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new SubscriptionDeliveryAddressClient(builder.build(), SECRET);
    }

    static ObjectNode validAddress() {
        return new ObjectMapper().createObjectNode().put("id", ADDRESS.toString()).put("identityId", CUSTOMER.toString())
            .put("active", true).put("addressLabel", "Home").put("recipientName", "Synthetic Customer")
            .put("contactPhoneNumber", "+919999999999").put("addressLine1", "1 Test Road").put("areaName", "Test Area")
            .put("city", "Hyderabad").put("state", "Telangana").put("postalCode", "500001")
            .put("latitude", 17.385).put("longitude", 78.4867);
    }

    void respond(String body) {
        server.expect(requestTo("http://localhost/internal/v1/customer-addresses/" + ADDRESS + "?identityId=" + CUSTOMER))
            .andExpect(method(HttpMethod.GET)).andExpect(header("X-Craves-Internal-Secret", SECRET))
            .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    }

    void rejects(int status, String code) {
        ApiException error = assertThrows(ApiException.class, () -> client.requireEligible(CUSTOMER, ADDRESS));
        assertEquals(status, error.getStatus());
        assertEquals(code, error.getCode());
        assertFalse(error.toString().contains(SECRET));
        server.verify();
    }

    @Test void completeOwnedActiveAddressIsAccepted() {
        respond(validAddress().put("extraIgnoredField", "value").toString());
        assertDoesNotThrow(() -> client.requireEligible(CUSTOMER, ADDRESS));
        server.verify();
    }

    @ParameterizedTest @ValueSource(strings = {"id", "identityId"})
    void mismatchedAddressOrOwnerIsRejected(String field) {
        respond(validAddress().put(field, UUID.randomUUID().toString()).toString());
        rejects(404, "DELIVERY_ADDRESS_NOT_AVAILABLE");
    }

    @Test void inactiveAddressIsRejected() {
        respond(validAddress().put("active", false).toString());
        rejects(404, "DELIVERY_ADDRESS_NOT_AVAILABLE");
    }

    @ParameterizedTest @ValueSource(strings = {"addressLabel", "recipientName", "contactPhoneNumber", "addressLine1", "areaName", "city", "state", "postalCode"})
    void blankRequiredFieldsAreRejected(String field) {
        respond(validAddress().put(field, "  ").toString());
        rejects(400, "DELIVERY_ADDRESS_INCOMPLETE");
    }

    @ParameterizedTest @ValueSource(strings = {"latitude", "longitude"})
    void missingCoordinatesAreRejected(String field) {
        respond(validAddress().putNull(field).toString());
        rejects(400, "DELIVERY_ADDRESS_INCOMPLETE");
    }

    @Test void coordinateBoundsAndPhoneAreEnforced() {
        for (String field : new String[]{"latitude", "longitude", "contactPhoneNumber"}) {
            server.reset();
            ObjectNode body = validAddress();
            if (field.equals("contactPhoneNumber")) body.put(field, "invalid");
            else body.put(field, -181);
            respond(body.toString());
            rejects(400, "DELIVERY_ADDRESS_INCOMPLETE");
        }
    }

    @Test void coordinateBoundariesRemainValid() {
        respond(validAddress().put("latitude", -90).put("longitude", 180).toString());
        assertDoesNotThrow(() -> client.requireEligible(CUSTOMER, ADDRESS));
        server.verify();
    }

    @ParameterizedTest @ValueSource(strings = {"id", "identityId", "active"})
    void missingRequiredEnvelopeIsUnavailable(String field) {
        respond(validAddress().putNull(field).toString());
        rejects(503, "DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE");
    }

    @ParameterizedTest @ValueSource(strings = {"", "null", "{broken-json", "{\"id\":\"not-a-uuid\"}"})
    void malformedOrEmptyResponseFailsClosed(String body) {
        respond(body);
        rejects(503, "DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE");
    }

    @Test void notFoundDoesNotExposeUpstreamBody() {
        server.expect(anything()).andRespond(withStatus(HttpStatus.NOT_FOUND).body("private upstream details " + SECRET));
        rejects(404, "DELIVERY_ADDRESS_NOT_AVAILABLE");
    }

    @ParameterizedTest @ValueSource(ints = {400, 401, 403, 429, 500, 503})
    void upstreamFailuresAreSafeUnavailable(int status) {
        server.expect(anything()).andRespond(withStatus(HttpStatus.valueOf(status)).body("private upstream details " + SECRET));
        rejects(503, "DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE");
    }

    @ParameterizedTest @ValueSource(ints = {201, 202, 301, 302, 307, 308})
    void unexpectedSuccessOrRedirectWithValidBodyCannotGrantEligibility(int status) {
        server.expect(anything()).andRespond(withStatus(HttpStatus.valueOf(status))
            .contentType(MediaType.APPLICATION_JSON).body(validAddress().toString()));
        rejects(503, "DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE");
    }

    @Test void transportFailureFailsClosed() {
        server.expect(anything()).andRespond(withException(new IOException("synthetic timeout " + SECRET)));
        rejects(503, "DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE");
    }

    @Test void noSecretPreventsAnyRequest() {
        client = new SubscriptionDeliveryAddressClient(RestClient.create("http://localhost:1"), " ");
        rejects(503, "DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE");
    }

    @ParameterizedTest @ValueSource(strings = {"", " ", "not a url", "http://upstream.example", "https://user:secret@upstream.example", "https://upstream.example/?key=secret", "https://upstream.example/path"})
    void invalidConfigurationDoesNotBreakConstructionAndFailsOnlyOperation(String baseUrl) {
        client = new SubscriptionDeliveryAddressClient(baseUrl, SECRET, RestClient.builder());
        rejects(503, "DELIVERY_ADDRESS_LOOKUP_UNAVAILABLE");
    }

    @Test void absentIdentifiersDoNotCallUpstream() {
        assertEquals(400, assertThrows(ApiException.class, () -> client.requireEligible(null, ADDRESS)).getStatus());
        assertEquals(400, assertThrows(ApiException.class, () -> client.requireEligible(CUSTOMER, null)).getStatus());
        server.verify();
    }
}
