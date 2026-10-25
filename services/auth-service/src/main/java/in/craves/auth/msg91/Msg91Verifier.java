package in.craves.auth.msg91;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.exception.AuthException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Component
public class Msg91Verifier {
    private static final String URL = "https://api.msg91.com/api/v5/widget/verifyAccessToken";
    private final Msg91Properties settings;
    private final RestTemplate http;
    private final ObjectMapper json = new ObjectMapper();

    public Msg91Verifier(Msg91Properties settings) {
        this.settings = settings;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(7000);
        this.http = new RestTemplate(factory);
    }

    public String verifiedPhone(String accessToken) {
        if (!settings.enabled()) throw unavailable();
        try {
            return http.execute(URL, HttpMethod.POST, request -> {
                request.getHeaders().setContentType(MediaType.APPLICATION_JSON);
                request.getHeaders().set("authkey", settings.authkey());
                request.getBody().write(json.writeValueAsBytes(Map.of("access-token", accessToken)));
            }, response -> {
                byte[] body = response.getBody().readNBytes(8193);
                if (body.length > 8192) throw unavailable();
                return phoneFromResponse(json.readTree(new String(body, StandardCharsets.UTF_8)));
            });
        } catch (RestClientException ex) {
            // Never log upstream bodies, headers, tokens, or phone numbers.
            throw unavailable();
        }
    }

    static String phoneFromResponse(JsonNode response) {
        if (response == null || !"success".equals(response.path("type").asText()))
            throw AuthException.unauthorized("OTP_VERIFICATION_FAILED", "OTP verification failed");
        String identifier = response.path("message").asText("");
        if (!identifier.matches("91[6-9][0-9]{9}"))
            throw AuthException.unauthorized("OTP_PHONE_INVALID", "A verified Indian mobile number is required");
        // Only this server-verified identifier can select an account.
        return "+" + identifier;
    }

    private static AuthException unavailable() {
        return new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "OTP_UNAVAILABLE", "Phone verification is temporarily unavailable");
    }
}
