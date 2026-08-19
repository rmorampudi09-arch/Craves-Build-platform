package in.craves.order.service;

import in.craves.order.domain.OrderHistoryCursor;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.CustomerAddressSnapshotResponse;
import in.craves.order.web.ApiDtos.KitchenPickupSnapshotResponse;
import in.craves.order.web.ApiDtos.OrderItemResponse;
import in.craves.order.web.ApiDtos.OrderResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import in.craves.order.web.OrderHistoryDtos.OrderPageResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

@Service
public class OrderHistoryService {
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_CURSOR_LENGTH = 512;

    private final NamedParameterJdbcTemplate jdbc;

    public OrderHistoryService(JdbcTemplate jdbcTemplate) {
        this(new NamedParameterJdbcTemplate(jdbcTemplate));
    }

    OrderHistoryService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public OrderPageResponse listCustomerOrders(
        CravesPrincipal principal,
        int limit,
        String encodedCursor,
        OrderStatus status
    ) {
        requireCustomer(principal);
        return listOrders(principal.identityId(), false, limit, encodedCursor, status);
    }

    public OrderPageResponse listChefOrders(
        CravesPrincipal principal,
        int limit,
        String encodedCursor,
        OrderStatus status
    ) {
        requireChef(principal);
        return listOrders(principal.identityId(), true, limit, encodedCursor, status);
    }

    private OrderPageResponse listOrders(
        UUID identityId,
        boolean chef,
        int limit,
        String encodedCursor,
        OrderStatus status
    ) {
        validatePageSize(limit);
        OrderHistoryCursor cursor = decodeCursor(encodedCursor);
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("identityId", identityId)
            .addValue("fetchLimit", limit + 1);

        StringBuilder sql = new StringBuilder("""
            SELECT o.*
              FROM order_schema.customer_order o
             WHERE
            """);
        if (chef) {
            sql.append(" o.chef_identity_id = :identityId\n");
        } else {
            sql.append(" o.customer_identity_id = :identityId\n");
        }
        if (status != null) {
            sql.append(" AND o.status = :status\n");
            params.addValue("status", status.name());
        }
        if (cursor != null) {
            sql.append(" AND (o.created_at < :cursorCreatedAt OR (o.created_at = :cursorCreatedAt AND o.id < :cursorId))\n");
            params.addValue("cursorCreatedAt", cursor.createdAt());
            params.addValue("cursorId", cursor.id());
        }
        sql.append(" ORDER BY o.created_at DESC, o.id DESC LIMIT :fetchLimit");

        List<OrderResponse> fetched = jdbc.query(sql.toString(), params, this::mapOrderWithoutItems);
        boolean hasMore = fetched.size() > limit;
        List<OrderResponse> pageRows = hasMore
            ? List.copyOf(fetched.subList(0, limit))
            : List.copyOf(fetched);
        Map<UUID, List<OrderItemResponse>> itemsByOrder = loadItems(pageRows);
        List<OrderResponse> orders = pageRows.stream()
            .map(order -> attachItems(order, itemsByOrder.getOrDefault(order.id(), List.of())))
            .toList();

        String nextCursor = null;
        if (hasMore && !orders.isEmpty()) {
            OrderResponse last = orders.get(orders.size() - 1);
            nextCursor = OrderHistoryCursorCodec.encode(
                new OrderHistoryCursor(last.createdAt(), last.id())
            );
        }
        return new OrderPageResponse(orders, nextCursor, hasMore);
    }

    private Map<UUID, List<OrderItemResponse>> loadItems(List<OrderResponse> orders) {
        if (orders.isEmpty()) {
            return Map.of();
        }
        List<UUID> orderIds = orders.stream().map(OrderResponse::id).toList();
        Map<UUID, List<OrderItemResponse>> itemsByOrder = new LinkedHashMap<>();
        jdbc.query(
            """
                SELECT order_id, id, menu_item_id, item_name_snapshot, category_snapshot,
                       food_type_snapshot, unit_price_snapshot, quantity, line_total, created_at
                  FROM order_schema.order_item
                 WHERE order_id IN (:orderIds)
                 ORDER BY order_id, created_at ASC, id ASC
                """,
            new MapSqlParameterSource("orderIds", orderIds),
            (rs, rowNum) -> {
                UUID orderId = rs.getObject("order_id", UUID.class);
                OrderItemResponse item = new OrderItemResponse(
                    rs.getObject("id", UUID.class),
                    rs.getObject("menu_item_id", UUID.class),
                    rs.getString("item_name_snapshot"),
                    rs.getString("category_snapshot"),
                    rs.getString("food_type_snapshot"),
                    rs.getBigDecimal("unit_price_snapshot"),
                    rs.getInt("quantity"),
                    rs.getBigDecimal("line_total")
                );
                itemsByOrder.computeIfAbsent(orderId, ignored -> new java.util.ArrayList<>()).add(item);
                return item;
            }
        );
        return itemsByOrder;
    }

