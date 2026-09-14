package in.craves.userchef.email;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.exception.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthEmailProjectionController {
    public static final String PATH = "/internal/v1/auth-email/projection";
    private final String key;
    private final AuthEmailProjectionService service;
    private final ObjectMapper mapper;
    public AuthEmailProjectionController(@Value("${CRAVES_EMAIL_PROJECTION_INTERNAL_KEY:}") String key, AuthEmailProjectionService service, ObjectMapper mapper) {
        this.key = key; this.service = service; this.mapper = mapper;
    }
    @PostMapping(value = PATH, consumes = "application/json", produces = "application/json")
    public ResponseEntity<AuthEmailProjectionService.Receipt> receive(HttpServletRequest request) throws java.io.IOException {
        byte[] body = request.getInputStream().readNBytes(4097);
        try {
            Instant now = Instant.now();
            if (body.length > 4096) throw new ApiException(413, "EMAIL_REQUEST_INVALID", "Email request invalid");
            if (!EmailInternalSignature.valid(key, PATH, request.getHeader("X-Craves-Email-Timestamp"), request.getHeader("X-Craves-Email-Signature"), body, now))
                throw ApiException.unauthorized("EMAIL_INTERNAL_AUTH_REQUIRED", "Internal email authentication required");
            AuthEmailProjectionService.Event event;
            try {
                com.fasterxml.jackson.databind.JsonNode json = mapper.readerFor(com.fasterxml.jackson.databind.JsonNode.class)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).with(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readValue(body);
                if (!json.isObject() || json.size() != 6 || !json.path("eventId").isTextual() || !json.path("identityId").isTextual() ||
                    !json.path("email").isTextual() || !json.path("emailVerified").isBoolean() || !json.path("emailRevision").isIntegralNumber() ||
                    !json.path("emailRevision").canConvertToLong() || !json.path("verifiedAt").isTextual()) throw new IllegalArgumentException();
                event = new AuthEmailProjectionService.Event(java.util.UUID.fromString(json.get("eventId").textValue()),
                    java.util.UUID.fromString(json.get("identityId").textValue()), json.get("email").textValue(), json.get("emailVerified").booleanValue(),
                    json.get("emailRevision").longValue(), Instant.parse(json.get("verifiedAt").textValue()));
            }
            catch (Exception ex) { throw ApiException.badRequest("EMAIL_REQUEST_INVALID", "Email request invalid"); }
            if (!AuthEmailProjectionService.valid(event, now)) throw ApiException.badRequest("EMAIL_REQUEST_INVALID", "Email request invalid");
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Pragma", "no-cache")
                .body(service.receive(event, EmailInternalSignature.fingerprint(key, body)));
        } finally { Arrays.fill(body, (byte) 0); }
    }
}
