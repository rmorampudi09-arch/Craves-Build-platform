package in.craves.integration.admin;

import in.craves.integration.security.CravesPrincipal;
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
public class AdminCustomerFinancialsController {
    private static final int MAX_LIMIT = 100;

    private final JdbcTemplate jdbcTemplate;

    public AdminCustomerFinancialsController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/{customerIdentityId}/payments")
    public ResponseEntity<CustomerPaymentPage> payments(
        Authentication authentication,
        @PathVariable UUID customerIdentityId,
        @RequestHeader("X-Admin-Reason") String reason,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String provider,
        @RequestParam(required = false) OffsetDateTime from,
        @RequestParam(required = false) OffsetDateTime to,
        @RequestParam(required = false) OffsetDateTime beforeCreatedAt,
        @RequestParam(required = false) UUID beforePaymentId,
        @RequestParam(defaultValue = "50") int limit
    ) {
        AuditContext audit = audit(authentication, "CUSTOMER_PAYMENTS", customerIdentityId, reason, correlationHeader);
        String normalizedStatus = normalizeFilter(status, "status");
        String normalizedProvider = normalizeProvider(provider);
        validateWindow(from, to);
        validateCursor(beforeCreatedAt, beforePaymentId, "payment");
        int boundedLimit = validateLimit(limit);

        StringBuilder sql = new StringBuilder("""
            SELECT id, checkout_id, craves_payment_order_ref, provider, provider_order_id,
                   provider_payment_id, amount, currency, status, provider_status, created_at, updated_at
              FROM payment_schema.payment_order
             WHERE customer_identity_id = ?
            """);
        List<Object> args = new ArrayList<>();
        args.add(customerIdentityId);
        appendCommonFilters(sql, args, normalizedStatus, normalizedProvider, from, to);
        if (beforeCreatedAt != null) {
            sql.append(" AND (created_at < ? OR (created_at = ? AND id < ?))");
            args.add(beforeCreatedAt);
            args.add(beforeCreatedAt);
            args.add(beforePaymentId);
        }
        sql.append(" ORDER BY created_at DESC, id DESC LIMIT ?");
        args.add(boundedLimit + 1);

        List<CustomerPaymentSummary> rows = jdbcTemplate.query(
            sql.toString(),
            (rs, rowNum) -> new CustomerPaymentSummary(
                rs.getObject("id", UUID.class),
                rs.getObject("checkout_id", UUID.class),
                rs.getString("craves_payment_order_ref"),
                rs.getString("provider"),
                rs.getString("provider_order_id"),
                rs.getString("provider_payment_id"),
                rs.getBigDecimal("amount"),
                rs.getString("currency"),
                rs.getString("status"),
                rs.getString("provider_status"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
            ),
            args.toArray()
        );
        boolean hasMore = rows.size() > boundedLimit;
        List<CustomerPaymentSummary> items = hasMore ? rows.subList(0, boundedLimit) : rows;
        CustomerPaymentSummary last = items.isEmpty() ? null : items.getLast();
        persistAudit(audit);

        return response(audit.correlationId(), new CustomerPaymentPage(
            customerIdentityId,
            items,
            hasMore,
            hasMore && last != null ? last.createdAt() : null,
            hasMore && last != null ? last.paymentOrderId() : null
        ));
    }

    @GetMapping("/{customerIdentityId}/refunds")
    public ResponseEntity<CustomerRefundPage> refunds(
        Authentication authentication,
        @PathVariable UUID customerIdentityId,
        @RequestHeader("X-Admin-Reason") String reason,
        @RequestHeader(value = "X-Correlation-ID", required = false) String correlationHeader,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String provider,
        @RequestParam(required = false) OffsetDateTime from,
        @RequestParam(required = false) OffsetDateTime to,
        @RequestParam(required = false) OffsetDateTime beforeCreatedAt,
        @RequestParam(required = false) UUID beforeRefundId,
        @RequestParam(defaultValue = "50") int limit
    ) {
        AuditContext audit = audit(authentication, "CUSTOMER_REFUNDS", customerIdentityId, reason, correlationHeader);
        String normalizedStatus = normalizeFilter(status, "status");
        String normalizedProvider = normalizeProvider(provider);
        validateWindow(from, to);
        validateCursor(beforeCreatedAt, beforeRefundId, "refund");
        int boundedLimit = validateLimit(limit);

        StringBuilder sql = new StringBuilder("""
            SELECT id, payment_order_id, checkout_id, chef_sub_order_id, provider,
                   provider_order_id, provider_payment_id, provider_refund_id, amount, currency,
                   reason, status, provider_status, processed_at, created_at, updated_at
              FROM payment_schema.refund
             WHERE customer_identity_id = ?
            """);
        List<Object> args = new ArrayList<>();
        args.add(customerIdentityId);
        appendCommonFilters(sql, args, normalizedStatus, normalizedProvider, from, to);
        if (beforeCreatedAt != null) {
            sql.append(" AND (created_at < ? OR (created_at = ? AND id < ?))");
            args.add(beforeCreatedAt);
            args.add(beforeCreatedAt);
            args.add(beforeRefundId);
        }
        sql.append(" ORDER BY created_at DESC, id DESC LIMIT ?");
        args.add(boundedLimit + 1);

        List<CustomerRefundSummary> rows = jdbcTemplate.query(
            sql.toString(),
            (rs, rowNum) -> new CustomerRefundSummary(
                rs.getObject("id", UUID.class),
                rs.getObject("payment_order_id", UUID.class),
                rs.getObject("checkout_id", UUID.class),
                rs.getObject("chef_sub_order_id", UUID.class),
                rs.getString("provider"),
                rs.getString("provider_order_id"),
                rs.getString("provider_payment_id"),
                rs.getString("provider_refund_id"),
                rs.getBigDecimal("amount"),
                rs.getString("currency"),
                safeText(rs.getString("reason"), 500),
                rs.getString("status"),
                rs.getString("provider_status"),
                rs.getObject("processed_at", OffsetDateTime.class),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
            ),
            args.toArray()
        );
        boolean hasMore = rows.size() > boundedLimit;
        List<CustomerRefundSummary> items = hasMore ? rows.subList(0, boundedLimit) : rows;
        CustomerRefundSummary last = items.isEmpty() ? null : items.getLast();
        persistAudit(audit);

        return response(audit.correlationId(), new CustomerRefundPage(
            customerIdentityId,
            items,
            hasMore,
            hasMore && last != null ? last.createdAt() : null,
            hasMore && last != null ? last.refundId() : null
        ));
    }

    private static void appendCommonFilters(
        StringBuilder sql,
        List<Object> args,
        String status,
        String provider,
        OffsetDateTime from,
        OffsetDateTime to
    ) {
        if (status != null) {
            sql.append(" AND status = ?");
            args.add(status);
        }
        if (provider != null) {
            sql.append(" AND provider = ?");
            args.add(provider);
        }
        if (from != null) {
            sql.append(" AND created_at >= ?");
            args.add(from);
        }
        if (to != null) {
            sql.append(" AND created_at <= ?");
            args.add(to);
        }
    }

    private AuditContext audit(
        Authentication authentication,
        String resourceType,
        UUID customerIdentityId,
        String reason,
        String correlationHeader
    ) {
        CravesPrincipal principal = requireAdmin(authentication);
        return new AuditContext(
            principal.identityId(),
            resourceType,
            customerIdentityId,
            validateReason(reason),
            correlationId(correlationHeader)
        );
    }

    private void persistAudit(AuditContext audit) {
        jdbcTemplate.update(
            "INSERT INTO payment_schema.admin_investigation_audit " +
                "(id, actor_identity_id, resource_type, resource_id, action, reason, correlation_id, created_at) " +
                "VALUES (?, ?, ?, ?, 'LIST', ?, ?, now())",
            UUID.randomUUID(),
            audit.actorIdentityId(),
            audit.resourceType(),
            audit.resourceId(),
            audit.reason(),
            audit.correlationId()
        );
    }

    private static CravesPrincipal requireAdmin(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CravesPrincipal principal)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Craves access token is required");
        }
        if (!principal.hasAnyRole("PLATFORM_ADMIN", "SUPPORT_ADMIN", "PAYMENTS_ADMIN", "AUDIT_ADMIN")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer financial investigation access is required");
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

    private static String normalizeProvider(String value) {
        String normalized = normalizeFilter(value, "provider");
        if (normalized == null) return null;
        if (!normalized.equals("RAZORPAY") && !normalized.equals("CASHFREE")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "provider must be RAZORPAY or CASHFREE");
        }
        return normalized;
    }

