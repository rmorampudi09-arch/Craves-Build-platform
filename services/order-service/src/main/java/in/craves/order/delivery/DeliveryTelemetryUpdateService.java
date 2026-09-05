package in.craves.order.delivery;

import in.craves.order.delivery.DeliveryTelemetryEventValidator.DeliveryTelemetryValidationException;
import in.craves.order.delivery.DeliveryTelemetryModels.DeliveryTelemetryUpdatedData;
import in.craves.order.delivery.DeliveryTelemetryModels.EventEnvelope;
import io.micrometer.core.instrument.MeterRegistry;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeliveryTelemetryUpdateService {
    private static final Set<String> TERMINAL_DELIVERY_STATUSES = Set.of(
        "DELIVERED", "CANCELLED", "RETURNED", "FAILED"
    );
    private static final Set<String> INELIGIBLE_ORDER_STATUSES = Set.of(
        "CHEF_REJECTED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_FAILED"
    );

    private final JdbcTemplate jdbcTemplate;
    private final DeliveryTelemetryEventValidator validator;
    private final MeterRegistry meterRegistry;

    public DeliveryTelemetryUpdateService(
        JdbcTemplate jdbcTemplate,
        DeliveryTelemetryEventValidator validator,
        MeterRegistry meterRegistry
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.validator = validator;
        this.meterRegistry = meterRegistry;
    }

    @Transactional
    public ProcessingResult accept(EventEnvelope<DeliveryTelemetryUpdatedData> event) {
        validator.validate(event);
        DeliveryTelemetryUpdatedData data = event.data();
        LockedOrder order = lockOrder(data.chefSubOrderId());
        validateOrderIdentity(order, data);

        if (event.eventId().equals(order.telemetryEventId())) {
            return result(false, true, "DUPLICATE_EVENT", data.providerId());
        }
        if (order.refundRequestedAt() != null || INELIGIBLE_ORDER_STATUSES.contains(order.orderStatus())) {
            return result(false, false, "ORDER_NOT_ELIGIBLE", data.providerId());
        }
        if (TERMINAL_DELIVERY_STATUSES.contains(order.deliveryStatus())) {
            return result(false, false, "TERMINAL_DELIVERY", data.providerId());
        }
        if (order.telemetryObservedAt() != null
            && !data.observedAt().isAfter(order.telemetryObservedAt())) {
            return result(false, false, "STALE_TELEMETRY", data.providerId());
        }

        int updated = jdbcTemplate.update(
            "UPDATE order_schema.customer_order SET " +
                "delivery_courier_latitude = COALESCE(?, delivery_courier_latitude), " +
                "delivery_courier_longitude = COALESCE(?, delivery_courier_longitude), " +
                "delivery_courier_location_observed_at = COALESCE(?, delivery_courier_location_observed_at), " +
                "delivery_estimated_pickup_at = COALESCE(?, delivery_estimated_pickup_at), " +
                "delivery_estimated_pickup_start_at = COALESCE(?, delivery_estimated_pickup_start_at), " +
                "delivery_estimated_pickup_end_at = COALESCE(?, delivery_estimated_pickup_end_at), " +
                "delivery_estimated_dropoff_at = COALESCE(?, delivery_estimated_dropoff_at), " +
                "delivery_estimated_dropoff_start_at = COALESCE(?, delivery_estimated_dropoff_start_at), " +
                "delivery_estimated_dropoff_end_at = COALESCE(?, delivery_estimated_dropoff_end_at), " +
                "delivery_telemetry_observed_at = ?, delivery_telemetry_event_id = ?, updated_at = now() " +
                "WHERE id = ?",
            data.courierLatitude(),
            data.courierLongitude(),
            timestamp(data.locationObservedAt()),
            timestamp(data.estimatedPickupAt()),
            timestamp(data.estimatedPickupStartAt()),
            timestamp(data.estimatedPickupEndAt()),
            timestamp(data.estimatedDropoffAt()),
            timestamp(data.estimatedDropoffStartAt()),
            timestamp(data.estimatedDropoffEndAt()),
            timestamp(data.observedAt()),
            event.eventId(),
            data.chefSubOrderId()
        );
        if (updated != 1) {
            throw new DeliveryTelemetryRetryableException("Order telemetry projection update was not applied");
        }
        return result(true, false, "PROCESSED", data.providerId());
    }

    private LockedOrder lockOrder(UUID orderId) {
        return jdbcTemplate.query(
            "SELECT id, checkout_id, status, accepted_at, refund_requested_at, " +
                "delivery_job_id, delivery_provider_id, delivery_provider_delivery_id, delivery_status, " +
                "delivery_telemetry_observed_at, delivery_telemetry_event_id " +
                "FROM order_schema.customer_order WHERE id = ? FOR UPDATE",
            this::mapLockedOrder,
            orderId
        ).stream().findFirst().orElseThrow(() -> new DeliveryTelemetryRetryableException(
            "Chef sub-order is not available yet"
        ));
    }

    private void validateOrderIdentity(LockedOrder order, DeliveryTelemetryUpdatedData data) {
        if (!order.checkoutId().equals(data.orderId())) {
            throw new DeliveryTelemetryNonRetryableException(
                "Delivery telemetry checkout does not match the chef sub-order"
            );
        }
        if (order.acceptedAt() == null) {
            throw new DeliveryTelemetryRetryableException(
                "Chef acceptance metadata is not available yet"
            );
        }

        boolean noStatusProjectionYet = order.deliveryJobId() == null
            && order.deliveryProviderId() == null
            && order.deliveryProviderDeliveryId() == null
            && order.deliveryStatus() == null;
        if (noStatusProjectionYet) {
            return;
        }

        boolean partialStatusProjection = order.deliveryJobId() == null
            || order.deliveryProviderId() == null
            || order.deliveryProviderDeliveryId() == null
            || order.deliveryStatus() == null;
        if (partialStatusProjection) {
            throw new DeliveryTelemetryRetryableException(
                "Delivery status projection is temporarily incomplete"
            );
        }
        if (!order.deliveryJobId().equals(data.deliveryJobId())) {
            throw new DeliveryTelemetryNonRetryableException(
                "Delivery telemetry job identifier changed for the chef sub-order"
            );
        }
        if (!order.deliveryProviderId().equalsIgnoreCase(data.providerId())) {
            throw new DeliveryTelemetryNonRetryableException(
                "Delivery telemetry provider changed for the chef sub-order"
            );
        }
        if (!order.deliveryProviderDeliveryId().equals(data.providerDeliveryId())) {
            throw new DeliveryTelemetryNonRetryableException(
                "Delivery telemetry provider identifier changed for the chef sub-order"
            );
        }
    }

    private ProcessingResult result(boolean applied, boolean duplicate, String outcome, String providerId) {
        meterRegistry.counter(
            "craves.order.delivery.telemetry",
            "provider", providerId == null ? "unknown" : providerId.toLowerCase(),
            "outcome", outcome.toLowerCase()
        ).increment();
        return new ProcessingResult(applied, duplicate, outcome);
    }

    private LockedOrder mapLockedOrder(ResultSet rs, int rowNumber) throws SQLException {
        return new LockedOrder(
            rs.getObject("id", UUID.class),
            rs.getObject("checkout_id", UUID.class),
            rs.getString("status"),
            instant(rs, "accepted_at"),
            instant(rs, "refund_requested_at"),
            rs.getObject("delivery_job_id", UUID.class),
            rs.getString("delivery_provider_id"),
            rs.getString("delivery_provider_delivery_id"),
            rs.getString("delivery_status"),
            instant(rs, "delivery_telemetry_observed_at"),
            rs.getObject("delivery_telemetry_event_id", UUID.class)
        );
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private record LockedOrder(
        UUID id,
        UUID checkoutId,
        String orderStatus,
        Instant acceptedAt,
        Instant refundRequestedAt,
        UUID deliveryJobId,
        String deliveryProviderId,
        String deliveryProviderDeliveryId,
        String deliveryStatus,
        Instant telemetryObservedAt,
        UUID telemetryEventId
    ) {
    }

    public record ProcessingResult(boolean applied, boolean duplicate, String result) {
    }

    public static class DeliveryTelemetryRetryableException extends RuntimeException {
        public DeliveryTelemetryRetryableException(String message) {
            super(message);
        }
    }

    public static class DeliveryTelemetryNonRetryableException extends DeliveryTelemetryValidationException {
        public DeliveryTelemetryNonRetryableException(String message) {
            super(message);
        }
    }
}
