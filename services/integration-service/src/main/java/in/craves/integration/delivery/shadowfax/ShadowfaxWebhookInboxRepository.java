package in.craves.integration.delivery.shadowfax;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ShadowfaxWebhookInboxRepository {
    private final JdbcTemplate jdbc;

    public ShadowfaxWebhookInboxRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean store(String providerEventId, String credentialFingerprint, JsonNode payload) {
        return jdbc.update("""
            INSERT INTO delivery_schema.delivery_webhook_inbox
                (id, provider_id, provider_event_id, signature_hash, processing_status, raw_payload, received_at)
            VALUES (?, 'shadowfax', ?, ?, 'RECEIVED', ?::jsonb, now())
            ON CONFLICT (provider_id, provider_event_id) DO NOTHING
            """,
            UUID.randomUUID(), providerEventId, credentialFingerprint, payload.toString()
        ) == 1;
    }
}
