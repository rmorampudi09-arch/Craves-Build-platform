package in.craves.integration.delivery.shadowfax;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.config.ShadowfaxProperties;
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
public class ShadowfaxWebhookService {
    private final ShadowfaxProperties properties;
    private final ObjectMapper mapper;
    private final JdbcTemplate jdbc;

    public ShadowfaxWebhookService(ShadowfaxProperties properties, ObjectMapper mapper, JdbcTemplate jdbc) {
        this.properties = properties;
        this.mapper = mapper;
        this.jdbc = jdbc;
    }

    @Transactional
    public Receipt accept(String raw, String authorization) {
        String expected = properties.getWebhookToken();
        if (!StringUtils.hasText(expected)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Shadowfax callback credential is not configured");
        }
        String supplied = authorization == null ? "" : authorization.trim();
        if (supplied.regionMatches(true, 0, "Bearer ", 0, 7)) supplied = supplied.substring(7);
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid Shadowfax callback credential");
        }
        if (raw == null || raw.length() > 262144) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid callback body size");
        }
        JsonNode payload;
        try {
            payload = mapper.readTree(raw);
            if (payload == null || !payload.isObject()) throw new IllegalArgumentException();
            ShadowfaxApiClient.requireProviderId(payload.path("sfx_order_id").asText(null));
            if (!StringUtils.hasText(payload.path("order_status").asText(null))) throw new IllegalArgumentException();
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Shadowfax callback payload");
        }
        String eventId = payload.path("sfx_order_id").asText() + ":" + ShadowfaxStatusMapper.providerStatus(payload);
        boolean inserted = jdbc.update("""
            INSERT INTO delivery_schema.delivery_webhook_inbox
                (id, provider_id, provider_event_id, signature_hash, processing_status, raw_payload, received_at)
            VALUES (?, 'shadowfax', ?, ?, 'RECEIVED', ?::jsonb, now())
            ON CONFLICT (provider_id, provider_event_id) DO NOTHING
            """, UUID.randomUUID(), eventId, fingerprint(authorization), payload.toString()) == 1;
        return new Receipt(true, !inserted, eventId);
    }

    private static String fingerprint(String value) {
        if (value == null) return null;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not fingerprint Shadowfax callback credential", ex);
        }
    }

    public record Receipt(boolean accepted, boolean duplicate, String eventId) {}
}
