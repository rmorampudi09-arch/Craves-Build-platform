package in.craves.order.delivery;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.delivery.DeliveryStatusModels.DeliveryStatusChangedData;
import in.craves.order.delivery.DeliveryStatusModels.EventEnvelope;
import in.craves.order.delivery.DeliveryStatusUpdateService.DeliveryStatusNonRetryableException;
import in.craves.order.delivery.DeliveryStatusUpdateService.DeliveryStatusRetryableException;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Handoff fields are hints only: an authenticated read must match the committed outbox event. */
@Component
public class DeliveryHandoffProofClient {
    private static final int MAX_PROOF_BYTES = 65_536;
    private final RestClient client;
    private final ObjectMapper json;
    private final String origin;
    private final String key;

    @org.springframework.beans.factory.annotation.Autowired
    public DeliveryHandoffProofClient(
        RestClient.Builder builder, ObjectMapper json,
        @Value("${CRAVES_DELIVERY_HANDOFF_INTEGRATION_ORIGIN:}") String origin,
        @Value("${CRAVES_INTERNAL_SERVICE_KEY:}") String key
    ) {
        this(secureClient(builder), json, origin, key);
    }

    DeliveryHandoffProofClient(RestClient client, ObjectMapper json, String origin, String key) {
        this.client = client;
        this.json = json.copy()
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_INTEGER_FOR_INTS)
            .enable(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
        this.origin = origin;
        this.key = key;
    }

    private static RestClient secureClient(RestClient.Builder builder) {
        var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(Duration.ofSeconds(10));
        return builder.clone().requestFactory(factory).build();
    }

    public void verify(EventEnvelope<DeliveryStatusChangedData> event, String rawPayload) {
        URI base = trustedOrigin();
        if (key == null || key.isBlank()) throw unavailable();
        try {
            URI target = base.resolve("/internal/v1/delivery-handoff-proof/"
                + event.data().deliveryJobId() + "/events/" + event.eventId());
            JsonNode proof = client.get().uri(target)
                .header("X-Craves-Internal-Secret", key)
                .accept(MediaType.APPLICATION_JSON)
                .exchange((request, response) -> {
                    if (response.getStatusCode().value() != 200) throw unavailable();
                    var contentType = response.getHeaders().getContentType();
                    if (contentType == null || !MediaType.APPLICATION_JSON.isCompatibleWith(contentType))
                        throw unavailable();
                    byte[] body = readBounded(response.getBody());
                    if (body.length == 0 || body.length > MAX_PROOF_BYTES) throw unavailable();
                    return json.readTree(body);
                });
            if (proof == null || !"1.0".equals(proof.path("proofVersion").asText())
                || !event.data().deliveryJobId().toString().equals(proof.path("deliveryJobId").asText())
                || !event.eventId().toString().equals(proof.path("eventId").asText()))
                throw unavailable();
            if ("NOT_CONFIRMED".equals(proof.path("state").asText())
                && !proof.hasNonNull("event")) throw rejected();
            if (!"COMPLETED".equals(proof.path("state").asText())
                || !proof.path("event").isObject()) throw unavailable();
            if (!proof.get("event").equals(json.readTree(rawPayload))) throw rejected();
        } catch (DeliveryStatusNonRetryableException | DeliveryStatusRetryableException exception) {
            throw exception;
        } catch (Exception exception) {
            // Do not persist URLs, credentials, response bodies, or provider data in error messages.
            throw unavailable();
        }
    }

    private static byte[] readBounded(java.io.InputStream body) throws java.io.IOException {
        // JdkClientHttpRequestFactory bounds response headers, not a stalled response body.
        var read = new java.util.concurrent.FutureTask<byte[]>(() -> body.readNBytes(MAX_PROOF_BYTES + 1));
        Thread.ofVirtual().name("delivery-handoff-proof-body").start(read);
        try {
            return read.get(10, java.util.concurrent.TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new java.io.IOException("Handoff proof read interrupted", exception);
        } catch (java.util.concurrent.ExecutionException | java.util.concurrent.TimeoutException exception) {
            throw new java.io.IOException("Handoff proof body unavailable", exception);
        } finally {
            if (!read.isDone()) {
                try { body.close(); } finally { read.cancel(true); }
            }
        }
    }

    private URI trustedOrigin() {
        try {
            URI uri = URI.create(origin);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                || !("".equals(uri.getPath()) || "/".equals(uri.getPath()))) throw unavailable();
            return uri;
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw unavailable();
        }
    }

    private static DeliveryStatusRetryableException unavailable() {
        return new DeliveryStatusRetryableException("Delivery handoff proof is temporarily unavailable");
    }

    private static DeliveryStatusNonRetryableException rejected() {
        return new DeliveryStatusNonRetryableException("Delivery handoff does not match committed evidence");
    }
}
