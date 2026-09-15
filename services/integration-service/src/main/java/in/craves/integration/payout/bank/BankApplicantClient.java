package in.craves.integration.payout.bank;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Resolves the chef from User/Chef source data, never from a browser-supplied identity or name. */
@Component
public class BankApplicantClient {
    public static final String PATH = "/internal/v1/chef-bank/identity";
    private final RestClient client;
    private final ObjectMapper json;
    private final String origin;
    private final String secret;
    public BankApplicantClient(RestClient.Builder builder, ObjectMapper json,
            @Value("${CRAVES_BANK_USER_CHEF_BASE_URL:}") String origin,
            @Value("${CRAVES_BANK_INTERNAL_KEY:}") String secret) {
        var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(http); factory.setReadTimeout(Duration.ofSeconds(10));
        this.client = builder.clone().requestFactory(factory).build();
        this.json = json; this.origin = origin; this.secret = secret;
    }
    public BankOnboardingModels.Identity fetch(UUID chefId) {
        try {
            URI uri = URI.create(origin);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null
                    || !(uri.getPath().isEmpty() || "/".equals(uri.getPath())) || secret.length() < 32)
                throw new IllegalStateException();
            byte[] body = json.writeValueAsBytes(Map.of("chefId", chefId));
            String timestamp = Long.toString(Instant.now().getEpochSecond());
            String signature = sign(secret, timestamp, body);
            var result = client.post().uri(origin.replaceAll("/$", "") + PATH)
                    .header("Content-Type", "application/json")
                    .header("X-Craves-Bank-Time", timestamp).header("X-Craves-Bank-Signature", signature)
                    .body(body).retrieve().body(BankOnboardingModels.Identity.class);
            if (result == null || !chefId.equals(result.chefId()) || result.applicationId() == null
                    || result.updatedAt() == null) throw new IllegalStateException();
            return result;
        } catch (Exception e) { throw new IllegalStateException("BANK_APPLICANT_SOURCE_UNAVAILABLE"); }
    }
    public static String sign(String secret, String timestamp, byte[] body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            mac.update(("POST\n" + PATH + "\n" + timestamp + "\n").getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(mac.doFinal(body));
        } catch (Exception e) { throw new IllegalStateException("BANK_SIGNATURE_UNAVAILABLE"); }
    }
}
