package in.craves.order.service;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CatalogClient.CatalogKitchen;
import in.craves.order.web.ApiDtos.OrderResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ChefReadyForPickupService {
    private final JdbcTemplate jdbcTemplate;
    private final CatalogClient catalogClient;
    private final OrderService orderService;

    public ChefReadyForPickupService(
        JdbcTemplate jdbcTemplate,
        CatalogClient catalogClient,
        OrderService orderService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.catalogClient = catalogClient;
        this.orderService = orderService;
    }

    @Transactional
    public OrderResponse markReady(CravesPrincipal principal, UUID orderId) {
        requireChef(principal);
        if (orderId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order id is required");
        }

        List<LockedOrder> rows = jdbcTemplate.query(
            "SELECT kitchen_id, status FROM order_schema.customer_order WHERE id = ? FOR UPDATE",
            (rs, rowNum) -> new LockedOrder(
                rs.getObject("kitchen_id", UUID.class),
                OrderStatus.valueOf(rs.getString("status"))
            ),
            orderId
        );
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order was not found");
        }

        LockedOrder locked = rows.getFirst();
        CatalogKitchen kitchen = catalogClient.getKitchen(locked.kitchenId());
        if (kitchen.identityId() == null || !kitchen.identityId().equals(principal.identityId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chef cannot access this order");
        }

        if (locked.status() == OrderStatus.READY_FOR_PICKUP) {
            return orderService.getOrderForChef(principal, orderId);
        }
        if (locked.status() != OrderStatus.CHEF_ACCEPTED && locked.status() != OrderStatus.PREPARING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order cannot be marked ready yet");
        }

        jdbcTemplate.update(
            "UPDATE order_schema.customer_order SET status = ?, chef_response_note = ?, updated_at = now() WHERE id = ?",
            OrderStatus.READY_FOR_PICKUP.name(),
            "Chef marked food ready",
            orderId
        );
        jdbcTemplate.update(
            "INSERT INTO order_schema.order_status_history (id, order_id, old_status, new_status, actor_identity_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, now())",
            UUID.randomUUID(),
            orderId,
            locked.status().name(),
            OrderStatus.READY_FOR_PICKUP.name(),
            principal.identityId(),
            "Chef marked food ready"
        );

        return orderService.getOrderForChef(principal, orderId);
    }

    private static void requireChef(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CHEF")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chef role is required");
        }
    }

    private record LockedOrder(UUID kitchenId, OrderStatus status) {
    }
}
