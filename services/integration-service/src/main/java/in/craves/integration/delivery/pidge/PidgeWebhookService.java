package in.craves.integration.delivery.pidge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.PidgeProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PidgeWebhookService {
    private final PidgeProperties properties;
    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;
    public PidgeWebhookService(PidgeProperties properties, ObjectMapper mapper, JdbcTemplate jdbc) {
        this.properties = properties; this.mapper = mapper; this.jdbc = jdbc;
    }
    @Transactional
    public Receipt accept(String raw, String authorization) {
        String expected = properties.getWebhookToken();
        if (!StringUtils.hasText(expected)) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Pidge callback is not configured");
        String supplied = authorization == null ? "" : authorization.trim();
        if (supplied.regionMatches(true, 0, "Bearer ", 0, 7)) supplied = supplied.substring(7);
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid Pidge callback credential");
        if (raw == null || raw.length() > 262144) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid callback body size");
        JsonNode payload;
        try {
            payload = mapper.readTree(raw);
            if (payload == null || !payload.isObject()) throw new IllegalArgumentException();
            PidgeApiClient.requiredId(payload.path("id").asText(null));
            PidgeApiClient.required(payload.path("status").asText(null), "status");
            Instant updated = Instant.parse(payload.path("updated_at").asText());
            if (updated.isAfter(Instant.now().plusSeconds(300))) throw new IllegalArgumentException();
        } catch (Exception ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Pidge callback payload"); }
        String identity = String.join("|", payload.path("id").asText(), payload.path("updated_at").asText(),
            payload.path("status").asText(), payload.path("fulfillment").path("status").asText());
        String eventId = PidgeApiClient.fingerprint(identity);
        boolean inserted = jdbc.update("""
            INSERT INTO delivery_schema.delivery_webhook_inbox
                (id, provider_id, provider_event_id, signature_hash, processing_status, raw_payload, received_at)
            VALUES (?, 'pidge', ?, ?, 'RECEIVED', ?::jsonb, now())
            ON CONFLICT (provider_id, provider_event_id) DO NOTHING
            """, UUID.randomUUID(), eventId, PidgeApiClient.fingerprint(supplied), payload.toString()) == 1;
        return new Receipt(true, !inserted, eventId);
    }
    public record Receipt(boolean accepted, boolean duplicate, String eventId) {}
}
