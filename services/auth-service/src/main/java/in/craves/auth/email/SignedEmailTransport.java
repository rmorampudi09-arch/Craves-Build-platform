package in.craves.auth.email;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

/** Secrets and OTPs are held only in memory during a single bounded internal call. */
@Component
public class SignedEmailTransport implements EmailVerificationTransport {
    static final String NOTIFICATION_PATH = "/internal/v1/auth-email/verification";
    static final String PROJECTION_PATH = "/internal/v1/auth-email/projection";
    private final EmailVerificationSettings settings;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_1_1).build();
    public SignedEmailTransport(EmailVerificationSettings settings, ObjectMapper mapper, Clock clock) {
        this.settings=settings; this.mapper=mapper; this.clock=clock;
    }
    @Override public String send(UUID challengeId, UUID identityId, String email, String code, Instant expiresAt) {
        try {
            JsonNode result = post(settings.notificationBaseUrl(), NOTIFICATION_PATH, settings.notificationKey(),
                Map.of("challengeId",challengeId,"identityId",identityId,"email",email,"code",code,"expiresAt",expiresAt));
            if (!challengeId.toString().equals(result.path("challengeId").asText())) return "UNKNOWN";
            String status=result.path("status").asText();
            return List.of("ACCEPTED","UNKNOWN","UNAVAILABLE").contains(status) ? status : "UNKNOWN";
        } catch (Exception error) { return "UNKNOWN"; }
    }
    @Override public boolean project(UUID eventId, UUID identityId, String email, long revision, Instant verifiedAt) {
        try {
            JsonNode result=post(settings.userChefBaseUrl(), PROJECTION_PATH, settings.projectionKey(), Map.of(
                "eventId",eventId,"identityId",identityId,"email",email,"emailVerified",true,
                "emailRevision",revision,"verifiedAt",verifiedAt));
            return List.of("APPLIED","DUPLICATE","STALE").contains(result.path("status").asText()) &&
                result.path("emailRevision").canConvertToLong() && result.path("emailRevision").asLong() >= revision;
        } catch (Exception error) { return false; }
    }
    private JsonNode post(String origin, String path, String key, Object payload) throws Exception {
        // Stable bytes across JVM restarts are required by the receiver's immutable replay receipt.
        byte[] bytes=mapper.writer().without(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .with(com.fasterxml.jackson.databind.SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).writeValueAsBytes(payload);
        String epoch=Long.toString(clock.instant().getEpochSecond());
        String signature=EmailVerificationCrypto.hmac(key,"POST\n"+path+"\n"+epoch+"\n"+new String(bytes,java.nio.charset.StandardCharsets.UTF_8));
        var request=HttpRequest.newBuilder(EmailVerificationSettings.origin(origin,settings.allowLocalHttp()).resolve(path))
            .timeout(Duration.ofSeconds(15)).header("Content-Type","application/json").header("Accept","application/json")
            .header("X-Craves-Email-Timestamp",epoch).header("X-Craves-Email-Signature",signature)
            .POST(HttpRequest.BodyPublishers.ofByteArray(bytes)).build();
        var pending=client.sendAsync(request, ignored -> new BoundedBody());
        try {
            HttpResponse<byte[]> response=pending.get(16,TimeUnit.SECONDS);
            if (response.statusCode()!=200 && response.statusCode()!=202) throw new IllegalStateException("Internal email response rejected");
            return mapper.readTree(response.body());
        } finally { if (!pending.isDone()) pending.cancel(true); }
    }
    static final class BoundedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result=new CompletableFuture<>();
        private final ByteArrayOutputStream output=new ByteArrayOutputStream();
        private Flow.Subscription subscription;
        public CompletionStage<byte[]> getBody() { return result; }
        public void onSubscribe(Flow.Subscription value) { subscription=value; value.request(1); }
        public void onNext(List<ByteBuffer> items) {
            for (ByteBuffer item:items) {
                if (item.remaining()>8192-output.size()) {
                    subscription.cancel(); result.completeExceptionally(new IllegalStateException("Internal response exceeds limit")); return;
                }
                byte[] bytes=new byte[item.remaining()]; item.get(bytes); output.writeBytes(bytes);
            }
            subscription.request(1);
        }
        public void onError(Throwable ignored) { result.completeExceptionally(new IllegalStateException("Internal email transport unavailable")); }
        public void onComplete() { result.complete(output.toByteArray()); }
    }
}
