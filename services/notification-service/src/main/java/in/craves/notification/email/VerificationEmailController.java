package in.craves.notification.email;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.Arrays;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class VerificationEmailController {
    public static final String PATH = "/internal/v1/auth-email/verification";
    private final VerificationEmailSettings settings;
    private final VerificationEmailService service;
    private final ObjectMapper mapper;
    public VerificationEmailController(VerificationEmailSettings settings, VerificationEmailService service, ObjectMapper mapper) {
        this.settings = settings; this.service = service; this.mapper = mapper;
    }
    @PostMapping(value = PATH, consumes = "application/json", produces = "application/json")
    public ResponseEntity<Map<String,Object>> send(HttpServletRequest http) throws java.io.IOException {
        byte[] body = http.getInputStream().readNBytes(4097);
        try {
            Instant now = Instant.now();
            if (body.length > 4096) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "EMAIL_REQUEST_INVALID");
            if (!EmailInternalSignature.valid(settings.internalKey, PATH, http.getHeader("X-Craves-Email-Timestamp"), http.getHeader("X-Craves-Email-Signature"), body, now))
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "EMAIL_INTERNAL_AUTH_REQUIRED");
            VerificationEmailRequest request;
            try {
                com.fasterxml.jackson.databind.JsonNode json = mapper.readerFor(com.fasterxml.jackson.databind.JsonNode.class)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).with(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readValue(body);
                if (!json.isObject() || json.size() != 5 || !json.path("challengeId").isTextual() || !json.path("identityId").isTextual() ||
                    !json.path("email").isTextual() || !json.path("code").isTextual() || !json.path("expiresAt").isTextual()) throw new IllegalArgumentException();
                request = new VerificationEmailRequest(java.util.UUID.fromString(json.get("challengeId").textValue()),
                    java.util.UUID.fromString(json.get("identityId").textValue()), json.get("email").textValue(), json.get("code").textValue(),
                    Instant.parse(json.get("expiresAt").textValue()));
            }
            catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EMAIL_REQUEST_INVALID"); }
            if (request == null || !request.valid(now)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "EMAIL_REQUEST_INVALID");
            if (!settings.enabled) return response("UNAVAILABLE", request.challengeId());
            return response(service.deliver(request, EmailInternalSignature.fingerprint(settings.internalKey, body)).name(), request.challengeId());
        } finally { Arrays.fill(body, (byte) 0); }
    }
    private ResponseEntity<Map<String,Object>> response(String status, java.util.UUID challengeId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Pragma", "no-cache").body(Map.of("status",status,"challengeId",challengeId));
    }
}
