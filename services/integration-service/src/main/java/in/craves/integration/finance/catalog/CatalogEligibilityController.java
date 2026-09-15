package in.craves.integration.finance.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CatalogEligibilityController {
    private final CatalogEligibilityService service;
    private final ObjectMapper json;
    private final String key;
    public CatalogEligibilityController(CatalogEligibilityService service, ObjectMapper json,
        @Value("${CRAVES_CATALOG_FINANCE_READ_KEY:}") String key,
        @Value("${CRAVES_FINANCE_INTERNAL_KEY:}") String moneyKey) {
        this.service = service; this.json = json;
        // Read-only catalog credentials must never confer quote/event/posting authority.
        this.key = key != null && key.length() >= 32 && key.length() <= 512
            && !key.equals(moneyKey) ? key : "";
    }
    @PostMapping(path = CatalogEligibilityProtocol.PATH, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<byte[]> evaluate(HttpServletRequest request) {
        if (key.isEmpty()) return failure(HttpStatus.SERVICE_UNAVAILABLE);
        try {
            String timestamp = request.getHeader(CatalogEligibilityProtocol.TIMESTAMP);
            String supplied = request.getHeader(CatalogEligibilityProtocol.SIGNATURE);
            if (timestamp == null || !timestamp.matches("[0-9]{10}") || supplied == null || !supplied.matches("[0-9a-f]{64}")
                || Math.abs(Instant.now().getEpochSecond() - Long.parseLong(timestamp)) > 15) return failure(HttpStatus.UNAUTHORIZED);
            byte[] body = request.getInputStream().readNBytes(257);
            if (body.length > 256 || !CatalogEligibilityProtocol.matches(CatalogEligibilityProtocol.sign(key, "POST", timestamp, body),
                    request.getHeader(CatalogEligibilityProtocol.SIGNATURE))) return failure(HttpStatus.UNAUTHORIZED);
            var node = json.reader().with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .with(com.fasterxml.jackson.core.JsonParser.Feature.STRICT_DUPLICATE_DETECTION).readTree(body);
            if (node == null || !node.isObject() || node.size() != 1 || !node.path("requestId").isTextual())
                return failure(HttpStatus.BAD_REQUEST);
            UUID requestId = UUID.fromString(node.path("requestId").asText());
            if (!requestId.toString().equals(node.path("requestId").asText())) return failure(HttpStatus.BAD_REQUEST);
            var snapshot = service.evaluate(requestId);
            byte[] response = json.writeValueAsBytes(snapshot);
            if (response.length > CatalogEligibilityProtocol.MAX_RESPONSE_BYTES) return failure(HttpStatus.SERVICE_UNAVAILABLE);
            String responseTime = Long.toString(snapshot.evaluatedAt().getEpochSecond());
            return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
                .header("Cache-Control", "no-store, private").header("Pragma", "no-cache")
                .header(CatalogEligibilityProtocol.TIMESTAMP, responseTime)
                .header(CatalogEligibilityProtocol.SIGNATURE, CatalogEligibilityProtocol.sign(key, "RESPONSE", responseTime, response))
                .body(response);
        } catch (IllegalArgumentException ex) { return failure(HttpStatus.BAD_REQUEST); }
        catch (Exception ex) { return failure(HttpStatus.SERVICE_UNAVAILABLE); }
    }
    private static ResponseEntity<byte[]> failure(HttpStatus status) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store, private")
            .header("Pragma", "no-cache").contentType(MediaType.APPLICATION_JSON)
            .body("{\"code\":\"CATALOG_ELIGIBILITY_UNAVAILABLE\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
