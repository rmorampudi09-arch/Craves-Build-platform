package in.craves.auth.centralotp;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.exception.AuthException;
import in.craves.auth.msg91.Msg91Properties;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.RestClientResponseException;

@Component
public class CentralOtpProvider {
    private static final Logger log = LoggerFactory.getLogger(CentralOtpProvider.class);
    private final Msg91Properties secrets;
    private final String template;
    private final RestTemplate http;
    private final URI base;
    private final ObjectMapper json = new ObjectMapper();

    @Autowired
    public CentralOtpProvider(Msg91Properties secrets,
            @Value("${CRAVES_MSG91_OTP_TEMPLATE_ID:}") String template) {
        this(secrets, template, URI.create("https://control.msg91.com"));
    }

    CentralOtpProvider(Msg91Properties secrets, String template, URI base) {
        this.secrets = secrets;
        this.template = template;
        this.base = base;
        var factory = new SimpleClientHttpRequestFactory() {
            @Override protected void prepareConnection(HttpURLConnection connection, String method) throws IOException {
                super.prepareConnection(connection, method);
                connection.setInstanceFollowRedirects(false);
            }
        };
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(8000);
        http = new RestTemplate(factory);
    }

    public void send(String phone) {
        JsonNode result = call("/api/v5/otp?template_id=" + template + "&mobile=" + phone.substring(1)
                + "&otp_length=6&otp_expiry=15&realTimeResponse=1", HttpMethod.POST);
        if (!"success".equals(result.path("type").asText())
                || !result.path("request_id").asText().matches("[A-Za-z0-9_-]{1,200}")) {
            rejected("send", result);
            throw unavailable();
        }
        log.info("MSG91 OTP accepted requestId={}", result.path("request_id").asText());
    }

    public void verify(String phone, String code) {
        JsonNode result = call("/api/v5/otp/verify?mobile=" + phone.substring(1) + "&otp=" + code,
                HttpMethod.GET);
        String type = result.path("type").asText();
        String message = result.path("message").asText();
        if ("success".equals(type) && "OTP verified success".equals(message)) { return; }
        if ("error".equals(type) && "OTP not match".equals(message)) {
            throw AuthException.badRequest("OTP_INVALID", "The code is incorrect. Please try again.");
        }
        if ("error".equals(type) && "OTP expired".equals(message)) {
            throw AuthException.badRequest("OTP_EXPIRED", "This code has expired. Request a new code.");
        }
        // An already-verified provider response is not fresh proof of ownership.
        rejected("verify", result);
        throw unavailable();
    }

    private JsonNode call(String path, HttpMethod method) {
        if (!secrets.enabled() || secrets.authkey() == null || secrets.authkey().isBlank()
                || !template.matches("[a-fA-F0-9]{24}")) {
            log.warn("MSG91 OTP configuration unavailable");
            throw unavailable();
        }
        try {
            return http.execute(base.resolve(path), method, request -> {
                request.getHeaders().set("authkey", secrets.authkey());
                request.getHeaders().setContentType(MediaType.APPLICATION_JSON);
                if (method == HttpMethod.POST) {
                    request.getBody().write("{}".getBytes(StandardCharsets.UTF_8));
                }
            }, response -> {
                byte[] bytes = response.getBody().readNBytes(8193);
                if (!response.getStatusCode().is2xxSuccessful() || bytes.length > 8192) {
                    throw unavailable();
                }
                JsonNode result = json.readTree(bytes);
                if (result == null || !result.isObject()) { throw unavailable(); }
                return result;
            });
        } catch (AuthException exception) { throw exception; }
        catch (RestClientResponseException exception) {
            log.warn("MSG91 OTP HTTP rejection status={}", exception.getStatusCode().value());
            throw unavailable();
        } catch (RuntimeException exception) {
            // Exception messages can contain a phone number, OTP or request URI.
            log.warn("MSG91 OTP transport or response failure category={}", exception.getClass().getSimpleName());
            throw unavailable();
        }
    }

    private static void rejected(String operation, JsonNode result) {
        String code = result.path("code").asText();
        log.warn("MSG91 OTP rejected operation={} providerCode={}", operation,
                code.matches("[0-9]{1,6}") ? code : "unclassified");
    }

    static AuthException unavailable() {
        return new AuthException(HttpStatus.SERVICE_UNAVAILABLE, "OTP_UNAVAILABLE",
                "Phone verification is temporarily unavailable. Please try again shortly.");
    }
}
