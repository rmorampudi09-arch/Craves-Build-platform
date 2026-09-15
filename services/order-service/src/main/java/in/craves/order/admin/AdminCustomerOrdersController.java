package in.craves.order.admin;

import in.craves.order.security.CravesPrincipal;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/operations/customers")
public class AdminCustomerOrdersController {
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 100;

    private final JdbcTemplate jdbcTemplate;

    public AdminCustomerOrdersController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/{customerIdentityId}/orders")
    public ResponseEntity<CustomerOrderPage> orders(
        Authentication authentication,
        @PathVariable UUID customerIdentityId,
        @RequestHeader("X-Admin-Reason") String reason,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) UUID kitchenId,
        @RequestParam(required = false) OffsetDateTime from,
        @RequestParam(required = false) OffsetDateTime to,
        @RequestParam(required = false) OffsetDateTime beforeCreatedAt,
        @RequestParam(required = false) UUID beforeOrderId,
        @RequestParam(defaultValue = "50") int limit
    ) {
        CravesPrincipal principal = requireAdmin(authentication);
        String normalizedReason = validateReason(reason);
        String normalizedStatus = normalizeFilter(status, "status");
        validateWindow(from, to);
        validateCursor(beforeCreatedAt, beforeOrderId);
        int boundedLimit = validateLimit(limit);
        UUID correlationId = correlationId(correlationHeader);

        StringBuilder sql = new StringBuilder("""
            SELECT id, checkout_id, kitchen_id, kitchen_name_snapshot, status, currency,
                   grand_total, order_source, delivery_status, delivery_provider_id,
                   refund_id, refund_provider_status, created_at, updated_at
              FROM order_schema.customer_order
             WHERE customer_identity_id = ?
            """);
        List<Object> args = new ArrayList<>();
        args.add(customerIdentityId);

        if (normalizedStatus != null) {
            sql.append(" AND status = ?");
            args.add(normalizedStatus);
        }
        if (kitchenId != null) {
            sql.append(" AND kitchen_id = ?");
            args.add(kitchenId);
        }
        if (from != null) {
            sql.append(" AND created_at >= ?");
            args.add(from);
        }
        if (to != null) {
            sql.append(" AND created_at <= ?");
            args.add(to);
        }
        if (beforeCreatedAt != null) {
            sql.append(" AND (created_at < ? OR (created_at = ? AND id < ?))");
            args.add(beforeCreatedAt);
            args.add(beforeCreatedAt);
            args.add(beforeOrderId);
        }
        sql.append(" ORDER BY created_at DESC, id DESC LIMIT ?");
        args.add(boundedLimit + 1);

        List<CustomerOrderSummary> rows = jdbcTemplate.query(
            sql.toString(),
            (rs, rowNum) -> new CustomerOrderSummary(
                rs.getObject("id", UUID.class),
                rs.getObject("checkout_id", UUID.class),
                rs.getObject("kitchen_id", UUID.class),
                rs.getString("kitchen_name_snapshot"),
                rs.getString("status"),
                rs.getString("currency"),
                rs.getBigDecimal("grand_total"),
                rs.getString("order_source"),
                rs.getString("delivery_status"),
                rs.getString("delivery_provider_id"),
                rs.getObject("refund_id", UUID.class),
                rs.getString("refund_provider_status"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
            ),
            args.toArray()
        );

        boolean hasMore = rows.size() > boundedLimit;
        List<CustomerOrderSummary> items = hasMore ? rows.subList(0, boundedLimit) : rows;
        CustomerOrderSummary last = items.isEmpty() ? null : items.getLast();

        jdbcTemplate.update(
            "INSERT INTO order_schema.admin_investigation_audit " +
                "(id, actor_identity_id, resource_type, resource_id, action, reason, correlation_id, created_at) " +
                "VALUES (?, ?, 'CUSTOMER_ORDERS', ?, 'LIST', ?, ?, now())",
            UUID.randomUUID(), principal.identityId(), customerIdentityId, normalizedReason, correlationId
        );

        CustomerOrderPage body = new CustomerOrderPage(
            customerIdentityId,
            items,
            hasMore,
            hasMore && last != null ? last.createdAt() : null,
            hasMore && last != null ? last.orderId() : null
        );
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header("X-Correlation-ID", correlationId.toString())
            .body(body);
    }

    private static CravesPrincipal requireAdmin(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CravesPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves access token is required");
        }
        if (!principal.hasAnyRole(
            "PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "OPERATIONS_ADMIN", "AUDIT_ADMIN"
        )) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer order investigation access is required");
        }
        return principal;
    }

    private static String validateReason(String value) {
        String normalized = value == null ? "" : value.replace('\n', ' ').replace('\r', ' ').trim();
        if (normalized.length() < 10 || normalized.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Admin-Reason must contain 10 to 500 characters");
        }
        return normalized;
    }

    private static String normalizeFilter(String value, String label) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!normalized.matches("[A-Z0-9_]{1,50}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, label + " filter is invalid");
        }
        return normalized;
    }

    private static void validateWindow(OffsetDateTime from, OffsetDateTime to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must be before or equal to to");
        }
    }

    private static void validateCursor(OffsetDateTime beforeCreatedAt, UUID beforeOrderId) {
        if ((beforeCreatedAt == null) != (beforeOrderId == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Both order cursor values must be supplied together");
        }
    }

    private static int validateLimit(int value) {
        if (value < 1 || value > MAX_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and " + MAX_LIMIT);
        }
        return value == 0 ? DEFAULT_LIMIT : value;
    }

    private static UUID correlationId(String value) {
        if (value == null || value.isBlank()) return UUID.randomUUID();
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Correlation-ID must be a UUID");
        }
    }

    public record CustomerOrderPage(
        UUID customerIdentityId,
        List<CustomerOrderSummary> items,
        boolean hasMore,
        OffsetDateTime nextBeforeCreatedAt,
        UUID nextBeforeOrderId
    ) {}

    public record CustomerOrderSummary(
        UUID orderId,
        UUID checkoutId,
        UUID kitchenId,
        String kitchenName,
        String status,
        String currency,
        BigDecimal grandTotal,
        String orderSource,
        String deliveryStatus,
        String deliveryProviderId,
        UUID refundId,
        String refundProviderStatus,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}
}
