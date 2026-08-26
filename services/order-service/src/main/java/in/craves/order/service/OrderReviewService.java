package in.craves.order.service;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.OrderReviewDtos.CreateOrderReviewRequest;
import in.craves.order.web.OrderReviewDtos.OrderReviewResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrderReviewService {
    private final JdbcTemplate jdbcTemplate;

    @Autowired
    public OrderReviewService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public OrderReviewResponse getReview(CravesPrincipal principal, UUID orderId) {
        requireCustomer(principal);
        OrderReviewResponse review = findReview(orderId, principal.identityId());
        if (review == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order review not found");
        }
        return review;
    }

    @Transactional
    public OrderReviewResponse createReview(CravesPrincipal principal, UUID orderId, CreateOrderReviewRequest request) {
        requireCustomer(principal);
        OrderContext order = findDeliveredOrder(orderId, principal.identityId());
        if (order == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Delivered order not found for review");
        }
        OrderReviewResponse existing = findReview(orderId, principal.identityId());
        if (existing != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order review already exists");
        }

        UUID reviewId = UUID.randomUUID();
        jdbcTemplate.update(
            """
                INSERT INTO order_schema.order_review (
                    id,
                    order_id,
                    customer_identity_id,
                    kitchen_id,
                    rating,
                    review_title,
                    review_body,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, now(), now())
            """,
            reviewId,
            orderId,
            principal.identityId(),
            order.kitchenId(),
            request.rating(),
            normalize(request.reviewTitle()),
            normalize(request.reviewBody())
        );

        UUID outboxId = UUID.randomUUID();
        String payload = """
            {"eventType":"ORDER_REVIEW_CREATED","reviewId":"%s","orderId":"%s","kitchenId":"%s","customerIdentityId":"%s","rating":%d}
            """.formatted(outboxId, orderId, order.kitchenId(), principal.identityId(), request.rating()).replace('\n', ' ');
        jdbcTemplate.update(
            """
                INSERT INTO order_schema.order_review_outbox (
                    id,
                    aggregate_type,
                    aggregate_id,
                    event_type,
                    payload_json,
                    status,
                    available_at,
                    created_at
                ) VALUES (?, ?, ?, ?, CAST(? AS jsonb), 'PENDING', now(), now())
            """,
            outboxId,
            "ORDER_REVIEW",
            reviewId,
            "ORDER_REVIEW_CREATED",
            payload
        );

        OrderReviewResponse created = findReview(orderId, principal.identityId());
        if (created == null) {
            throw new IllegalStateException("Order review was not persisted");
        }
        return created;
    }

    private OrderContext findDeliveredOrder(UUID orderId, UUID customerIdentityId) {
        List<OrderContext> rows = jdbcTemplate.query(
            """
                SELECT id, kitchen_id
                FROM order_schema.customer_order
                WHERE id = ?
                  AND customer_identity_id = ?
                  AND status = 'DELIVERED'
            """,
            (rs, rowNum) -> new OrderContext(
                rs.getObject("id", UUID.class),
                rs.getObject("kitchen_id", UUID.class)
            ),
            orderId,
            customerIdentityId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private OrderReviewResponse findReview(UUID orderId, UUID customerIdentityId) {
        List<OrderReviewResponse> rows = jdbcTemplate.query(
            """
                SELECT id, order_id, rating, review_title, review_body, created_at, updated_at
                FROM order_schema.order_review
                WHERE order_id = ?
                  AND customer_identity_id = ?
            """,
            this::mapReview,
            orderId,
            customerIdentityId
        );
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private OrderReviewResponse mapReview(ResultSet rs, int rowNum) throws SQLException {
        return new OrderReviewResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("order_id", UUID.class),
            rs.getInt("rating"),
            rs.getString("review_title"),
            rs.getString("review_body"),
            instant(rs.getTimestamp("created_at")),
            instant(rs.getTimestamp("updated_at"))
        );
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static void requireCustomer(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CUSTOMER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer role is required");
        }
    }

    private record OrderContext(UUID orderId, UUID kitchenId) {
    }
}
