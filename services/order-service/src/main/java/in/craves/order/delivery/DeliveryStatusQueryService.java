package in.craves.order.delivery;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.DeliveryStatusDtos.DeliveryStatusHistoryResponse;
import in.craves.order.web.DeliveryStatusDtos.DeliveryStatusResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DeliveryStatusQueryService {
    private final JdbcTemplate jdbcTemplate;
    private final DeliveryCodeService deliveryCodes;

    public DeliveryStatusQueryService(JdbcTemplate jdbcTemplate, DeliveryCodeService deliveryCodes) {
        this.jdbcTemplate = jdbcTemplate;
        this.deliveryCodes = deliveryCodes;
    }

    // One connection for the order, history and code reads, which run inside the outer row mapper; without it each
    // request holds two pool connections at once, and a few parallel polls can exhaust a small Hikari pool.
    @Transactional(readOnly = true)
    public DeliveryStatusResponse getForCustomer(CravesPrincipal principal, UUID orderId) {
        if (principal == null || !principal.hasRole("CUSTOMER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer role is required");
        }

        return jdbcTemplate.query(
            """
                SELECT id, delivery_job_id, delivery_provider_id,
                       delivery_status, delivery_tracking_url,
                       delivery_status_observed_at
                FROM order_schema.customer_order
                WHERE id = ? AND customer_identity_id = ?
                """,
            (resultSet, rowNumber) -> mapCurrent(resultSet, history(orderId)),
            orderId,
            principal.identityId()
        ).stream().findFirst().orElseThrow(() -> new ResponseStatusException(
            HttpStatus.NOT_FOUND,
            "Order was not found"
        ));
    }

    private List<DeliveryStatusHistoryResponse> history(UUID orderId) {
        return jdbcTemplate.query(
            """
                SELECT old_status, new_status, tracking_url,
                       observed_at, created_at
                FROM order_schema.order_delivery_status_history
                WHERE order_id = ?
                ORDER BY observed_at ASC, created_at ASC
                LIMIT 100
                """,
            this::mapHistory,
            orderId
        );
    }

    private DeliveryStatusResponse mapCurrent(
        ResultSet resultSet,
        List<DeliveryStatusHistoryResponse> history
    ) throws SQLException {
        UUID orderId = resultSet.getObject("id", UUID.class);
        String providerId = resultSet.getString("delivery_provider_id");
        String status = resultSet.getString("delivery_status");
        return new DeliveryStatusResponse(
            orderId,
            resultSet.getObject("delivery_job_id", UUID.class),
            providerId,
            status,
            resultSet.getString("delivery_tracking_url"),
            instant(resultSet, "delivery_status_observed_at"),
            history,
            deliveryCodes.codeForCustomer(orderId, providerId, status)
        );
    }

    private DeliveryStatusHistoryResponse mapHistory(ResultSet resultSet, int rowNumber)
        throws SQLException {
        return new DeliveryStatusHistoryResponse(
            resultSet.getString("old_status"),
            resultSet.getString("new_status"),
            resultSet.getString("tracking_url"),
            instant(resultSet, "observed_at"),
            instant(resultSet, "created_at")
        );
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        Timestamp timestamp = resultSet.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}