    private static void validateWindow(OffsetDateTime from, OffsetDateTime to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must be before or equal to to");
        }
    }

    private static void validateCursor(OffsetDateTime beforeCreatedAt, UUID beforeId, String label) {
        if ((beforeCreatedAt == null) != (beforeId == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Both " + label + " cursor values must be supplied together");
        }
    }

    private static int validateLimit(int value) {
        if (value < 1 || value > MAX_LIMIT) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and " + MAX_LIMIT);
        }
        return value;
    }

    private static UUID correlationId(String value) {
        if (value == null || value.isBlank()) return UUID.randomUUID();
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Correlation-ID must be a UUID");
        }
    }

    private static String safeText(String value, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }

    private static <T> ResponseEntity<T> response(UUID correlationId, T body) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header("X-Correlation-ID", correlationId.toString())
            .body(body);
    }

    private record AuditContext(
        UUID actorIdentityId,
        String resourceType,
        UUID resourceId,
        String reason,
        UUID correlationId
    ) {}

    public record CustomerPaymentPage(
        UUID customerIdentityId,
        List<CustomerPaymentSummary> items,
        boolean hasMore,
        OffsetDateTime nextBeforeCreatedAt,
        UUID nextBeforePaymentId
    ) {}

    public record CustomerPaymentSummary(
        UUID paymentOrderId,
        UUID checkoutId,
        String cravesReference,
        String provider,
        String providerOrderId,
        String providerPaymentId,
        BigDecimal amount,
        String currency,
        String status,
        String providerStatus,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}

    public record CustomerRefundPage(
        UUID customerIdentityId,
        List<CustomerRefundSummary> items,
        boolean hasMore,
        OffsetDateTime nextBeforeCreatedAt,
        UUID nextBeforeRefundId
    ) {}

    public record CustomerRefundSummary(
        UUID refundId,
        UUID paymentOrderId,
        UUID checkoutId,
        UUID chefSubOrderId,
        String provider,
        String providerOrderId,
        String providerPaymentId,
        String providerRefundId,
        BigDecimal amount,
        String currency,
        String reason,
        String status,
        String providerStatus,
        OffsetDateTime processedAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
    ) {}
}
