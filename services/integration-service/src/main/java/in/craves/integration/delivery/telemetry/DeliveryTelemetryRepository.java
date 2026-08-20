package in.craves.integration.delivery.telemetry;

import in.craves.integration.delivery.telemetry.DeliveryTelemetryModels.TelemetrySnapshot;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeliveryTelemetryRepository {
    private final JdbcTemplate jdbcTemplate;

    public DeliveryTelemetryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<StoredTelemetry> find(UUID deliveryJobId) {
        return jdbcTemplate.query(
            "SELECT provider_id, provider_delivery_id, courier_latitude, courier_longitude, " +
                "courier_location_observed_at, estimated_pickup_at, " +
                "estimated_pickup_start_at, estimated_pickup_end_at, estimated_dropoff_at, " +
                "estimated_dropoff_start_at, estimated_dropoff_end_at, telemetry_observed_at " +
                "FROM delivery_schema.delivery_job WHERE id = ?",
            (rs, rowNumber) -> new StoredTelemetry(
                rs.getString("provider_id"),
                rs.getString("provider_delivery_id"),
                rs.getBigDecimal("courier_latitude"),
                rs.getBigDecimal("courier_longitude"),
                instant(rs.getTimestamp("courier_location_observed_at")),
                instant(rs.getTimestamp("estimated_pickup_at")),
                instant(rs.getTimestamp("estimated_pickup_start_at")),
                instant(rs.getTimestamp("estimated_pickup_end_at")),
                instant(rs.getTimestamp("estimated_dropoff_at")),
                instant(rs.getTimestamp("estimated_dropoff_start_at")),
                instant(rs.getTimestamp("estimated_dropoff_end_at")),
                instant(rs.getTimestamp("telemetry_observed_at"))
            ),
            deliveryJobId
        ).stream().findFirst();
    }

    public void update(UUID deliveryJobId, TelemetrySnapshot telemetry) {
        jdbcTemplate.update(
            "UPDATE delivery_schema.delivery_job SET " +
                "courier_latitude = COALESCE(?, courier_latitude), " +
                "courier_longitude = COALESCE(?, courier_longitude), " +
                "courier_location_observed_at = COALESCE(?, courier_location_observed_at), " +
                "estimated_pickup_at = COALESCE(?, estimated_pickup_at), " +
                "estimated_pickup_start_at = COALESCE(?, estimated_pickup_start_at), " +
                "estimated_pickup_end_at = COALESCE(?, estimated_pickup_end_at), " +
                "estimated_dropoff_at = COALESCE(?, estimated_dropoff_at), " +
                "estimated_dropoff_start_at = COALESCE(?, estimated_dropoff_start_at), " +
                "estimated_dropoff_end_at = COALESCE(?, estimated_dropoff_end_at), " +
                "telemetry_observed_at = ?, telemetry_source = ?, updated_at = now() WHERE id = ?",
            telemetry.courierLatitude(),
            telemetry.courierLongitude(),
            timestamp(telemetry.locationObservedAt()),
            timestamp(telemetry.estimatedPickupAt()),
            timestamp(telemetry.estimatedPickupStartAt()),
            timestamp(telemetry.estimatedPickupEndAt()),
            timestamp(telemetry.estimatedDropoffAt()),
            timestamp(telemetry.estimatedDropoffStartAt()),
            timestamp(telemetry.estimatedDropoffEndAt()),
            timestamp(telemetry.observedAt()),
            telemetry.source(),
            deliveryJobId
        );
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    public record StoredTelemetry(
        String providerId,
        String providerDeliveryId,
        java.math.BigDecimal courierLatitude,
        java.math.BigDecimal courierLongitude,
        Instant locationObservedAt,
        Instant estimatedPickupAt,
        Instant estimatedPickupStartAt,
        Instant estimatedPickupEndAt,
        Instant estimatedDropoffAt,
        Instant estimatedDropoffStartAt,
        Instant estimatedDropoffEndAt,
        Instant observedAt
    ) {
    }
}