    private OrderResponse mapOrderWithoutItems(ResultSet rs, int rowNum) throws SQLException {
        return new OrderResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("checkout_id", UUID.class),
            rs.getObject("customer_identity_id", UUID.class),
            rs.getObject("kitchen_id", UUID.class),
            rs.getString("kitchen_name_snapshot"),
            OrderStatus.valueOf(rs.getString("status")),
            rs.getString("currency"),
            rs.getBigDecimal("food_subtotal"),
            rs.getBigDecimal("platform_fee"),
            rs.getBigDecimal("tax_amount"),
            rs.getBigDecimal("delivery_fee"),
            rs.getBigDecimal("grand_total"),
            rs.getString("chef_response_note"),
            integerOrNull(rs, "prep_time_minutes"),
            mapDropoffSnapshot(rs),
            mapPickupSnapshot(rs),
            List.of(),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private static OrderResponse attachItems(OrderResponse order, List<OrderItemResponse> items) {
        return new OrderResponse(
            order.id(),
            order.checkoutId(),
            order.customerIdentityId(),
            order.kitchenId(),
            order.kitchenName(),
            order.status(),
            order.currency(),
            order.foodSubtotal(),
            order.platformFee(),
            order.taxAmount(),
            order.deliveryFee(),
            order.grandTotal(),
            order.chefResponseNote(),
            order.prepTimeMinutes(),
            order.deliveryAddress(),
            order.pickupAddress(),
            List.copyOf(items),
            order.createdAt(),
            order.updatedAt()
        );
    }

    private static CustomerAddressSnapshotResponse mapDropoffSnapshot(ResultSet rs) throws SQLException {
        UUID sourceAddressId = rs.getObject("delivery_address_id", UUID.class);
        if (sourceAddressId == null) {
            return null;
        }
        return new CustomerAddressSnapshotResponse(
            sourceAddressId,
            rs.getString("dropoff_recipient_name"),
            rs.getString("dropoff_contact_phone"),
            rs.getString("dropoff_address_line1"),
            rs.getString("dropoff_address_line2"),
            rs.getString("dropoff_landmark"),
            rs.getString("dropoff_area_name"),
            rs.getString("dropoff_city"),
            rs.getString("dropoff_state"),
            rs.getString("dropoff_postal_code"),
            rs.getBigDecimal("dropoff_latitude"),
            rs.getBigDecimal("dropoff_longitude")
        );
    }

    private static KitchenPickupSnapshotResponse mapPickupSnapshot(ResultSet rs) throws SQLException {
        if (!StringUtils.hasText(rs.getString("pickup_address_line1"))) {
            return null;
        }
        return new KitchenPickupSnapshotResponse(
            rs.getObject("kitchen_id", UUID.class),
            rs.getString("kitchen_name_snapshot"),
            rs.getString("pickup_phone_number"),
            rs.getString("pickup_email"),
            rs.getString("pickup_address_line1"),
            rs.getString("pickup_address_line2"),
            rs.getString("pickup_landmark"),
            rs.getString("pickup_area_name"),
            rs.getString("pickup_city"),
            rs.getString("pickup_state"),
            rs.getString("pickup_postal_code"),
            rs.getBigDecimal("pickup_latitude"),
            rs.getBigDecimal("pickup_longitude")
        );
    }

    private static void validatePageSize(int limit) {
        if (limit <= 0 || limit > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 100");
        }
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
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cursor is invalid", ex);
        }
    }

    private static void requireCustomer(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CUSTOMER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer role is required");
        }
    }

    private static void requireChef(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CHEF")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chef role is required");
        }
    }

    private static Integer integerOrNull(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}
