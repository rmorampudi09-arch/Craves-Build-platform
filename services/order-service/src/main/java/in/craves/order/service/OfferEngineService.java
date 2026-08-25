package in.craves.order.service;

import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.CartResponse;
import in.craves.order.web.OfferEngineDtos.OfferCodeRequest;
import in.craves.order.web.OfferEngineDtos.OfferResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class OfferEngineService {
    private static final Pattern CODE_PATTERN = Pattern.compile("[A-Z0-9][A-Z0-9_-]{1,39}");

    private final JdbcTemplate jdbcTemplate;
    private final OrderService orderService;

    public OfferEngineService(JdbcTemplate jdbcTemplate, OrderService orderService) {
        this.jdbcTemplate = jdbcTemplate;
        this.orderService = orderService;
    }

    public List<OfferResponse> listApplicable(CravesPrincipal principal) {
        CartResponse cart = orderService.validateCart(principal);
        BigDecimal subtotal = cart.totals().foodSubtotal();
        if (subtotal == null || subtotal.signum() <= 0) {
            return List.of();
        }

        return jdbcTemplate.query(
            """
                SELECT id, code, title, description, discount_type, discount_value,
                       max_discount_amount, minimum_food_subtotal, currency, starts_at, ends_at
                FROM order_schema.offer_definition
                WHERE active = true
                  AND currency = ?
                  AND (starts_at IS NULL OR starts_at <= now())
                  AND (ends_at IS NULL OR ends_at > now())
                  AND (minimum_food_subtotal IS NULL OR minimum_food_subtotal <= ?)
                ORDER BY created_at DESC, id ASC
                LIMIT 50
                """,
            (rs, rowNum) -> mapOffer(rs, subtotal),
            cart.currency(),
            subtotal
        );
    }

    public OfferResponse validate(CravesPrincipal principal, OfferCodeRequest request) {
        if (request == null || request.code() == null) {
            throw OrderApiException.badRequest("OFFER_CODE_REQUIRED", "Offer code is required.");
        }
        String code = request.code().trim().toUpperCase(Locale.ROOT);
        if (!CODE_PATTERN.matcher(code).matches()) {
            throw OrderApiException.badRequest("INVALID_OFFER_CODE", "Offer code format is invalid.");
        }

        CartResponse cart = orderService.validateCart(principal);
        BigDecimal subtotal = cart.totals().foodSubtotal();
        if (subtotal == null || subtotal.signum() <= 0) {
            throw OrderApiException.conflict("EMPTY_CART", "Add items to the cart before applying an offer.");
        }

        List<OfferResponse> matches = jdbcTemplate.query(
            """
                SELECT id, code, title, description, discount_type, discount_value,
                       max_discount_amount, minimum_food_subtotal, currency, starts_at, ends_at
                FROM order_schema.offer_definition
                WHERE UPPER(code) = ?
                  AND active = true
                  AND currency = ?
                  AND (starts_at IS NULL OR starts_at <= now())
                  AND (ends_at IS NULL OR ends_at > now())
                  AND (minimum_food_subtotal IS NULL OR minimum_food_subtotal <= ?)
                LIMIT 1
                """,
            (rs, rowNum) -> mapOffer(rs, subtotal),
            code,
            cart.currency(),
            subtotal
        );
        if (matches.isEmpty()) {
            throw OrderApiException.conflict("OFFER_NOT_APPLICABLE", "This offer is not currently applicable to the cart.");
        }
        return matches.getFirst();
    }

    private OfferResponse mapOffer(ResultSet rs, BigDecimal subtotal) throws SQLException {
        BigDecimal discount = calculateDiscount(
            rs.getString("discount_type"),
            rs.getBigDecimal("discount_value"),
            rs.getBigDecimal("max_discount_amount"),
            subtotal
        );
        return new OfferResponse(
            rs.getObject("id", UUID.class),
            rs.getString("code"),
            rs.getString("title"),
            rs.getString("description"),
            rs.getString("discount_type"),
            rs.getBigDecimal("discount_value"),
            rs.getBigDecimal("max_discount_amount"),
            rs.getBigDecimal("minimum_food_subtotal"),
            rs.getString("currency"),
            discount,
            subtotal,
            subtotal.subtract(discount).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP),
            instant(rs, "starts_at"),
            instant(rs, "ends_at")
        );
    }

    private static BigDecimal calculateDiscount(
        String type,
        BigDecimal value,
        BigDecimal maxDiscount,
        BigDecimal subtotal
    ) {
        if (value == null || value.signum() <= 0) {
            throw OrderApiException.serviceUnavailable("INVALID_OFFER_CONFIGURATION", "Offer configuration is invalid.");
        }
        BigDecimal discount;
        if ("FLAT".equals(type)) {
            discount = value;
        } else if ("PERCENT".equals(type)) {
            discount = subtotal.multiply(value).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        } else {
            throw OrderApiException.serviceUnavailable("INVALID_OFFER_CONFIGURATION", "Offer configuration is invalid.");
        }
        if (maxDiscount != null) {
            discount = discount.min(maxDiscount);
        }
        return discount.min(subtotal).setScale(2, RoundingMode.HALF_UP);
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
