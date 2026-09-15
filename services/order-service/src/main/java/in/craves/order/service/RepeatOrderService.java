package in.craves.order.service;

import in.craves.order.domain.OrderHistoryCursor;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.RepeatOrderDtos.RepeatOrderCandidate;
import in.craves.order.web.RepeatOrderDtos.RepeatOrderItem;
import in.craves.order.web.RepeatOrderDtos.RepeatOrderPage;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RepeatOrderService {
    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 50;
    static final int MAX_CURSOR_LENGTH = 512;
    static final String CURRENT_VALIDATION_NOTICE =
        "Current menu availability and price are validated when rebuilding the cart; delivery eligibility is checked again before checkout.";

    private final NamedParameterJdbcTemplate jdbc;

    @Autowired
    public RepeatOrderService(JdbcTemplate jdbcTemplate) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    RepeatOrderService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public RepeatOrderPage listCandidates(
        CravesPrincipal principal,
        Integer requestedLimit,
        String encodedCursor
    ) {
        requireCustomer(principal);
        int limit = pageSize(requestedLimit);
        OrderHistoryCursor cursor = decodeCursor(encodedCursor);

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("identityId", principal.identityId())
            .addValue("fetchLimit", limit + 1);
        StringBuilder sql = new StringBuilder("""
            SELECT o.id,
                   o.kitchen_id,
                   o.kitchen_name_snapshot,
                   o.currency,
                   o.grand_total,
                   o.created_at
              FROM order_schema.customer_order o
             WHERE o.customer_identity_id = :identityId
               AND o.status = 'DELIVERED'
               AND EXISTS (
                   SELECT 1
                     FROM order_schema.order_item oi
                    WHERE oi.order_id = o.id
                      AND oi.menu_item_id IS NOT NULL
                      AND oi.quantity > 0
               )
            """);
        if (cursor != null) {
            sql.append(" AND (o.created_at < :cursorCreatedAt OR (o.created_at = :cursorCreatedAt AND o.id < :cursorId))\n");
            params.addValue("cursorCreatedAt", cursor.createdAt());
            params.addValue("cursorId", cursor.id());
        }
        sql.append(" ORDER BY o.created_at DESC, o.id DESC LIMIT :fetchLimit");

        List<OrderHeader> fetched = jdbc.query(
            sql.toString(),
            params,
            (rs, rowNum) -> new OrderHeader(
                rs.getObject("id", UUID.class),
                rs.getObject("kitchen_id", UUID.class),
                rs.getString("kitchen_name_snapshot"),
                rs.getString("currency"),
                rs.getBigDecimal("grand_total"),
                instant(rs.getTimestamp("created_at"))
            )
        );
        boolean hasMore = fetched.size() > limit;
        List<OrderHeader> pageHeaders = hasMore
            ? List.copyOf(fetched.subList(0, limit))
            : List.copyOf(fetched);

        Map<UUID, List<RepeatOrderItem>> itemsByOrder = loadItems(pageHeaders);
        Map<UUID, Integer> completedCountsByKitchen = loadCompletedKitchenCounts(
            principal.identityId(),
            pageHeaders
        );
        List<RepeatOrderCandidate> candidates = new ArrayList<>(pageHeaders.size());
        for (OrderHeader header : pageHeaders) {
            List<RepeatOrderItem> items = itemsByOrder.getOrDefault(header.orderId(), List.of());
            if (items.isEmpty()) {
                continue;
            }
            candidates.add(new RepeatOrderCandidate(
                header.orderId(),
                header.kitchenId(),
                header.kitchenName(),
                header.createdAt(),
                completedCountsByKitchen.getOrDefault(header.kitchenId(), 1),
                items,
                header.grandTotal(),
                header.currency(),
                true,
                false,
                0,
                CURRENT_VALIDATION_NOTICE
            ));
        }

        String nextCursor = null;
        if (hasMore && !pageHeaders.isEmpty()) {
            OrderHeader last = pageHeaders.getLast();
            nextCursor = OrderHistoryCursorCodec.encode(
                new OrderHistoryCursor(last.createdAt(), last.orderId())
            );
        }
        return new RepeatOrderPage(List.copyOf(candidates), nextCursor, hasMore);
    }

    private Map<UUID, List<RepeatOrderItem>> loadItems(List<OrderHeader> headers) {
        if (headers.isEmpty()) {
            return Map.of();
        }
        List<UUID> orderIds = headers.stream().map(OrderHeader::orderId).toList();
        List<OrderItemRow> rows = jdbc.query(
            """
                SELECT order_id, menu_item_id, item_name_snapshot, quantity, created_at, id
                  FROM order_schema.order_item
                 WHERE order_id IN (:orderIds)
                   AND menu_item_id IS NOT NULL
                   AND quantity > 0
                 ORDER BY order_id, created_at ASC, id ASC
                """,
            new MapSqlParameterSource("orderIds", orderIds),
            (rs, rowNum) -> new OrderItemRow(
                rs.getObject("order_id", UUID.class),
                new RepeatOrderItem(
                    rs.getObject("menu_item_id", UUID.class),
                    rs.getString("item_name_snapshot"),
                    rs.getInt("quantity")
                )
            )
        );
        Map<UUID, List<RepeatOrderItem>> result = new LinkedHashMap<>();
        for (OrderItemRow row : rows) {
            result.computeIfAbsent(row.orderId(), ignored -> new ArrayList<>()).add(row.item());
        }
        result.replaceAll((ignored, value) -> List.copyOf(value));
        return result;
    }

    private Map<UUID, Integer> loadCompletedKitchenCounts(UUID identityId, List<OrderHeader> headers) {
        if (headers.isEmpty()) {
            return Map.of();
        }
        Set<UUID> kitchenIds = new LinkedHashSet<>();
        headers.stream().map(OrderHeader::kitchenId).filter(id -> id != null).forEach(kitchenIds::add);
        if (kitchenIds.isEmpty()) {
            return Map.of();
        }
        List<KitchenCountRow> rows = jdbc.query(
            """
                SELECT kitchen_id, COUNT(*) AS completed_count
                  FROM order_schema.customer_order
                 WHERE customer_identity_id = :identityId
                   AND status = 'DELIVERED'
                   AND kitchen_id IN (:kitchenIds)
                 GROUP BY kitchen_id
                """,
            new MapSqlParameterSource()
                .addValue("identityId", identityId)
                .addValue("kitchenIds", kitchenIds),
            (rs, rowNum) -> new KitchenCountRow(
                rs.getObject("kitchen_id", UUID.class),
                rs.getInt("completed_count")
            )
        );
        Map<UUID, Integer> result = new LinkedHashMap<>();
        rows.forEach(row -> result.put(row.kitchenId(), row.count()));
        return result;
    }

    private static int pageSize(Integer requestedLimit) {
        if (requestedLimit == null) {
            return DEFAULT_PAGE_SIZE;
        }
        if (requestedLimit < 1 || requestedLimit > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "limit must be between 1 and " + MAX_PAGE_SIZE
            );
        }
        return requestedLimit;
    }

    private static OrderHistoryCursor decodeCursor(String encodedCursor) {
        if (encodedCursor == null || encodedCursor.isBlank()) {
            return null;
        }
        if (encodedCursor.length() > MAX_CURSOR_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cursor is invalid");
        }
        try {
            return OrderHistoryCursorCodec.decode(encodedCursor);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cursor is invalid", exception);
        }
    }

    private static void requireCustomer(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CUSTOMER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer role is required");
        }
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record OrderHeader(
        UUID orderId,
        UUID kitchenId,
        String kitchenName,
        String currency,
        java.math.BigDecimal grandTotal,
        Instant createdAt
    ) {
    }

    private record OrderItemRow(UUID orderId, RepeatOrderItem item) {
    }

    private record KitchenCountRow(UUID kitchenId, int count) {
    }
}
