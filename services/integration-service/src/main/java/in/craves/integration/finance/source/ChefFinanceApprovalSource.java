package in.craves.integration.finance.source;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Fresh, signed User/Chef authority. No bank provider or RazorpayX runtime gate is consulted. */
@Service
public class ChefFinanceApprovalSource {
    public record Approval(UUID chefId, UUID applicationId, String stateCode, Instant reviewedAt) {}
    public record Snapshot(UUID requestId, Instant evaluatedAt, boolean complete, List<Approval> approvals) {}
    private final String origin;
    private final String key;
    private final ObjectMapper json;
    private final HttpClient http;
    @Autowired
    public ChefFinanceApprovalSource(ObjectMapper json,
            @Value("${CRAVES_BANK_USER_CHEF_BASE_URL:}") String origin,
            @Value("${CRAVES_BANK_INTERNAL_KEY:}") String key) {
        this(json, origin, key, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build());
    }
    ChefFinanceApprovalSource(ObjectMapper json, String origin, String key, HttpClient http) {
        this.json = json; this.origin = origin; this.key = key; this.http = http;
    }
    public Snapshot current() {
        try {
            URI uri = URI.create(origin);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))
                    || key == null || key.length() < 32 || key.length() > 512) throw unavailable();
            UUID id = UUID.randomUUID();
            byte[] body = json.writeValueAsBytes(java.util.Map.of("requestId", id));
            String time = Long.toString(Instant.now().getEpochSecond());
            var request = HttpRequest.newBuilder(uri.resolve(ChefFinanceApprovalProtocol.PATH))
                .timeout(Duration.ofSeconds(3)).header("Content-Type", "application/json")
                .header(ChefFinanceApprovalProtocol.TIME, time)
                .header(ChefFinanceApprovalProtocol.SIGNATURE, ChefFinanceApprovalProtocol.sign(key, "POST", time, body))
                .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
            var pending = http.sendAsync(request, info -> new BoundedBody());
            try {
                var response = pending.get(3, TimeUnit.SECONDS);
                if (response.statusCode() != 200) throw unavailable();
                return verify(id, response.body(), response.headers().firstValue(ChefFinanceApprovalProtocol.TIME).orElse(null),
                    response.headers().firstValue(ChefFinanceApprovalProtocol.SIGNATURE).orElse(null), Instant.now());
            } finally { if (!pending.isDone()) pending.cancel(true); }
        } catch (InterruptedException ex) { Thread.currentThread().interrupt(); throw unavailable(); }
        catch (Exception ex) { throw unavailable(); }
    }
    Snapshot verify(UUID id, byte[] raw, String time, String signature, Instant now) {
        try {
            if (raw == null || raw.length > ChefFinanceApprovalProtocol.MAX_BYTES || time == null || !time.matches("[0-9]{10}")
                    || Math.abs(now.getEpochSecond() - Long.parseLong(time)) > 15
                    || !ChefFinanceApprovalProtocol.matches(ChefFinanceApprovalProtocol.sign(key, "RESPONSE", time, raw), signature))
                throw unavailable();
            var node = json.reader().with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .with(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readTree(raw);
            var fields = new HashSet<String>(); node.fieldNames().forEachRemaining(fields::add);
            if (!node.isObject() || !fields.equals(Set.of("requestId", "evaluatedAt", "complete", "approvals"))
                    || !node.path("complete").isBoolean() || !node.path("approvals").isArray()) throw unavailable();
            var result = json.treeToValue(node, Snapshot.class);
            if (!id.equals(result.requestId()) || result.evaluatedAt() == null
                    || result.evaluatedAt().getEpochSecond() != Long.parseLong(time)
                    || result.evaluatedAt().isBefore(now.minusSeconds(15)) || result.evaluatedAt().isAfter(now.plusSeconds(5))
                    || result.approvals() == null || result.approvals().size() > ChefFinanceApprovalProtocol.MAX_CHEFS
                    || (!result.complete() && !result.approvals().isEmpty())) throw unavailable();
            var chefs = new HashSet<UUID>(); var applications = new HashSet<UUID>();
            for (var approval : result.approvals()) {
                if (approval == null || approval.chefId() == null || approval.applicationId() == null
                        || !chefs.add(approval.chefId()) || !applications.add(approval.applicationId())
                        || !Set.of("36", "UNSUPPORTED").contains(approval.stateCode()) || approval.reviewedAt() == null
                        || approval.reviewedAt().isAfter(now.plusSeconds(5))) throw unavailable();
            }
            return new Snapshot(id, result.evaluatedAt(), result.complete(), List.copyOf(result.approvals()));
        } catch (Exception ex) { throw unavailable(); }
    }
    private static IllegalStateException unavailable() { return new IllegalStateException("CHEF_APPROVAL_AUTHORITY_UNAVAILABLE"); }
    static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private Flow.Subscription subscription;
        public CompletionStage<byte[]> getBody() { return result; }
        public void onSubscribe(Flow.Subscription value) { subscription = value; value.request(1); }
        public void onNext(List<ByteBuffer> chunks) {
            for (ByteBuffer chunk : chunks) {
                if (chunk.remaining() > ChefFinanceApprovalProtocol.MAX_BYTES - bytes.size()) {
                    subscription.cancel(); result.completeExceptionally(unavailable()); return;
                }
                byte[] part = new byte[chunk.remaining()]; chunk.get(part); bytes.writeBytes(part);
            }
            subscription.request(1);
        }
        public void onError(Throwable ex) { result.completeExceptionally(unavailable()); }
        public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
