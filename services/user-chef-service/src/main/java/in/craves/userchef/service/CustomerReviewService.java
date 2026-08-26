package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class CustomerReviewService {
    private final JdbcTemplate jdbcTemplate;
    private final OrderReviewVerificationClient orderReviewVerificationClient;

    public CustomerReviewService(JdbcTemplate jdbcTemplate, OrderReviewVerificationClient orderReviewVerificationClient) {
        this.jdbcTemplate = jdbcTemplate;
        this.orderReviewVerificationClient = orderReviewVerificationClient;
    }

    @Transactional
    public CustomerReviewResponse submit(CurrentUser user, CreateCustomerReviewRequest request) {
        validateRequest(request);
        OrderReviewVerificationClient.VerifiedCompletedOrder verifiedOrder =
            orderReviewVerificationClient.verifyCompletedOrder(request.orderId(), user.identityId());
        ensureNoDuplicateReview(verifiedOrder.orderId(), user.identityId());

        UUID reviewId = UUID.randomUUID();
        jdbcTemplate.update(
            """
                INSERT INTO customer_review (
                    id, order_id, customer_identity_id, chef_identity_id, kitchen_id, menu_item_id,
                    rating, title, review_text, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())
            """,
            reviewId,
            verifiedOrder.orderId(),
            user.identityId(),
            request.chefIdentityId(),
            verifiedOrder.kitchenId(),
            request.menuItemId(),
            request.rating(),
            blankToNull(request.title()),
            blankToNull(request.reviewText())
        );

        refreshChefRatingSummary(request.chefIdentityId());
        return getById(reviewId);
    }

    public List<CustomerReviewResponse> listChefReviews(UUID chefIdentityId, int limit) {
        if (chefIdentityId == null) {
            throw ApiException.badRequest("CHEF_IDENTITY_REQUIRED", "Chef identity id is required");
        }
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        return jdbcTemplate.query(
            """
                SELECT cr.*, s.review_count, s.average_rating
                FROM customer_review cr
                LEFT JOIN chef_rating_summary s ON s.chef_identity_id = cr.chef_identity_id
                WHERE cr.chef_identity_id = ?
                ORDER BY cr.created_at DESC
                LIMIT ?
            """,
            this::mapReview,
            chefIdentityId,
            safeLimit
        );
    }

    public List<CustomerReviewResponse> listMenuItemReviews(UUID menuItemId, int limit) {
        if (menuItemId == null) {
            throw ApiException.badRequest("MENU_ITEM_ID_REQUIRED", "Menu item id is required");
        }
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        return jdbcTemplate.query(
            """
                SELECT cr.*, s.review_count, s.average_rating
                FROM customer_review cr
                LEFT JOIN chef_rating_summary s ON s.chef_identity_id = cr.chef_identity_id
                WHERE cr.menu_item_id = ?
                ORDER BY cr.created_at DESC
                LIMIT ?
            """,
            this::mapReview,
            menuItemId,
            safeLimit
        );
    }

    public ChefRatingSummaryResponse getChefRatingSummary(UUID chefIdentityId) {
        if (chefIdentityId == null) {
            throw ApiException.badRequest("CHEF_IDENTITY_REQUIRED", "Chef identity id is required");
        }
        List<ChefRatingSummaryResponse> rows = jdbcTemplate.query(
            """
                SELECT chef_identity_id, review_count, average_rating, updated_at
                FROM chef_rating_summary
                WHERE chef_identity_id = ?
            """,
            (rs, rowNum) -> new ChefRatingSummaryResponse(
                rs.getObject("chef_identity_id", UUID.class),
                rs.getLong("review_count"),
                rs.getBigDecimal("average_rating"),
                instant(rs, "updated_at")
            ),
            chefIdentityId
        );
        if (rows.isEmpty()) {
            return new ChefRatingSummaryResponse(chefIdentityId, 0, null, null);
        }
        return rows.getFirst();
    }

    private CustomerReviewResponse getById(UUID reviewId) {
        List<CustomerReviewResponse> rows = jdbcTemplate.query(
            """
                SELECT cr.*, s.review_count, s.average_rating
                FROM customer_review cr
                LEFT JOIN chef_rating_summary s ON s.chef_identity_id = cr.chef_identity_id
                WHERE cr.id = ?
            """,
            this::mapReview,
            reviewId
        );
        if (rows.isEmpty()) {
            throw ApiException.notFound("CUSTOMER_REVIEW_NOT_FOUND", "Customer review was not found");
        }
        return rows.getFirst();
    }

    private void ensureNoDuplicateReview(UUID orderId, UUID customerIdentityId) {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM customer_review WHERE order_id = ? AND customer_identity_id = ?",
            Integer.class,
            orderId,
            customerIdentityId
        );
        if (count != null && count > 0) {
            throw ApiException.conflict("CUSTOMER_REVIEW_ALREADY_EXISTS", "A review has already been submitted for this order");
        }
    }

    private void refreshChefRatingSummary(UUID chefIdentityId) {
        jdbcTemplate.update(
            """
                INSERT INTO chef_rating_summary (chef_identity_id, review_count, average_rating, updated_at)
                SELECT chef_identity_id, count(*), round(avg(rating)::numeric, 2), now()
                FROM customer_review
                WHERE chef_identity_id = ?
                GROUP BY chef_identity_id
                ON CONFLICT (chef_identity_id)
                DO UPDATE SET
                    review_count = EXCLUDED.review_count,
                    average_rating = EXCLUDED.average_rating,
                    updated_at = now()
            """,
            chefIdentityId
        );
    }

    private CustomerReviewResponse mapReview(ResultSet rs, int rowNum) throws SQLException {
        return new CustomerReviewResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("order_id", UUID.class),
            rs.getObject("customer_identity_id", UUID.class),
            rs.getObject("chef_identity_id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getObject("menu_item_id", UUID.class),
            rs.getInt("rating"),
            rs.getString("title"),
            rs.getString("review_text"),
            rs.getLong("review_count"),
            rs.getBigDecimal("average_rating"),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private static void validateRequest(CreateCustomerReviewRequest request) {
        if (request == null) {
            throw ApiException.badRequest("CUSTOMER_REVIEW_REQUIRED", "Review request is required");
        }
        if (request.orderId() == null) {
            throw ApiException.badRequest("ORDER_ID_REQUIRED", "Order id is required");
        }
        if (request.chefIdentityId() == null) {
            throw ApiException.badRequest("CHEF_IDENTITY_REQUIRED", "Chef identity id is required");
        }
        if (request.rating() < 1 || request.rating() > 5) {
            throw ApiException.badRequest("INVALID_RATING", "Rating must be between 1 and 5");
        }
        if (!StringUtils.hasText(request.reviewText()) && !StringUtils.hasText(request.title())) {
            throw ApiException.badRequest("REVIEW_CONTENT_REQUIRED", "Review title or review text is required");
        }
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record CreateCustomerReviewRequest(
        UUID orderId,
        UUID chefIdentityId,
        UUID menuItemId,
        int rating,
        String title,
        String reviewText
    ) {
    }

    public record CustomerReviewResponse(
        UUID id,
        UUID orderId,
        UUID customerIdentityId,
        UUID chefIdentityId,
        UUID kitchenId,
        UUID menuItemId,
        int rating,
        String title,
        String reviewText,
        long chefReviewCount,
        java.math.BigDecimal chefAverageRating,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record ChefRatingSummaryResponse(
        UUID chefIdentityId,
        long reviewCount,
        java.math.BigDecimal averageRating,
        Instant updatedAt
    ) {
    }
}
