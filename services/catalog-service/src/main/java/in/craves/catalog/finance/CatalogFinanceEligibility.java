package in.craves.catalog.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.exception.ApiException;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class CatalogFinanceEligibility {
    public record Snapshot(UUID requestId, Instant evaluatedAt, boolean complete, UUID policyId,
                           long revision, String hash, List<UUID> eligibleChefIds) {
        public Set<UUID> chefs() { return Set.copyOf(eligibleChefIds); }
        public String sqlArray() { return "{" + String.join(",", eligibleChefIds.stream().map(UUID::toString).toList()) + "}"; }
    }
    private final String origin;
    private final String key;
    private final ObjectMapper json;
    private final HttpClient http;
    @Autowired
    public CatalogFinanceEligibility(
        @Value("${CRAVES_CATALOG_FINANCE_ORIGIN:}") String origin,
        @Value("${CRAVES_CATALOG_FINANCE_READ_KEY:}") String key, ObjectMapper json) {
        this(origin, key, json, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build());
    }
    CatalogFinanceEligibility(String origin, String key, ObjectMapper json, HttpClient http) {
        this.origin = origin; this.key = key; this.json = json; this.http = http;
    }
    /** No local cache: every public request obtains fresh signed authority before Redis. */
    public Snapshot current() {
        try {
            URI uri = URI.create(origin);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))
                || key == null || key.length() < 32 || key.length() > 512) throw unavailable();
            UUID requestId = UUID.randomUUID();
            byte[] body = ("{\"requestId\":\"" + requestId + "\"}").getBytes(StandardCharsets.UTF_8);
            String timestamp = Long.toString(Instant.now().getEpochSecond());
            HttpRequest request = HttpRequest.newBuilder(uri.resolve(CatalogEligibilityProtocol.PATH))
                .timeout(Duration.ofSeconds(5)).header("Content-Type", "application/json")
                .header(CatalogEligibilityProtocol.TIMESTAMP, timestamp)
                .header(CatalogEligibilityProtocol.SIGNATURE, CatalogEligibilityProtocol.sign(key, "POST", timestamp, body))
                .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
            var pending = http.sendAsync(request, info -> new BoundedBody());
            try {
                HttpResponse<byte[]> response = pending.get(5, TimeUnit.SECONDS);
                if (response.statusCode() != 200) throw unavailable();
                return verify(requestId, response.body(), response.headers().firstValue(CatalogEligibilityProtocol.TIMESTAMP).orElse(null),
                    response.headers().firstValue(CatalogEligibilityProtocol.SIGNATURE).orElse(null), Instant.now());
            } finally { if (!pending.isDone()) pending.cancel(true); }
        } catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw unavailable(); }
        catch (Exception ex) { throw unavailable(); }
    }
    Snapshot verify(UUID requestId, byte[] raw, String timestamp, String signature, Instant now) {
        try {
            if (raw.length > CatalogEligibilityProtocol.MAX_RESPONSE_BYTES || timestamp == null || !timestamp.matches("[0-9]{10}")
                || Math.abs(now.getEpochSecond() - Long.parseLong(timestamp)) > 15
                || !CatalogEligibilityProtocol.matches(CatalogEligibilityProtocol.sign(key, "RESPONSE", timestamp, raw), signature))
                throw unavailable();
            var node = json.reader().with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .with(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readTree(raw);
            var names = new HashSet<String>();
            node.fieldNames().forEachRemaining(names::add);
            if (!node.isObject() || !names.equals(Set.of("requestId", "evaluatedAt", "complete", "policyId", "revision", "hash", "eligibleChefIds"))
                || !node.path("complete").isBoolean() || !node.path("complete").booleanValue()
                || !node.path("revision").isIntegralNumber() || !node.path("revision").canConvertToLong()
                || !node.path("eligibleChefIds").isArray()) throw unavailable();
            Snapshot snapshot = json.treeToValue(node, Snapshot.class);
            if (!requestId.equals(snapshot.requestId()) || snapshot.evaluatedAt() == null
                || snapshot.evaluatedAt().isBefore(now.minusSeconds(15)) || snapshot.evaluatedAt().isAfter(now.plusSeconds(5))
                || snapshot.evaluatedAt().getEpochSecond() != Long.parseLong(timestamp)
                || snapshot.revision() < 0 || snapshot.hash() == null || !snapshot.hash().matches("[0-9a-f]{64}")
                || snapshot.eligibleChefIds() == null || snapshot.eligibleChefIds().size() > CatalogEligibilityProtocol.MAX_CHEFS
                || snapshot.eligibleChefIds().contains(null)
                || new HashSet<>(snapshot.eligibleChefIds()).size() != snapshot.eligibleChefIds().size()
                || (snapshot.policyId() == null && !snapshot.eligibleChefIds().isEmpty())) throw unavailable();
            return new Snapshot(snapshot.requestId(), snapshot.evaluatedAt(), true, snapshot.policyId(), snapshot.revision(),
                snapshot.hash(), List.copyOf(snapshot.eligibleChefIds()));
        } catch (Exception ex) { throw unavailable(); }
    }
    public void requireChef(UUID chef) {
        if (!current().chefs().contains(chef)) throw ApiException.conflict("CHEF_SELLING_NOT_READY",
            "Complete the required finance review before accepting new orders");
    }
    static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private Flow.Subscription subscription;
        public CompletionStage<byte[]> getBody() { return result; }
        public void onSubscribe(Flow.Subscription value) { subscription = value; value.request(1); }
        public void onNext(List<ByteBuffer> chunks) {
            for (ByteBuffer chunk : chunks) {
                if (chunk.remaining() > CatalogEligibilityProtocol.MAX_RESPONSE_BYTES - bytes.size()) {
                    subscription.cancel(); result.completeExceptionally(unavailable()); return;
                }
                byte[] part = new byte[chunk.remaining()]; chunk.get(part); bytes.writeBytes(part);
            }
            subscription.request(1);
        }
        public void onError(Throwable error) { result.completeExceptionally(unavailable()); }
        public void onComplete() { result.complete(bytes.toByteArray()); }
    }
    private static ApiException unavailable() {
        return new ApiException(503, "CATALOG_ELIGIBILITY_UNAVAILABLE", "Available kitchens could not be verified. Please retry.");
    }
}
