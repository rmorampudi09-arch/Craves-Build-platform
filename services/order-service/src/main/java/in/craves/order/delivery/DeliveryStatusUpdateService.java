package in.craves.order.delivery;

import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import in.craves.order.delivery.DeliveryStatusEventValidator.DeliveryStatusValidationException;
import in.craves.order.delivery.DeliveryStatusModels.DeliveryStatusChangedData;
import in.craves.order.delivery.DeliveryStatusModels.EventEnvelope;
import in.craves.order.delivery.DeliveryStatusTransitionPolicy.Decision;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeliveryStatusUpdateService {
    private static final Logger LOGGER = LoggerFactory.getLogger(DeliveryStatusUpdateService.class);
    private static final Set<String> INELIGIBLE_ORDER_STATUSES = Set.of(
        "CHEF_REJECTED",
        "CANCELLED",
        "REFUND_PENDING",
        "REFUNDED",
        "REFUND_FAILED"
    );
    private static final Set<String> OUT_FOR_DELIVERY_STATUSES = Set.of(
        "PICKED_UP",
        "IN_TRANSIT",
        "AT_DROPOFF"
    );
    private static final Set<String> PRE_ASSIGNMENT_STATUSES = Set.of(
        "PENDING",
        "SEARCHING",
        "DELAYED"
    );
    private static final Set<String> STALE_BORZO_HANDOFF_STATUSES = Set.of(
        "PENDING", "SEARCHING", "DELAYED"
    );

    private final JdbcTemplate jdbcTemplate;
    private final DeliveryStatusEventValidator validator;
    private final DeliveryStatusTransitionPolicy transitionPolicy;
    private final DeliveryStatusCustomerNotificationService notificationService;
    private final ObjectMapper objectMapper;

    @Autowired
    public DeliveryStatusUpdateService(
        JdbcTemplate jdbcTemplate,
        DeliveryStatusEventValidator validator,
        DeliveryStatusTransitionPolicy transitionPolicy,
        DeliveryStatusCustomerNotificationService notificationService,
        ObjectMapper objectMapper
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.validator = validator;
        this.transitionPolicy = transitionPolicy;
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
    }

    public DeliveryStatusUpdateService(
        JdbcTemplate jdbcTemplate,
        DeliveryStatusEventValidator validator,
        DeliveryStatusTransitionPolicy transitionPolicy,
        DeliveryStatusCustomerNotificationService notificationService
    ) {
        this(jdbcTemplate, validator, transitionPolicy, notificationService,
            new ObjectMapper().findAndRegisterModules());
    }

    @Transactional
    public ProcessingResult accept(
        EventEnvelope<DeliveryStatusChangedData> event,
        String rawPayload
    ) {
        validator.validate(event);
        DeliveryStatusChangedData data = event.data();

        int inboxInserted = jdbcTemplate.update(
            """
                INSERT INTO order_schema.delivery_status_inbox (
                    event_id, event_type, event_version, correlation_id,
                    causation_id, subject, delivery_job_id, chef_sub_order_id,
                    provider_id, provider_delivery_id, normalized_status,
                    observed_at, payload, processing_status, received_at
                ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, CAST(? AS jsonb), 'RECEIVED', now()
                )
                ON CONFLICT (event_id) DO NOTHING
                """,
            event.eventId(),
            event.eventType(),
            event.eventVersion(),
            event.correlationId(),
            event.causationId(),
            event.subject(),
            data.deliveryJobId(),
            data.chefSubOrderId(),
            data.providerId(),
            data.providerDeliveryId(),
            data.status(),
            Timestamp.from(data.observedAt()),
            rawPayload
        );
        if (inboxInserted == 0) {
            return new ProcessingResult(false, true, "DUPLICATE_EVENT");
        }

        LockedOrder order = lockOrder(data.chefSubOrderId());
        if (isSupersededBorzoEvent(order, data)) {
            markInbox(event.eventId(), "STALE");
            return new ProcessingResult(false, false, "STALE");
        }
        try {
            validateOrder(order, data);
        } catch (PriorProviderProjectionMissingException exception) {
            bufferHandoff(event.eventId());
            return new ProcessingResult(false, false, "WAITING_FOR_PRIOR_PROVIDER");
        } catch (HandoffProjectionMissingException exception) {
            bufferPidgeStatus(event.eventId());
            return new ProcessingResult(false, false, "WAITING_FOR_HANDOFF");
        }

        ProcessingResult result = applyValidated(event, order);
        if (result.applied() && initialHandoff(data)) {
            drainBufferedPidgeStatuses(data.chefSubOrderId(), data.deliveryJobId());
        }
        if (result.applied() && !data.hasHandoff()
            && "borzo".equalsIgnoreCase(data.providerId())) {
            drainBufferedHandoffs(data.chefSubOrderId(), data.deliveryJobId());
        }
        return result;
    }

    private ProcessingResult applyValidated(
        EventEnvelope<DeliveryStatusChangedData> event,
        LockedOrder order
    ) {
        DeliveryStatusChangedData data = event.data();
        Decision decision = transitionPolicy.decide(
            order.deliveryStatus(),
            order.deliveryTrackingUrl(),
            order.deliveryStatusObservedAt(),
            data.status(),
            data.trackingUrl(),
            data.observedAt()
        );
        // A confirmed provider handoff changes the delivery even when both providers report
        // the same normalized status and neither has supplied a tracking URL yet.
        if (initialHandoff(data) && decision == Decision.NO_CHANGE) {
            decision = Decision.APPLY;
        }

        // Courier details ride on any report newer than the stored one (a same-status report can still refresh them).
        if (decision == Decision.APPLY || decision == Decision.NO_CHANGE) {
            storeCourier(data);
        }

        if (decision != Decision.APPLY) {
            markInbox(event.eventId(), decision.name());
            return new ProcessingResult(false, false, decision.name());
        }

        int updated = jdbcTemplate.update(
            """
                UPDATE order_schema.customer_order
                SET delivery_job_id = ?,
                    delivery_provider_id = ?,
                    delivery_provider_delivery_id = ?,
                    delivery_status = ?,
                    delivery_tracking_url = ?,
                    delivery_status_observed_at = ?,
                    delivery_status_event_id = ?,
                    updated_at = now()
                WHERE id = ?
                """,
            data.deliveryJobId(),
            data.providerId(),
            data.providerDeliveryId(),
            data.status(),
            data.trackingUrl(),
            Timestamp.from(data.observedAt()),
            event.eventId(),
            data.chefSubOrderId()
        );
        if (updated != 1) {
            throw new DeliveryStatusRetryableException("Order delivery projection update was not applied");
        }

        jdbcTemplate.update(
            """
                INSERT INTO order_schema.order_delivery_status_history (
                    id, order_id, delivery_job_id, event_id,
                    old_status, new_status, provider_id, provider_delivery_id,
                    tracking_url, observed_at, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
                """,
            UUID.randomUUID(),
            data.chefSubOrderId(),
            data.deliveryJobId(),
            event.eventId(),
            order.deliveryStatus(),
            data.status(),
            data.providerId(),
            data.providerDeliveryId(),
            data.trackingUrl(),
            Timestamp.from(data.observedAt()),
            event.source()
        );

        synchronizeCommercialOrderStatus(order, data);

        boolean statusChanged = !data.status().equals(order.deliveryStatus());
        if (statusChanged) {
            notificationService.record(
                event.eventId(),
                order.checkoutId(),
                order.customerIdentityId(),
                data
            );
        }

        markInbox(event.eventId(), "PROCESSED");
        return new ProcessingResult(true, false, "PROCESSED");
    }

    /** Fields the event carries replace the stored courier; fields it leaves out (or blank) keep their value. */
    private void storeCourier(DeliveryStatusChangedData data) {
        if (data.courierName() == null && data.courierPhone() == null
            && data.courierPhotoUrl() == null && data.pickupEtaAt() == null) {
            return;
        }
        jdbcTemplate.update(
            """
                UPDATE order_schema.customer_order
                SET delivery_partner_name = COALESCE(NULLIF(btrim(CAST(? AS text)), ''), delivery_partner_name),
                    delivery_partner_phone = COALESCE(NULLIF(btrim(CAST(? AS text)), ''), delivery_partner_phone),
                    delivery_partner_photo_url = COALESCE(NULLIF(btrim(CAST(? AS text)), ''), delivery_partner_photo_url),
                    delivery_partner_pickup_eta_at = COALESCE(CAST(? AS timestamptz), delivery_partner_pickup_eta_at),
                    updated_at = now()
                WHERE id = ?
                """,
            data.courierName(),
            data.courierPhone(),
            data.courierPhotoUrl(),
            data.pickupEtaAt() == null ? null : Timestamp.from(data.pickupEtaAt()),
            data.chefSubOrderId()
        );
    }

    private LockedOrder lockOrder(UUID orderId) {
        // A meal-plan order has no checkout; it stands in for its own checkout in delivery messages.
        return jdbcTemplate.query(
            """
                SELECT id, COALESCE(checkout_id, id) AS checkout_id, customer_identity_id, status,
                       accepted_at, refund_requested_at,
                       delivery_job_id, delivery_provider_id,
                       delivery_provider_delivery_id, delivery_status,
                       delivery_tracking_url, delivery_status_observed_at
                FROM order_schema.customer_order
                WHERE id = ?
                FOR UPDATE
                """,
            this::mapLockedOrder,
            orderId
        ).stream().findFirst().orElseThrow(() -> new DeliveryStatusRetryableException(
            "Chef sub-order is not available yet"
        ));
    }

    private void validateOrder(LockedOrder order, DeliveryStatusChangedData data) {
        if (!order.checkoutId().equals(data.orderId())) {
            throw new DeliveryStatusNonRetryableException(
                "Delivery checkout does not match the chef sub-order"
            );
        }
        if (order.acceptedAt() == null) {
            throw new DeliveryStatusRetryableException(
                "Chef acceptance metadata is not available yet"
            );
        }
        if (order.refundRequestedAt() != null || INELIGIBLE_ORDER_STATUSES.contains(order.orderStatus())) {
            throw new DeliveryStatusNonRetryableException(
                "Order is not eligible for delivery status updates"
            );
        }
        if (order.deliveryJobId() != null && !order.deliveryJobId().equals(data.deliveryJobId())) {
            throw new DeliveryStatusNonRetryableException(
                "Delivery job identifier changed for the chef sub-order"
            );
        }
        if (initialHandoff(data)) {
            if ((order.deliveryProviderId() != null
                    && !"borzo".equalsIgnoreCase(order.deliveryProviderId()))
                || (order.deliveryProviderDeliveryId() != null
                    && !order.deliveryProviderDeliveryId().equals(data.handoffFromProviderDeliveryId()))
                || (order.deliveryStatus() != null
                    && !PRE_ASSIGNMENT_STATUSES.contains(order.deliveryStatus()))) {
                throw new DeliveryStatusNonRetryableException(
                    "Delivery handoff does not match an unassigned Borzo delivery"
                );
            }
            if (order.deliveryJobId() == null || order.deliveryProviderId() == null
                || order.deliveryProviderDeliveryId() == null || order.deliveryStatus() == null) {
                throw new PriorProviderProjectionMissingException(
                    "Prior Borzo delivery projection has not arrived yet"
                );
            }
            if ("DELAYED".equals(order.deliveryStatus())
                && courierPreviouslyAssigned(order.id(), order.deliveryJobId())) {
                throw new DeliveryStatusNonRetryableException(
                    "Delayed Borzo delivery already had an assigned courier"
                );
            }
            return;
        }
        if ("pidge".equalsIgnoreCase(data.providerId())
            && "borzo".equalsIgnoreCase(order.deliveryProviderId())) {
            if (order.deliveryJobId() == null
                || order.deliveryProviderDeliveryId() == null
                || order.deliveryStatus() == null
                || !PRE_ASSIGNMENT_STATUSES.contains(order.deliveryStatus())
                || (continuation(data) && !order.deliveryProviderDeliveryId()
                    .equals(data.handoffFromProviderDeliveryId()))
                || ("DELAYED".equals(order.deliveryStatus())
                    && courierPreviouslyAssigned(order.id(), order.deliveryJobId()))) {
                throw new DeliveryStatusNonRetryableException(
                    "Pidge status does not match an unassigned Borzo delivery"
                );
            }
            throw new HandoffProjectionMissingException(
                "Pidge handoff projection has not arrived yet"
            );
        }
        if (continuation(data)) {
            if (order.deliveryJobId() == null && order.deliveryProviderId() == null
                && order.deliveryProviderDeliveryId() == null && order.deliveryStatus() == null) {
                throw new HandoffProjectionMissingException(
                    "Pidge handoff projection has not arrived yet"
                );
            }
            if (!"pidge".equalsIgnoreCase(order.deliveryProviderId())
                || !Objects.equals(order.deliveryProviderDeliveryId(), data.providerDeliveryId())
                || order.deliveryStatus() == null
                || !hasMatchingAcceptedHandoff(data)) {
                throw new DeliveryStatusNonRetryableException(
                    "Pidge continuation does not match an accepted Borzo handoff"
                );
            }
        }
        if (order.deliveryProviderId() != null
            && !order.deliveryProviderId().equalsIgnoreCase(data.providerId())) {
            throw new DeliveryStatusNonRetryableException(
                "Delivery provider changed for the chef sub-order"
            );
        }
        if (order.deliveryProviderDeliveryId() != null
            && !order.deliveryProviderDeliveryId().equals(data.providerDeliveryId())) {
            throw new DeliveryStatusNonRetryableException(
                "Provider delivery identifier changed for the chef sub-order"
            );
        }
    }

    private static boolean continuation(DeliveryStatusChangedData data) {
        return Boolean.TRUE.equals(data.handoffContinuation());
    }

    private static boolean initialHandoff(DeliveryStatusChangedData data) {
        return data.hasHandoff() && !continuation(data);
    }

    private boolean hasMatchingAcceptedHandoff(DeliveryStatusChangedData data) {
        Boolean matched = jdbcTemplate.queryForObject(
            """
                SELECT EXISTS (
                    SELECT 1
                    FROM order_schema.delivery_status_inbox i
                    JOIN order_schema.order_delivery_status_history h ON h.event_id = i.event_id
                    WHERE i.chef_sub_order_id = ? AND i.delivery_job_id = ?
                      AND lower(i.provider_id) = 'pidge'
                      AND i.provider_delivery_id = ?
                      AND i.processing_status = 'PROCESSED'
                      AND lower(h.provider_id) = 'pidge'
                      AND h.provider_delivery_id = ?
                      AND lower(i.payload -> 'data' ->> 'handoffFromProviderId') = 'borzo'
                      AND i.payload -> 'data' ->> 'handoffFromProviderDeliveryId' = ?
                      AND coalesce(i.payload -> 'data' ->> 'handoffContinuation', 'false') = 'false'
                )
                """,
            Boolean.class,
            data.chefSubOrderId(),
            data.deliveryJobId(),
            data.providerDeliveryId(),
            data.providerDeliveryId(),
            data.handoffFromProviderDeliveryId()
        );
        return Boolean.TRUE.equals(matched);
    }

    private boolean courierPreviouslyAssigned(UUID chefSubOrderId, UUID deliveryJobId) {
        Boolean matched = jdbcTemplate.queryForObject(
            """
                SELECT EXISTS (
                    SELECT 1
                    FROM order_schema.order_delivery_status_history h
                    WHERE h.order_id = ? AND h.delivery_job_id = ?
                      AND h.new_status IN (
                          'COURIER_ASSIGNED', 'COURIER_TO_PICKUP', 'AT_PICKUP',
                          'PICKED_UP', 'IN_TRANSIT', 'AT_DROPOFF', 'DELIVERED',
                          'RETURNING', 'RETURNED'
                      )
                )
                """,
            Boolean.class,
            chefSubOrderId,
            deliveryJobId
        );
        return Boolean.TRUE.equals(matched);
    }

    private boolean isSupersededBorzoEvent(LockedOrder order,
                                           DeliveryStatusChangedData data) {
        if (data.hasHandoff()
            || !"pidge".equalsIgnoreCase(order.deliveryProviderId())
            || !"borzo".equalsIgnoreCase(data.providerId())
            || !Objects.equals(order.deliveryJobId(), data.deliveryJobId())
            || !STALE_BORZO_HANDOFF_STATUSES.contains(data.status())) {
            return false;
        }
        Boolean matched = jdbcTemplate.queryForObject(
            """
                SELECT EXISTS (
                    SELECT 1
                    FROM order_schema.delivery_status_inbox i
                    JOIN order_schema.order_delivery_status_history h
                      ON h.event_id = i.event_id
                    WHERE i.chef_sub_order_id = ? AND i.delivery_job_id = ?
                      AND lower(i.provider_id) = 'pidge'
                      AND lower(h.provider_id) = 'pidge'
                      AND i.processing_status = 'PROCESSED'
                      AND lower(i.payload -> 'data' ->> 'handoffFromProviderId') = 'borzo'
                      AND i.payload -> 'data' ->> 'handoffFromProviderDeliveryId' = ?
                      AND i.observed_at > ?
                )
                """,
            Boolean.class,
            data.chefSubOrderId(),
            data.deliveryJobId(),
            data.providerDeliveryId(),
            Timestamp.from(data.observedAt())
        );
        return Boolean.TRUE.equals(matched);
    }

    private void bufferHandoff(UUID eventId) {
        int updated = jdbcTemplate.update(
            """
                UPDATE order_schema.delivery_status_inbox
                SET processing_status = 'WAITING_FOR_PRIOR_PROVIDER', processed_at = NULL
                WHERE event_id = ? AND processing_status = 'RECEIVED'
                """,
            eventId
        );
        if (updated != 1) {
            throw new DeliveryStatusRetryableException("Delivery handoff could not be buffered");
        }
    }

    private void bufferPidgeStatus(UUID eventId) {
        int updated = jdbcTemplate.update(
            """
                UPDATE order_schema.delivery_status_inbox
                SET processing_status = 'WAITING_FOR_HANDOFF', processed_at = NULL
                WHERE event_id = ? AND processing_status = 'RECEIVED'
                """,
            eventId
        );
        if (updated != 1) {
            throw new DeliveryStatusRetryableException("Pidge status could not be buffered");
        }
    }

    private void drainBufferedHandoffs(UUID chefSubOrderId, UUID deliveryJobId) {
        List<BufferedDeliveryEvent> waiting = jdbcTemplate.query(
            """
                SELECT event_id, payload::text AS raw_payload
                FROM order_schema.delivery_status_inbox
                WHERE chef_sub_order_id = ? AND delivery_job_id = ?
                  AND processing_status = 'WAITING_FOR_PRIOR_PROVIDER'
                ORDER BY observed_at, received_at, event_id
                FOR UPDATE
                """,
            (rs, rowNumber) -> new BufferedDeliveryEvent(
                rs.getObject("event_id", UUID.class), rs.getString("raw_payload")
            ),
            chefSubOrderId,
            deliveryJobId
        );
        JavaType eventType = objectMapper.getTypeFactory().constructParametricType(
            EventEnvelope.class, DeliveryStatusChangedData.class
        );
        for (BufferedDeliveryEvent buffered : waiting) {
            try {
                EventEnvelope<DeliveryStatusChangedData> event = objectMapper.readValue(
                    buffered.rawPayload(), eventType
                );
                if (!buffered.eventId().equals(event.eventId())) {
                    throw new DeliveryStatusValidationException("Buffered handoff event ID changed");
                }
                validator.validate(event);
                if (!initialHandoff(event.data())) {
                    throw new DeliveryStatusValidationException(
                        "Buffered handoff event is not a provider handoff"
                    );
                }
                LockedOrder current = lockOrder(chefSubOrderId);
                validateOrder(current, event.data());
                ProcessingResult applied = applyValidated(event, current);
                if (applied.applied()) {
                    drainBufferedPidgeStatuses(chefSubOrderId, deliveryJobId);
                }
            } catch (PriorProviderProjectionMissingException exception) {
                // Keep the durable inbox row until the matching Borzo projection is available.
                return;
            } catch (DeliveryStatusValidationException | JsonProcessingException exception) {
                markInbox(buffered.eventId(), "REJECTED");
                LOGGER.error("Buffered delivery handoff rejected eventId={} deliveryJobId={} reason={}",
                    buffered.eventId(), deliveryJobId, exception.getMessage());
            }
        }
    }

    private void drainBufferedPidgeStatuses(UUID chefSubOrderId, UUID deliveryJobId) {
        List<BufferedDeliveryEvent> waiting = jdbcTemplate.query(
            """
                SELECT event_id, payload::text AS raw_payload
                FROM order_schema.delivery_status_inbox
                WHERE chef_sub_order_id = ? AND delivery_job_id = ?
                  AND processing_status = 'WAITING_FOR_HANDOFF'
                ORDER BY observed_at, received_at, event_id
                FOR UPDATE
                """,
            (rs, rowNumber) -> new BufferedDeliveryEvent(
                rs.getObject("event_id", UUID.class), rs.getString("raw_payload")
            ),
            chefSubOrderId,
            deliveryJobId
        );
        JavaType eventType = objectMapper.getTypeFactory().constructParametricType(
            EventEnvelope.class, DeliveryStatusChangedData.class
        );
        for (BufferedDeliveryEvent buffered : waiting) {
            try {
                EventEnvelope<DeliveryStatusChangedData> event = objectMapper.readValue(
                    buffered.rawPayload(), eventType
                );
                if (!buffered.eventId().equals(event.eventId())) {
                    throw new DeliveryStatusValidationException("Buffered Pidge event ID changed");
                }
                validator.validate(event);
                if (!"pidge".equalsIgnoreCase(event.data().providerId())
                    || initialHandoff(event.data())) {
                    throw new DeliveryStatusValidationException(
                        "Buffered Pidge event is not a follow-on status"
                    );
                }
                LockedOrder current = lockOrder(chefSubOrderId);
                validateOrder(current, event.data());
                applyValidated(event, current);
            } catch (HandoffProjectionMissingException exception) {
                // The inbox row remains available until a matching handoff is projected.
                return;
            } catch (DeliveryStatusValidationException | JsonProcessingException exception) {
                markInbox(buffered.eventId(), "REJECTED");
                LOGGER.error("Buffered Pidge status rejected eventId={} deliveryJobId={} reason={}",
                    buffered.eventId(), deliveryJobId, exception.getMessage());
            }
        }
    }

    private record BufferedDeliveryEvent(UUID eventId, String rawPayload) {}

    private void synchronizeCommercialOrderStatus(
        LockedOrder order,
        DeliveryStatusChangedData data
    ) {
        String nextStatus = commercialStatusForDelivery(order.orderStatus(), data.status());
        if (Objects.equals(order.orderStatus(), nextStatus)) {
            return;
        }

        int updated = jdbcTemplate.update(
            """
                UPDATE order_schema.customer_order
                SET status = ?, updated_at = now()
                WHERE id = ? AND status = ?
                """,
            nextStatus,
            order.id(),
            order.orderStatus()
        );
        if (updated != 1) {
            throw new DeliveryStatusRetryableException(
                "Commercial order status could not be synchronized with delivery status"
            );
        }

        jdbcTemplate.update(
            """
                INSERT INTO order_schema.order_status_history (
                    id, order_id, old_status, new_status,
                    actor_identity_id, reason, created_at
                ) VALUES (?, ?, ?, ?, NULL, ?, now())
                """,
            UUID.randomUUID(),
            order.id(),
            order.orderStatus(),
            nextStatus,
            "Delivery lifecycle synchronized from " + data.status()
        );
    }

    static String commercialStatusForDelivery(String currentOrderStatus, String deliveryStatus) {
        if ("DELIVERED".equals(deliveryStatus)
            && ("READY_FOR_PICKUP".equals(currentOrderStatus)
                || "OUT_FOR_DELIVERY".equals(currentOrderStatus))) {
            return "DELIVERED";
        }
        if ("READY_FOR_PICKUP".equals(currentOrderStatus)
            && OUT_FOR_DELIVERY_STATUSES.contains(deliveryStatus)) {
            return "OUT_FOR_DELIVERY";
        }
        return currentOrderStatus;
    }

    private void markInbox(UUID eventId, String status) {
        jdbcTemplate.update(
            """
                UPDATE order_schema.delivery_status_inbox
                SET processing_status = ?, processed_at = now()
                WHERE event_id = ?
                """,
            status,
            eventId
        );
    }

    private LockedOrder mapLockedOrder(ResultSet resultSet, int rowNumber) throws SQLException {
        return new LockedOrder(
            resultSet.getObject("id", UUID.class),
            resultSet.getObject("checkout_id", UUID.class),
            resultSet.getObject("customer_identity_id", UUID.class),
            resultSet.getString("status"),
            instant(resultSet, "accepted_at"),
            instant(resultSet, "refund_requested_at"),
            resultSet.getObject("delivery_job_id", UUID.class),
            resultSet.getString("delivery_provider_id"),
            resultSet.getString("delivery_provider_delivery_id"),
            resultSet.getString("delivery_status"),
            resultSet.getString("delivery_tracking_url"),
            instant(resultSet, "delivery_status_observed_at")
        );
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        Timestamp timestamp = resultSet.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record LockedOrder(
        UUID id,
        UUID checkoutId,
        UUID customerIdentityId,
        String orderStatus,
        Instant acceptedAt,
        Instant refundRequestedAt,
        UUID deliveryJobId,
        String deliveryProviderId,
        String deliveryProviderDeliveryId,
        String deliveryStatus,
        String deliveryTrackingUrl,
        Instant deliveryStatusObservedAt
    ) {
    }

    public record ProcessingResult(boolean applied, boolean duplicate, String result) {
    }

    public static class DeliveryStatusRetryableException extends RuntimeException {
        public DeliveryStatusRetryableException(String message) {
            super(message);
        }
    }

    private static class PriorProviderProjectionMissingException extends DeliveryStatusRetryableException {
        private PriorProviderProjectionMissingException(String message) {
            super(message);
        }
    }

    private static class HandoffProjectionMissingException extends DeliveryStatusRetryableException {
        private HandoffProjectionMissingException(String message) {
            super(message);
        }
    }

    public static class DeliveryStatusNonRetryableException extends DeliveryStatusValidationException {
        public DeliveryStatusNonRetryableException(String message) {
            super(message);
        }
    }
}
