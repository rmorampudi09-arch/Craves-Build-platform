package in.craves.catalog.service;

import in.craves.catalog.config.PickupProvisioningProperties;
import in.craves.catalog.service.PickupProvisioningClient.PickupSnapshot;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PickupProvisioningOutboxWorker {
    private final JdbcTemplate jdbc;
    private final PickupProvisioningProperties properties;
    private final PickupProvisioningClient client;

    public PickupProvisioningOutboxWorker(
        JdbcTemplate jdbc,
        PickupProvisioningProperties properties,
        PickupProvisioningClient client
    ) {
        this.jdbc = jdbc;
        this.properties = properties;
        this.client = client;
    }

    @Scheduled(fixedDelayString = "${craves.pickup-provisioning.fixed-delay-ms:15000}")
    public void deliverDue() {
        if (!properties.isEnabled()) {
            return;
        }
        for (Claim claim : claimDue()) {
            try {
                PickupSnapshot snapshot = loadSnapshot(claim.pickupLocationId());
                client.provision(snapshot);
                markDelivered(claim);
            } catch (RuntimeException failure) {
                markFailure(claim, failure);
            }
        }
    }

    private List<Claim> claimDue() {
        UUID lockToken = UUID.randomUUID();
        String sql = """
            WITH candidates AS (
                SELECT event_id
                FROM catalog_schema.pickup_location_provisioning_outbox
                WHERE (
                    status IN ('PENDING', 'FAILED')
                    AND next_attempt_at <= now()
                    AND attempt_count < ?
                ) OR (
                    status = 'PROCESSING'
                    AND locked_at < now() - (? * INTERVAL '1 minute')
                    AND attempt_count < ?
                )
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT ?
            )
            UPDATE catalog_schema.pickup_location_provisioning_outbox outbox
            SET status = 'PROCESSING',
                attempt_count = attempt_count + 1,
                lock_token = ?,
                locked_at = now(),
                last_error = NULL,
                updated_at = now()
            FROM candidates
            WHERE outbox.event_id = candidates.event_id
            RETURNING outbox.event_id, outbox.pickup_location_id, outbox.attempt_count, outbox.lock_token
            """;
        return jdbc.query(
            sql,
            (rs, rowNum) -> new Claim(
                rs.getObject("event_id", UUID.class),
                rs.getObject("pickup_location_id", UUID.class),
                rs.getInt("attempt_count"),
                rs.getObject("lock_token", UUID.class)
            ),
            properties.getMaxAttempts(),
            properties.getStaleMinutes(),
            properties.getMaxAttempts(),
            properties.getBatchSize(),
            lockToken
        );
    }

    private PickupSnapshot loadSnapshot(UUID pickupLocationId) {
        return jdbc.query(
            """
                SELECT id, kitchen_id, version_number, kitchen_name,
                       contact_phone, contact_email, address_line1, address_line2,
                       landmark, area_name, city, state, postal_code, latitude, longitude
                FROM catalog_schema.kitchen_pickup_location
                WHERE id = ?
                """,
            this::mapSnapshot,
            pickupLocationId
        ).stream().findFirst().orElseThrow(() ->
            new IllegalStateException("Pickup location snapshot no longer exists")
        );
    }

    private PickupSnapshot mapSnapshot(ResultSet rs, int rowNum) throws SQLException {
        return new PickupSnapshot(
            rs.getObject("id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getInt("version_number"),
            rs.getString("kitchen_name"),
            rs.getString("contact_phone"),
            rs.getString("contact_email"),
            rs.getString("address_line1"),
            rs.getString("address_line2"),
            rs.getString("landmark"),
            rs.getString("area_name"),
            rs.getString("city"),
            rs.getString("state"),
            rs.getString("postal_code"),
            rs.getBigDecimal("latitude"),
            rs.getBigDecimal("longitude"),
            "India"
        );
    }

    private void markDelivered(Claim claim) {
        jdbc.update(
            """
                UPDATE catalog_schema.pickup_location_provisioning_outbox
                SET status = 'DELIVERED', delivered_at = now(), lock_token = NULL,
                    locked_at = NULL, last_error = NULL, updated_at = now()
                WHERE event_id = ? AND lock_token = ?
                """,
            claim.eventId(), claim.lockToken()
        );
    }

    private void markFailure(Claim claim, RuntimeException failure) {
        boolean dead = claim.attemptCount() >= properties.getMaxAttempts();
        long retrySeconds = Math.min(
            3600L,
            5L * (1L << Math.min(10, Math.max(0, claim.attemptCount() - 1)))
        );
        jdbc.update(
            """
                UPDATE catalog_schema.pickup_location_provisioning_outbox
                SET status = ?,
                    next_attempt_at = now() + (? * INTERVAL '1 second'),
                    lock_token = NULL,
                    locked_at = NULL,
                    last_error = ?,
                    updated_at = now()
                WHERE event_id = ? AND lock_token = ?
                """,
            dead ? "DEAD_LETTER" : "FAILED",
            dead ? 0L : retrySeconds,
            safeMessage(failure),
            claim.eventId(),
            claim.lockToken()
        );
    }

    private static String safeMessage(Throwable failure) {
        String value = failure == null || failure.getMessage() == null
            ? (failure == null ? "Unknown pickup provisioning failure" : failure.getClass().getSimpleName())
            : failure.getMessage();
        value = value.replace('\n', ' ').replace('\r', ' ').trim();
        return value.length() > 1000 ? value.substring(0, 1000) : value;
    }

    private record Claim(UUID eventId, UUID pickupLocationId, int attemptCount, UUID lockToken) {
    }
}
