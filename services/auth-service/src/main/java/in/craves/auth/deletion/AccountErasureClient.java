package in.craves.auth.deletion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.referrals.transport.SourceSignatures;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.stereotype.Component;

/**
 * Calls the account erasure endpoints of the 8 services. It never throws and never holds a transaction:
 * every problem comes back as a FAILED call with a short code (never a response body or a message),
 * so the caller can record it and retry.
 */
@Component
public class AccountErasureClient {
    public static final List<String> ERASE_ORDER =
        List.of("subscription", "order", "integration", "referral", "advanced", "catalog", "user-chef", "notification");

    public enum Outcome { DONE, BLOCKED, FAILED }

    public record Blocker(String service, String code, String detail) {}

    /** For {@code blockers} the answer is {@code blockers}, whatever the outcome; BLOCKED is a refusal to prepare or erase. */
    public record ServiceCall(Outcome outcome, Map<String, Integer> counts, List<Blocker> blockers, String error) {
        public int erasedCount() { return counts.values().stream().mapToInt(Integer::intValue).sum(); }
    }

    private static final String SECRET = "X-Craves-Internal-Secret";
    private static final String KEY = "X-Craves-Internal-Key";
    private static final Map<String, String> CREDENTIAL_HEADER = Map.of(
        "subscription", SECRET, "order", SECRET, "integration", SECRET, "advanced", SECRET, "user-chef", SECRET,
        "notification", KEY, "catalog", KEY);
    private static final String BASE_PATH = "/internal/v1/account-erasure";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final AccountDeletionProperties properties;
    private final Clock clock;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_1_1).build();

    public AccountErasureClient(AccountDeletionProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    /** {@code requestId} is only a correlation id here, so a fresh one is used. */
    public ServiceCall blockers(String service, UUID identityId, Scope scope) {
        return call(service, "/blockers", UUID.randomUUID(), identityId, scope);
    }

    public ServiceCall prepare(String service, UUID requestId, UUID identityId, Scope scope) {
        return call(service, "/prepare", requestId, identityId, scope);
    }

    public ServiceCall erase(String service, UUID requestId, UUID identityId, Scope scope) {
        return call(service, "", requestId, identityId, scope);
    }

    public ServiceCall release(String service, UUID requestId, UUID identityId, Scope scope) {
        return call(service, "/release", requestId, identityId, scope);
    }

    private ServiceCall call(String service, String suffix, UUID requestId, UUID identityId, Scope scope) {
        try {
            AccountDeletionProperties.Service config = properties.getServices().get(service);
            boolean referral = "referral".equals(service);
            String header = CREDENTIAL_HEADER.get(service);
            if (config == null || config.getBaseUrl().isBlank() || (!referral && (header == null || config.getCredential().isBlank())))
                return failed("NOT_CONFIGURED");
            String path = BASE_PATH + suffix;
            byte[] body = MAPPER.writeValueAsBytes(Map.of("requestId", requestId, "identityId", identityId, "scope", scope));
            Duration timeout = properties.getCallTimeout();
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(config.getBaseUrl()).resolve(path)).timeout(timeout)
                .header("Content-Type", "application/json").header("Accept", "application/json");
            if (referral) {
                byte[] key = Base64.getDecoder().decode(properties.getReferralHmacKeyBase64());
                String timestamp = Long.toString(clock.instant().getEpochSecond());
                request.header("X-Referral-Source", "auth").header("X-Referral-Key-Id", "current")
                    .header("X-Referral-Timestamp", timestamp)
                    .header("X-Referral-Signature", SourceSignatures.sign(key, "auth", "current", timestamp, "POST", path, body));
            } else {
                request.header(header, config.getCredential());
            }
            var pending = http.sendAsync(request.POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(),
                HttpResponse.BodyHandlers.ofByteArray());
            try {
                // The request timeout stops at the response headers; this one bounds the body too.
                HttpResponse<byte[]> response = pending.get(timeout.toMillis() + 1000, TimeUnit.MILLISECONDS);
                return answer(service, response.statusCode(), response.body());
            } catch (TimeoutException error) {
                return failed("TIMEOUT");
            } catch (ExecutionException error) {
                return failed(error.getCause() instanceof HttpTimeoutException ? "TIMEOUT" : "UNREACHABLE");
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return failed("INTERRUPTED");
            } finally {
                if (!pending.isDone()) pending.cancel(true);
            }
        } catch (Exception error) {
            return failed("ERROR");
        }
    }

    private static ServiceCall answer(String service, int status, byte[] body) {
        JsonNode json = readObject(body);
        if (status == 200) {
            if (json == null) return failed("BAD_BODY");
            Map<String, Integer> counts = new LinkedHashMap<>();
            // Count names differ per service and are never read, only their numbers.
            json.path("counts").properties().forEach(entry -> {
                if (entry.getValue().isIntegralNumber() && entry.getValue().canConvertToInt())
                    counts.put(entry.getKey(), entry.getValue().intValue());
            });
            return new ServiceCall(Outcome.DONE, counts, blockers(service, json.path("blockers")), null);
        }
        // Other services also answer 409 with a plain error body; only this exact shape is a refusal to proceed.
        if (status == 409 && json != null && "BLOCKED".equals(json.path("status").asText()) && json.path("blockers").isArray())
            return new ServiceCall(Outcome.BLOCKED, Map.of(), blockers(service, json.path("blockers")), null);
        return failed("HTTP " + status);
    }

    private static JsonNode readObject(byte[] body) {
        try {
            JsonNode json = MAPPER.readTree(body);
            return json.isObject() ? json : null;
        } catch (Exception error) { return null; }
    }

    private static List<Blocker> blockers(String service, JsonNode array) {
        List<Blocker> blockers = new ArrayList<>();
        array.forEach(item -> blockers.add(new Blocker(service, item.path("code").asText(""), item.path("detail").asText(""))));
        return blockers;
    }

    private static ServiceCall failed(String error) {
        return new ServiceCall(Outcome.FAILED, Map.of(), List.of(), error);
    }
}
