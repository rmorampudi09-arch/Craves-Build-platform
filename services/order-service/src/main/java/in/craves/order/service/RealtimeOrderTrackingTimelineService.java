package in.craves.order.service;

import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.OrderStatus;
import in.craves.order.web.RealtimeOrderTrackingTimelineDtos.TimelineEventResponse;
import in.craves.order.web.RealtimeOrderTrackingTimelineDtos.TimelineResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RealtimeOrderTrackingTimelineService {
    private final JdbcTemplate jdbcTemplate;

    public RealtimeOrderTrackingTimelineService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public TimelineResponse getTimeline(CravesPrincipal principal, UUID orderId) {
        requireCustomer(principal);
        if (orderId == null) {
            throw OrderApiException.badRequest("ORDER_ID_REQUIRED", "Order id is required.");
        }

        List<OrderSnapshot> orders = jdbcTemplate.query(
            "SELECT status, created_at, updated_at FROM order_schema.customer_order WHERE id = ? AND customer_identity_id = ?",
            (rs, rowNum) -> new OrderSnapshot(
                parseStatus(rs.getString("status")),
                instant(rs, "created_at"),
                instant(rs, "updated_at")
            ),
            orderId,
            principal.identityId()
        );
        if (orders.isEmpty()) {
            throw OrderApiException.notFound("ORDER_NOT_FOUND", "Order was not found.");
        }

        OrderSnapshot order = orders.getFirst();
        List<TimelineEventResponse> events = jdbcTemplate.query(
            """
                SELECT id, new_status, created_at
                FROM order_schema.order_status_history
                WHERE order_id = ?
                ORDER BY created_at ASC, id ASC
                """,
            this::mapEvent,
            orderId
        );

        return new TimelineResponse(
            orderId,
            order.status(),
            order.createdAt(),
            order.updatedAt(),
            List.copyOf(events)
        );
    }

    private TimelineEventResponse mapEvent(ResultSet rs, int rowNum) throws SQLException {
        return new TimelineEventResponse(
            rs.getObject("id", UUID.class),
            parseStatus(rs.getString("new_status")),
            instant(rs, "created_at")
        );
    }

    private static OrderStatus parseStatus(String value) {
        try {
            return OrderStatus.valueOf(value);
        } catch (RuntimeException ex) {
            throw OrderApiException.serviceUnavailable(
                "INVALID_ORDER_STATUS",
                "Order tracking data contains an unsupported status."
            );
        }
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static void requireCustomer(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CUSTOMER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer role is required");
        }
    }

    private record OrderSnapshot(OrderStatus status, Instant createdAt, Instant updatedAt) {}
}
