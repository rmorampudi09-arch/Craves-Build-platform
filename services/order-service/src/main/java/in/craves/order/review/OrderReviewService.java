package in.craves.order.review;

import static in.craves.order.review.ReviewModels.*;

import in.craves.order.exception.OrderApiException;
import in.craves.order.review.ReviewValidation.ValidatedReview;
import in.craves.order.review.ReviewValidation.ValidatedTagDefinition;
import in.craves.order.security.CravesPrincipal;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderReviewService {
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 50;

    private static final String REVIEW_SELECT = """
        SELECT r.id,
               r.order_id,
               r.customer_identity_id,
               r.kitchen_id,
               r.chef_identity_id,
               r.status,
               r.version,
               r.overall_rating,
               r.food_taste_rating,
               r.portion_value_rating,
               r.packaging_rating,
               r.accuracy_rating,
               r.chef_preparation_rating,
               r.delivery_rating,
               r.review_text,
               r.submitted_at,
               r.updated_at,
               r.published_at
          FROM order_schema.order_review r
        """;

    private final NamedParameterJdbcTemplate jdbc;
    private final ReviewMediaAuthorizer mediaAuthorizer;

    public OrderReviewService(NamedParameterJdbcTemplate jdbc, ReviewMediaAuthorizer mediaAuthorizer) {
        this.jdbc = jdbc;
        this.mediaAuthorizer = mediaAuthorizer;
    }

    @Transactional
    public CustomerReviewView createReview(
        CravesPrincipal principal,
        UUID orderId,
        ReviewSubmission request
    ) {
        requireRole(principal, "CUSTOMER");
        ValidatedReview review = ReviewValidation.validateSubmission(request, false);
        OrderOwnership order = lockDeliveredOrderForCustomer(principal, orderId);
        validateActiveTags(review.tagCodes());
        mediaAuthorizer.authorize(principal, review.mediaAssetIds());

        UUID reviewId = UUID.randomUUID();
        MapSqlParameterSource parameters = reviewParameters(reviewId, order, review);
        try {
            jdbc.update("""
                INSERT INTO order_schema.order_review (
                    id, order_id, customer_identity_id, kitchen_id, chef_identity_id,
                    status, version, overall_rating, food_taste_rating,
                    portion_value_rating, packaging_rating, accuracy_rating,
                    chef_preparation_rating, delivery_rating, review_text
                ) VALUES (
                    :id, :orderId, :customerId, :kitchenId, :chefId,
                    'PENDING_MODERATION', 1, :overallRating, :foodTasteRating,
                    :portionValueRating, :packagingRating, :accuracyRating,
                    :chefPreparationRating, :deliveryRating, :reviewText
                )
                """, parameters);
        } catch (DuplicateKeyException exception) {
            throw OrderApiException.conflict(
                "ORDER_REVIEW_ALREADY_EXISTS",
                "A review already exists for this order; use the update operation"
            );
        }

        replaceTags(reviewId, review.tagCodes());
        replaceMedia(reviewId, review.mediaAssetIds());
        insertRevision(reviewId, 1, principal.identityId(), review);
        return loadCustomerReview(reviewId, principal.identityId());
    }

    @Transactional
    public CustomerReviewView updateReview(
        CravesPrincipal principal,
        UUID orderId,
        ReviewSubmission request
    ) {
        requireRole(principal, "CUSTOMER");
        ValidatedReview review = ReviewValidation.validateSubmission(request, true);
        lockDeliveredOrderForCustomer(principal, orderId);
        ReviewRow current = lockReviewForOrderAndCustomer(orderId, principal.identityId());
        if (current.version() != review.expectedVersion()) {
            throw OrderApiException.conflict(
                "ORDER_REVIEW_VERSION_CONFLICT",
                "The review changed since it was loaded; refresh before updating"
            );
        }

        validateActiveTags(review.tagCodes());
        mediaAuthorizer.authorize(principal, review.mediaAssetIds());
        int nextVersion = current.version() + 1;
        MapSqlParameterSource parameters = ratingParameters(review)
            .addValue("reviewId", current.id())
            .addValue("expectedVersion", current.version())
            .addValue("nextVersion", nextVersion);
        int updated = jdbc.update("""
            UPDATE order_schema.order_review
               SET status = 'PENDING_MODERATION',
                   version = :nextVersion,
                   overall_rating = :overallRating,
                   food_taste_rating = :foodTasteRating,
                   portion_value_rating = :portionValueRating,
                   packaging_rating = :packagingRating,
                   accuracy_rating = :accuracyRating,
                   chef_preparation_rating = :chefPreparationRating,
                   delivery_rating = :deliveryRating,
                   review_text = :reviewText,
                   updated_at = now(),
                   published_at = NULL,
                   hidden_at = NULL
             WHERE id = :reviewId
               AND version = :expectedVersion
            """, parameters);
        if (updated != 1) {
            throw OrderApiException.conflict(
                "ORDER_REVIEW_VERSION_CONFLICT",
                "The review changed since it was loaded; refresh before updating"
            );
        }

        replaceTags(current.id(), review.tagCodes());
        replaceMedia(current.id(), review.mediaAssetIds());
        insertRevision(current.id(), nextVersion, principal.identityId(), review);
        return loadCustomerReview(current.id(), principal.identityId());
    }

    @Transactional(readOnly = true)
    public CustomerReviewView getOwnReview(CravesPrincipal principal, UUID orderId) {
        requireRole(principal, "CUSTOMER");
        List<ReviewRow> rows = jdbc.query(
            REVIEW_SELECT + " WHERE r.order_id = :orderId AND r.customer_identity_id = :customerId",
            new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("customerId", principal.identityId()),
            this::mapReview
        );
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("ORDER_REVIEW_NOT_FOUND", "Review was not found");
        }
        return hydrateCustomer(rows).getFirst();
    }

    @Transactional(readOnly = true)
    public Page<CustomerReviewView> listOwnReviews(
        CravesPrincipal principal,
        Integer requestedLimit,
        String cursorValue
    ) {
        requireRole(principal, "CUSTOMER");
        int limit = ReviewValidation.validateLimit(requestedLimit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        ReviewCursor cursor = ReviewCursorCodec.decode(cursorValue);
        StringBuilder sql = new StringBuilder(REVIEW_SELECT)
            .append(" WHERE r.customer_identity_id = :customerId");
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("customerId", principal.identityId())
            .addValue("fetchLimit", limit + 1);
        if (cursor != null) {
            sql.append(" AND (r.updated_at, r.id) < (:cursorTime, :cursorId)");
            parameters.addValue("cursorTime", Timestamp.from(cursor.timestamp()));
            parameters.addValue("cursorId", cursor.id());
        }
        sql.append(" ORDER BY r.updated_at DESC, r.id DESC LIMIT :fetchLimit");
        List<ReviewRow> rows = jdbc.query(sql.toString(), parameters, this::mapReview);
        return customerPage(rows, limit, ReviewRow::updatedAt);
    }

    @Transactional(readOnly = true)
    public Page<PublicReviewView> listPublicKitchenReviews(
        UUID kitchenId,
        Integer requestedLimit,
        String cursorValue
    ) {
        int limit = ReviewValidation.validateLimit(requestedLimit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        ReviewCursor cursor = ReviewCursorCodec.decode(cursorValue);
        StringBuilder sql = new StringBuilder(REVIEW_SELECT)
            .append(" WHERE r.kitchen_id = :kitchenId AND r.status = 'PUBLISHED' AND r.published_at IS NOT NULL");
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("kitchenId", kitchenId)
            .addValue("fetchLimit", limit + 1);
        if (cursor != null) {
            sql.append(" AND (r.published_at, r.id) < (:cursorTime, :cursorId)");
            parameters.addValue("cursorTime", Timestamp.from(cursor.timestamp()));
            parameters.addValue("cursorId", cursor.id());
        }
        sql.append(" ORDER BY r.published_at DESC, r.id DESC LIMIT :fetchLimit");
        List<ReviewRow> rows = jdbc.query(sql.toString(), parameters, this::mapReview);
        return publicPage(rows, limit, ReviewRow::publishedAt);
    }

    @Transactional(readOnly = true)
    public ReviewSummary getPublicKitchenSummary(UUID kitchenId) {
        return summary("r.kitchen_id = :kitchenId", new MapSqlParameterSource("kitchenId", kitchenId), kitchenId);
    }

    @Transactional(readOnly = true)
    public Page<PublicReviewView> listChefReviews(
        CravesPrincipal principal,
        UUID kitchenId,
        Integer requestedLimit,
        String cursorValue
    ) {
        requireRole(principal, "CHEF");
        int limit = ReviewValidation.validateLimit(requestedLimit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        ReviewCursor cursor = ReviewCursorCodec.decode(cursorValue);
        StringBuilder sql = new StringBuilder(REVIEW_SELECT)
            .append(" WHERE r.chef_identity_id = :chefId AND r.status = 'PUBLISHED' AND r.published_at IS NOT NULL");
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("chefId", principal.identityId())
            .addValue("fetchLimit", limit + 1);
        if (kitchenId != null) {
            sql.append(" AND r.kitchen_id = :kitchenId");
            parameters.addValue("kitchenId", kitchenId);
        }
        if (cursor != null) {
            sql.append(" AND (r.published_at, r.id) < (:cursorTime, :cursorId)");
            parameters.addValue("cursorTime", Timestamp.from(cursor.timestamp()));
            parameters.addValue("cursorId", cursor.id());
        }
        sql.append(" ORDER BY r.published_at DESC, r.id DESC LIMIT :fetchLimit");
        List<ReviewRow> rows = jdbc.query(sql.toString(), parameters, this::mapReview);
        return publicPage(rows, limit, ReviewRow::publishedAt);
    }

    @Transactional(readOnly = true)
    public ReviewSummary getChefKitchenSummary(CravesPrincipal principal, UUID kitchenId) {
        requireRole(principal, "CHEF");
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("chefId", principal.identityId())
            .addValue("kitchenId", kitchenId);
        return summary(
            "r.chef_identity_id = :chefId AND r.kitchen_id = :kitchenId",
            parameters,
            kitchenId
        );
    }

    @Transactional(readOnly = true)
    public Page<CustomerReviewView> listModerationQueue(
        CravesPrincipal principal,
        ReviewStatus status,
        Integer requestedLimit,
        String cursorValue
    ) {
        requireRole(principal, "ADMIN", "SUPPORT_ADMIN");
        int limit = ReviewValidation.validateLimit(requestedLimit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
        ReviewCursor cursor = ReviewCursorCodec.decode(cursorValue);
        StringBuilder sql = new StringBuilder(REVIEW_SELECT).append(" WHERE 1 = 1");
        MapSqlParameterSource parameters = new MapSqlParameterSource().addValue("fetchLimit", limit + 1);
        if (status != null) {
            sql.append(" AND r.status = :status");
            parameters.addValue("status", status.name());
        }
        if (cursor != null) {
            sql.append(" AND (r.updated_at, r.id) > (:cursorTime, :cursorId)");
            parameters.addValue("cursorTime", Timestamp.from(cursor.timestamp()));
            parameters.addValue("cursorId", cursor.id());
        }
        sql.append(" ORDER BY r.updated_at ASC, r.id ASC LIMIT :fetchLimit");
        List<ReviewRow> rows = jdbc.query(sql.toString(), parameters, this::mapReview);
        return customerPageAscending(rows, limit, ReviewRow::updatedAt);
    }

    @Transactional
    public CustomerReviewView moderate(
        CravesPrincipal principal,
        UUID reviewId,
        ModerationRequest request,
        String adminReason
    ) {
        requireRole(principal, "ADMIN", "SUPPORT_ADMIN");
        String reason = ReviewValidation.validateAdminReason(adminReason);
        if (request == null || request.action() == null) {
            throw OrderApiException.badRequest("REVIEW_MODERATION_ACTION_REQUIRED", "Moderation action is required");
        }
        ReviewRow current = lockReview(reviewId);
        ReviewStatus next = switch (request.action()) {
            case PUBLISH -> ReviewStatus.PUBLISHED;
            case HIDE -> ReviewStatus.HIDDEN;
            case REJECT -> ReviewStatus.REJECTED;
        };
        if (current.status() == next) {
            return loadCustomerReviewForAdmin(reviewId);
        }

        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("reviewId", reviewId)
            .addValue("nextStatus", next.name());
        jdbc.update("""
            UPDATE order_schema.order_review
               SET status = :nextStatus,
                   updated_at = now(),
                   published_at = CASE WHEN :nextStatus = 'PUBLISHED' THEN now() ELSE NULL END,
                   hidden_at = CASE WHEN :nextStatus IN ('HIDDEN', 'REJECTED') THEN now() ELSE NULL END
             WHERE id = :reviewId
            """, parameters);
        jdbc.update("""
            INSERT INTO order_schema.order_review_moderation_audit (
                id, review_id, old_status, new_status, actor_identity_id, reason
            ) VALUES (:id, :reviewId, :oldStatus, :newStatus, :actorId, :reason)
            """, new MapSqlParameterSource()
            .addValue("id", UUID.randomUUID())
            .addValue("reviewId", reviewId)
            .addValue("oldStatus", current.status().name())
            .addValue("newStatus", next.name())
            .addValue("actorId", principal.identityId())
            .addValue("reason", reason));
        return loadCustomerReviewForAdmin(reviewId);
    }

    @Transactional
    public HelpfulResponse markHelpful(CravesPrincipal principal, UUID reviewId) {
        requireRole(principal, "CUSTOMER");
        ReviewRow review = requirePublishedReview(reviewId);
        if (review.customerIdentityId().equals(principal.identityId())) {
            throw OrderApiException.conflict("REVIEW_SELF_VOTE_NOT_ALLOWED", "A customer cannot mark their own review helpful");
        }
        jdbc.update("""
            INSERT INTO order_schema.order_review_helpful_vote (review_id, voter_identity_id)
            VALUES (:reviewId, :voterId)
            ON CONFLICT (review_id, voter_identity_id) DO NOTHING
            """, new MapSqlParameterSource()
            .addValue("reviewId", reviewId)
            .addValue("voterId", principal.identityId()));
        return helpfulResponse(reviewId, principal.identityId());
    }

    @Transactional
    public HelpfulResponse removeHelpful(CravesPrincipal principal, UUID reviewId) {
        requireRole(principal, "CUSTOMER");
        requirePublishedReview(reviewId);
        jdbc.update("""
            DELETE FROM order_schema.order_review_helpful_vote
             WHERE review_id = :reviewId AND voter_identity_id = :voterId
            """, new MapSqlParameterSource()
            .addValue("reviewId", reviewId)
            .addValue("voterId", principal.identityId()));
        return helpfulResponse(reviewId, principal.identityId());
    }

    @Transactional
    public ReportView reportReview(CravesPrincipal principal, UUID reviewId, ReportRequest request) {
        requireRole(principal, "CUSTOMER", "CHEF");
        ReviewRow review = requirePublishedReview(reviewId);
        if (review.customerIdentityId().equals(principal.identityId())) {
            throw OrderApiException.conflict("REVIEW_SELF_REPORT_NOT_ALLOWED", "A customer cannot report their own review");
        }
        if (request == null) {
            throw OrderApiException.badRequest("REVIEW_REPORT_REQUIRED", "Review report request is required");
        }
        String reasonCode = ReviewValidation.validateReportReasonCode(request.reasonCode());
        String detail = ReviewValidation.validateReportDetail(request.detail());
        UUID reportId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO order_schema.order_review_report (
                id, review_id, reporter_identity_id, reason_code, detail
            ) VALUES (:id, :reviewId, :reporterId, :reasonCode, :detail)
            ON CONFLICT (review_id, reporter_identity_id) DO NOTHING
            """, new MapSqlParameterSource()
            .addValue("id", reportId)
            .addValue("reviewId", reviewId)
            .addValue("reporterId", principal.identityId())
            .addValue("reasonCode", reasonCode)
            .addValue("detail", detail));
        return jdbc.query("""
            SELECT id, review_id, reason_code, detail, created_at
              FROM order_schema.order_review_report
             WHERE review_id = :reviewId AND reporter_identity_id = :reporterId
            """, new MapSqlParameterSource()
            .addValue("reviewId", reviewId)
            .addValue("reporterId", principal.identityId()),
            (rs, rowNum) -> mapReport(rs)).stream().findFirst()
            .orElseThrow(() -> OrderApiException.serviceUnavailable(
                "REVIEW_REPORT_PERSISTENCE_FAILED",
                "Review report could not be persisted"
            ));
    }

    @Transactional(readOnly = true)
    public List<ReportView> listReports(CravesPrincipal principal, UUID reviewId) {
        requireRole(principal, "ADMIN", "SUPPORT_ADMIN");
        lockFreeRequireReview(reviewId);
        return jdbc.query("""
            SELECT id, review_id, reason_code, detail, created_at
              FROM order_schema.order_review_report
             WHERE review_id = :reviewId
             ORDER BY created_at ASC, id ASC
            """, new MapSqlParameterSource("reviewId", reviewId), (rs, rowNum) -> mapReport(rs));
    }

    @Transactional(readOnly = true)
    public List<TagDefinitionView> listTagDefinitions(boolean includeInactive) {
        String sql = """
            SELECT code, display_label, dimension, active, sort_order, updated_at
              FROM order_schema.review_tag_definition
            """ + (includeInactive ? "" : " WHERE active = true") +
            " ORDER BY dimension, sort_order, code";
        return jdbc.query(sql, new MapSqlParameterSource(), (rs, rowNum) -> new TagDefinitionView(
            rs.getString("code"),
            rs.getString("display_label"),
            RatingDimension.valueOf(rs.getString("dimension")),
            rs.getBoolean("active"),
            rs.getInt("sort_order"),
            instant(rs, "updated_at")
        ));
    }

    @Transactional
    public TagDefinitionView upsertTagDefinition(
        CravesPrincipal principal,
        String code,
        TagDefinitionRequest request,
        String adminReason
    ) {
        requireRole(principal, "ADMIN");
        ReviewValidation.validateAdminReason(adminReason);
        ValidatedTagDefinition tag = ReviewValidation.validateTagDefinition(code, request);
        jdbc.update("""
            INSERT INTO order_schema.review_tag_definition (
                code, display_label, dimension, active, sort_order,
                created_by_identity_id, updated_by_identity_id
            ) VALUES (
                :code, :label, :dimension, :active, :sortOrder,
                :actorId, :actorId
            )
            ON CONFLICT (code) DO UPDATE
               SET display_label = EXCLUDED.display_label,
                   dimension = EXCLUDED.dimension,
                   active = EXCLUDED.active,
                   sort_order = EXCLUDED.sort_order,
                   updated_by_identity_id = EXCLUDED.updated_by_identity_id,
                   updated_at = now()
            """, new MapSqlParameterSource()
            .addValue("code", tag.code())
            .addValue("label", tag.displayLabel())
            .addValue("dimension", tag.dimension().name())
            .addValue("active", tag.active())
            .addValue("sortOrder", tag.sortOrder())
            .addValue("actorId", principal.identityId()));
        return jdbc.query("""
            SELECT code, display_label, dimension, active, sort_order, updated_at
              FROM order_schema.review_tag_definition
             WHERE code = :code
            """, new MapSqlParameterSource("code", tag.code()), (rs, rowNum) -> new TagDefinitionView(
            rs.getString("code"),
            rs.getString("display_label"),
            RatingDimension.valueOf(rs.getString("dimension")),
            rs.getBoolean("active"),
            rs.getInt("sort_order"),
            instant(rs, "updated_at")
        )).getFirst();
    }

    private OrderOwnership lockDeliveredOrderForCustomer(CravesPrincipal principal, UUID orderId) {
        List<OrderOwnership> orders = jdbc.query("""
            SELECT id, customer_identity_id, kitchen_id, chef_identity_id, status
              FROM order_schema.customer_order
             WHERE id = :orderId
             FOR UPDATE
            """, new MapSqlParameterSource("orderId", orderId), (rs, rowNum) -> new OrderOwnership(
            rs.getObject("id", UUID.class),
            rs.getObject("customer_identity_id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getObject("chef_identity_id", UUID.class),
            rs.getString("status")
        ));
        if (orders.isEmpty() || !orders.getFirst().customerIdentityId().equals(principal.identityId())) {
            throw OrderApiException.notFound("ORDER_NOT_FOUND", "Order was not found");
        }
        OrderOwnership order = orders.getFirst();
        if (!"DELIVERED".equals(order.status())) {
            throw OrderApiException.conflict(
                "ORDER_NOT_REVIEWABLE",
                "A review can be submitted only after the owned order is delivered"
            );
        }
        return order;
    }

    private ReviewRow lockReviewForOrderAndCustomer(UUID orderId, UUID customerId) {
        List<ReviewRow> rows = jdbc.query(
            REVIEW_SELECT + " WHERE r.order_id = :orderId AND r.customer_identity_id = :customerId FOR UPDATE",
            new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("customerId", customerId),
            this::mapReview
        );
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("ORDER_REVIEW_NOT_FOUND", "Review was not found");
        }
        return rows.getFirst();
    }

    private ReviewRow lockReview(UUID reviewId) {
        List<ReviewRow> rows = jdbc.query(
            REVIEW_SELECT + " WHERE r.id = :reviewId FOR UPDATE",
            new MapSqlParameterSource("reviewId", reviewId),
            this::mapReview
        );
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("ORDER_REVIEW_NOT_FOUND", "Review was not found");
        }
        return rows.getFirst();
    }

    private ReviewRow lockFreeRequireReview(UUID reviewId) {
        List<ReviewRow> rows = jdbc.query(
            REVIEW_SELECT + " WHERE r.id = :reviewId",
            new MapSqlParameterSource("reviewId", reviewId),
            this::mapReview
        );
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("ORDER_REVIEW_NOT_FOUND", "Review was not found");
        }
        return rows.getFirst();
    }

    private ReviewRow requirePublishedReview(UUID reviewId) {
        List<ReviewRow> rows = jdbc.query(
            REVIEW_SELECT + " WHERE r.id = :reviewId AND r.status = 'PUBLISHED'",
            new MapSqlParameterSource("reviewId", reviewId),
            this::mapReview
        );
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("PUBLISHED_REVIEW_NOT_FOUND", "Published review was not found");
        }
        return rows.getFirst();
    }

    private CustomerReviewView loadCustomerReview(UUID reviewId, UUID customerId) {
        List<ReviewRow> rows = jdbc.query(
            REVIEW_SELECT + " WHERE r.id = :reviewId AND r.customer_identity_id = :customerId",
            new MapSqlParameterSource()
                .addValue("reviewId", reviewId)
                .addValue("customerId", customerId),
            this::mapReview
        );
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("ORDER_REVIEW_NOT_FOUND", "Review was not found");
        }
        return hydrateCustomer(rows).getFirst();
    }

    private CustomerReviewView loadCustomerReviewForAdmin(UUID reviewId) {
        List<ReviewRow> rows = jdbc.query(
            REVIEW_SELECT + " WHERE r.id = :reviewId",
            new MapSqlParameterSource("reviewId", reviewId),
            this::mapReview
        );
        if (rows.isEmpty()) {
            throw OrderApiException.notFound("ORDER_REVIEW_NOT_FOUND", "Review was not found");
        }
        return hydrateCustomer(rows).getFirst();
    }

    private ReviewSummary summary(String ownerPredicate, MapSqlParameterSource parameters, UUID kitchenId) {
        String sql = """
            SELECT COUNT(*) AS review_count,
                   ROUND(AVG(r.overall_rating)::numeric, 2) AS overall_average,
                   ROUND(AVG(r.food_taste_rating)::numeric, 2) AS food_taste_average,
                   ROUND(AVG(r.portion_value_rating)::numeric, 2) AS portion_value_average,
                   ROUND(AVG(r.packaging_rating)::numeric, 2) AS packaging_average,
                   ROUND(AVG(r.accuracy_rating)::numeric, 2) AS accuracy_average,
                   ROUND(AVG(r.chef_preparation_rating)::numeric, 2) AS chef_preparation_average,
                   ROUND(AVG(r.delivery_rating)::numeric, 2) AS delivery_average
              FROM order_schema.order_review r
             WHERE r.status = 'PUBLISHED'
               AND %s
            """.formatted(ownerPredicate);
        return jdbc.query(sql, parameters, (rs, rowNum) -> new ReviewSummary(
            kitchenId,
            rs.getLong("review_count"),
            rs.getBigDecimal("overall_average"),
            rs.getBigDecimal("food_taste_average"),
            rs.getBigDecimal("portion_value_average"),
            rs.getBigDecimal("packaging_average"),
            rs.getBigDecimal("accuracy_average"),
            rs.getBigDecimal("chef_preparation_average"),
            rs.getBigDecimal("delivery_average")
        )).getFirst();
    }

    private void validateActiveTags(List<String> tagCodes) {
        if (tagCodes.isEmpty()) {
            return;
        }
        List<String> active = jdbc.queryForList("""
            SELECT code
              FROM order_schema.review_tag_definition
             WHERE active = true AND code IN (:codes)
            """, new MapSqlParameterSource("codes", tagCodes), String.class);
        if (active.size() != tagCodes.size() || !active.containsAll(tagCodes)) {
            throw OrderApiException.badRequest(
                "REVIEW_TAG_NOT_AVAILABLE",
                "One or more review tags are not active or do not exist"
            );
        }
    }

    private void replaceTags(UUID reviewId, List<String> tags) {
        jdbc.update(
            "DELETE FROM order_schema.order_review_tag WHERE review_id = :reviewId",
            new MapSqlParameterSource("reviewId", reviewId)
        );
        for (String tag : tags) {
            jdbc.update("""
                INSERT INTO order_schema.order_review_tag (review_id, tag_code)
                VALUES (:reviewId, :tagCode)
                """, new MapSqlParameterSource()
                .addValue("reviewId", reviewId)
                .addValue("tagCode", tag));
        }
    }

    private void replaceMedia(UUID reviewId, List<UUID> mediaAssetIds) {
        jdbc.update(
            "DELETE FROM order_schema.order_review_media WHERE review_id = :reviewId",
            new MapSqlParameterSource("reviewId", reviewId)
        );
        for (int position = 0; position < mediaAssetIds.size(); position++) {
            jdbc.update("""
                INSERT INTO order_schema.order_review_media (review_id, media_asset_id, position)
                VALUES (:reviewId, :mediaAssetId, :position)
                """, new MapSqlParameterSource()
                .addValue("reviewId", reviewId)
                .addValue("mediaAssetId", mediaAssetIds.get(position))
                .addValue("position", position));
        }
    }

    private void insertRevision(UUID reviewId, int revision, UUID actorId, ValidatedReview review) {
        jdbc.update("""
            INSERT INTO order_schema.order_review_revision (
                id, review_id, revision_number, status_snapshot,
                overall_rating, food_taste_rating, portion_value_rating,
                packaging_rating, accuracy_rating, chef_preparation_rating,
                delivery_rating, review_text, tag_codes, media_asset_ids,
                actor_identity_id
            ) VALUES (
                :id, :reviewId, :revision, 'PENDING_MODERATION',
                :overallRating, :foodTasteRating, :portionValueRating,
                :packagingRating, :accuracyRating, :chefPreparationRating,
                :deliveryRating, :reviewText,
                CAST(:tagCodes AS text[]), CAST(:mediaAssetIds AS uuid[]),
                :actorId
            )
            """, ratingParameters(review)
            .addValue("id", UUID.randomUUID())
            .addValue("reviewId", reviewId)
            .addValue("revision", revision)
            .addValue("tagCodes", postgresTextArray(review.tagCodes()))
            .addValue("mediaAssetIds", postgresUuidArray(review.mediaAssetIds()))
            .addValue("actorId", actorId));
    }

    private MapSqlParameterSource reviewParameters(UUID reviewId, OrderOwnership order, ValidatedReview review) {
        return ratingParameters(review)
            .addValue("id", reviewId)
            .addValue("orderId", order.orderId())
            .addValue("customerId", order.customerIdentityId())
            .addValue("kitchenId", order.kitchenId())
            .addValue("chefId", order.chefIdentityId());
    }

    private MapSqlParameterSource ratingParameters(ValidatedReview review) {
        return new MapSqlParameterSource()
            .addValue("overallRating", review.overallRating())
            .addValue("foodTasteRating", review.foodTasteRating())
            .addValue("portionValueRating", review.portionValueRating())
            .addValue("packagingRating", review.packagingRating())
            .addValue("accuracyRating", review.accuracyRating())
            .addValue("chefPreparationRating", review.chefPreparationRating())
            .addValue("deliveryRating", review.deliveryRating())
            .addValue("reviewText", review.reviewText());
    }

    private ReviewRow mapReview(ResultSet rs, int rowNum) throws SQLException {
        return new ReviewRow(
            rs.getObject("id", UUID.class),
            rs.getObject("order_id", UUID.class),
            rs.getObject("customer_identity_id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getObject("chef_identity_id", UUID.class),
            ReviewStatus.valueOf(rs.getString("status")),
            rs.getInt("version"),
            integer(rs, "overall_rating"),
            integer(rs, "food_taste_rating"),
            integer(rs, "portion_value_rating"),
            integer(rs, "packaging_rating"),
            integer(rs, "accuracy_rating"),
            integer(rs, "chef_preparation_rating"),
            integer(rs, "delivery_rating"),
            rs.getString("review_text"),
            instant(rs, "submitted_at"),
            instant(rs, "updated_at"),
            instant(rs, "published_at")
        );
    }

    private List<CustomerReviewView> hydrateCustomer(List<ReviewRow> rows) {
        Hydration hydration = hydrate(rows);
        return rows.stream().map(row -> new CustomerReviewView(
            row.id(),
            row.orderId(),
            row.kitchenId(),
            row.status(),
            row.version(),
            row.overallRating(),
            row.foodTasteRating(),
            row.portionValueRating(),
            row.packagingRating(),
            row.accuracyRating(),
            row.chefPreparationRating(),
            row.deliveryRating(),
            row.reviewText(),
            hydration.tags().getOrDefault(row.id(), List.of()),
            hydration.media().getOrDefault(row.id(), List.of()),
            hydration.helpfulCounts().getOrDefault(row.id(), 0L),
            row.submittedAt(),
            row.updatedAt(),
            row.publishedAt()
        )).toList();
    }

    private List<PublicReviewView> hydratePublic(List<ReviewRow> rows) {
        Hydration hydration = hydrate(rows);
        return rows.stream().map(row -> new PublicReviewView(
            row.id(),
            row.kitchenId(),
            row.overallRating(),
            row.foodTasteRating(),
            row.portionValueRating(),
            row.packagingRating(),
            row.accuracyRating(),
            row.chefPreparationRating(),
            row.deliveryRating(),
            row.reviewText(),
            hydration.tags().getOrDefault(row.id(), List.of()),
            hydration.media().getOrDefault(row.id(), List.of()),
            hydration.helpfulCounts().getOrDefault(row.id(), 0L),
            row.publishedAt()
        )).toList();
    }

    private Hydration hydrate(List<ReviewRow> rows) {
        if (rows.isEmpty()) {
            return new Hydration(Map.of(), Map.of(), Map.of());
        }
        List<UUID> ids = rows.stream().map(ReviewRow::id).toList();
        Map<UUID, List<String>> tags = jdbc.query("""
            SELECT review_id, tag_code
              FROM order_schema.order_review_tag
             WHERE review_id IN (:ids)
             ORDER BY review_id, tag_code
            """, new MapSqlParameterSource("ids", ids), rs -> {
            Map<UUID, List<String>> grouped = new HashMap<>();
            while (rs.next()) {
                grouped.computeIfAbsent(rs.getObject("review_id", UUID.class), ignored -> new ArrayList<>())
                    .add(rs.getString("tag_code"));
            }
            return immutableLists(grouped);
        });
        Map<UUID, List<UUID>> media = jdbc.query("""
            SELECT review_id, media_asset_id
              FROM order_schema.order_review_media
             WHERE review_id IN (:ids)
             ORDER BY review_id, position
            """, new MapSqlParameterSource("ids", ids), rs -> {
            Map<UUID, List<UUID>> grouped = new HashMap<>();
            while (rs.next()) {
                grouped.computeIfAbsent(rs.getObject("review_id", UUID.class), ignored -> new ArrayList<>())
                    .add(rs.getObject("media_asset_id", UUID.class));
            }
            return immutableLists(grouped);
        });
        Map<UUID, Long> counts = jdbc.query("""
            SELECT review_id, COUNT(*) AS helpful_count
              FROM order_schema.order_review_helpful_vote
             WHERE review_id IN (:ids)
             GROUP BY review_id
            """, new MapSqlParameterSource("ids", ids), rs -> {
            Map<UUID, Long> grouped = new HashMap<>();
            while (rs.next()) {
                grouped.put(rs.getObject("review_id", UUID.class), rs.getLong("helpful_count"));
            }
            return Map.copyOf(grouped);
        });
        return new Hydration(tags, media, counts);
    }

    private HelpfulResponse helpfulResponse(UUID reviewId, UUID voterId) {
        MapSqlParameterSource parameters = new MapSqlParameterSource()
            .addValue("reviewId", reviewId)
            .addValue("voterId", voterId);
        return jdbc.query("""
            SELECT EXISTS (
                       SELECT 1
                         FROM order_schema.order_review_helpful_vote
                        WHERE review_id = :reviewId AND voter_identity_id = :voterId
                   ) AS voted,
                   (SELECT COUNT(*)
                      FROM order_schema.order_review_helpful_vote
                     WHERE review_id = :reviewId) AS helpful_count
            """, parameters, (rs, rowNum) -> new HelpfulResponse(
            reviewId,
            rs.getBoolean("voted"),
            rs.getLong("helpful_count")
        )).getFirst();
    }

    private ReportView mapReport(ResultSet rs) throws SQLException {
        return new ReportView(
            rs.getObject("id", UUID.class),
            rs.getObject("review_id", UUID.class),
            rs.getString("reason_code"),
            rs.getString("detail"),
            instant(rs, "created_at")
        );
    }

    private Page<CustomerReviewView> customerPage(
        List<ReviewRow> fetched,
        int limit,
        Function<ReviewRow, Instant> cursorTime
    ) {
        boolean hasMore = fetched.size() > limit;
        List<ReviewRow> retained = hasMore ? fetched.subList(0, limit) : fetched;
        String next = hasMore && !retained.isEmpty()
            ? ReviewCursorCodec.encode(new ReviewCursor(cursorTime.apply(retained.getLast()), retained.getLast().id()))
            : null;
        return new Page<>(hydrateCustomer(retained), next, hasMore);
    }

    private Page<CustomerReviewView> customerPageAscending(
        List<ReviewRow> fetched,
        int limit,
        Function<ReviewRow, Instant> cursorTime
    ) {
        return customerPage(fetched, limit, cursorTime);
    }

    private Page<PublicReviewView> publicPage(
        List<ReviewRow> fetched,
        int limit,
        Function<ReviewRow, Instant> cursorTime
    ) {
        boolean hasMore = fetched.size() > limit;
        List<ReviewRow> retained = hasMore ? fetched.subList(0, limit) : fetched;
        String next = hasMore && !retained.isEmpty()
            ? ReviewCursorCodec.encode(new ReviewCursor(cursorTime.apply(retained.getLast()), retained.getLast().id()))
            : null;
        return new Page<>(hydratePublic(retained), next, hasMore);
    }

    private static <T> Map<UUID, List<T>> immutableLists(Map<UUID, List<T>> values) {
        return values.entrySet().stream().collect(Collectors.toUnmodifiableMap(
            Map.Entry::getKey,
            entry -> List.copyOf(entry.getValue())
        ));
    }

    private static String postgresTextArray(Collection<String> values) {
        if (values.isEmpty()) {
            return "{}";
        }
        return values.stream().map(value -> "\"" + value + "\"").collect(Collectors.joining(",", "{", "}"));
    }

    private static String postgresUuidArray(Collection<UUID> values) {
        if (values.isEmpty()) {
            return "{}";
        }
        return values.stream().map(UUID::toString).collect(Collectors.joining(",", "{", "}"));
    }

    private static Integer integer(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static void requireRole(CravesPrincipal principal, String... roles) {
        if (principal == null || !principal.hasAnyRole(roles)) {
            throw new OrderApiException(HttpStatus.FORBIDDEN, "ROLE_REQUIRED", "Required role is missing");
        }
    }

    private record OrderOwnership(
        UUID orderId,
        UUID customerIdentityId,
        UUID kitchenId,
        UUID chefIdentityId,
        String status
    ) {
    }

    private record ReviewRow(
        UUID id,
        UUID orderId,
        UUID customerIdentityId,
        UUID kitchenId,
        UUID chefIdentityId,
        ReviewStatus status,
        int version,
        Integer overallRating,
        Integer foodTasteRating,
        Integer portionValueRating,
        Integer packagingRating,
        Integer accuracyRating,
        Integer chefPreparationRating,
        Integer deliveryRating,
        String reviewText,
        Instant submittedAt,
        Instant updatedAt,
        Instant publishedAt
    ) {
    }

    private record Hydration(
        Map<UUID, List<String>> tags,
        Map<UUID, List<UUID>> media,
        Map<UUID, Long> helpfulCounts
    ) {
    }
}
