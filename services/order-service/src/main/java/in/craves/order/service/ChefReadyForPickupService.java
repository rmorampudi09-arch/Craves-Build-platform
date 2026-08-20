package in.craves.order.service;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.OrderResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ChefReadyForPickupService {
    private final JdbcTemplate jdbcTemplate;
    private final OrderService orderService;
    private final TransactionTemplate transactionTemplate;

    public ChefReadyForPickupService(
        JdbcTemplate jdbcTemplate,
        OrderService orderService,
        PlatformTransactionManager transactionManager
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.orderService = orderService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public OrderResponse markReady(CravesPrincipal principal, UUID orderId) {
        requireChef(principal);
        if (orderId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Order id is required");
        }

        transactionTemplate.executeWithoutResult(status -> transitionUnderLock(principal, orderId));

        // The authoritative response is fetched only after the row-lock transaction has
        // committed, so no cross-service Catalog call is held open inside the DB lock.
        return orderService.getOrderForChef(principal, orderId);
    }

    private void transitionUnderLock(CravesPrincipal principal, UUID orderId) {
        List<LockedOrder> rows = jdbcTemplate.query(
            "SELECT chef_identity_id, status FROM order_schema.customer_order WHERE id = ? FOR UPDATE",
            (rs, rowNum) -> new LockedOrder(
                rs.getObject("chef_identity_id", UUID.class),
                OrderStatus.valueOf(rs.getString("status"))
            ),
            orderId
        );
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order was not found");
        }

        LockedOrder locked = rows.getFirst();
        if (locked.chefIdentityId() == null || !locked.chefIdentityId().equals(principal.identityId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chef cannot access this order");
        }

        if (locked.status() == OrderStatus.READY_FOR_PICKUP) {
            return;
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
    }

    private static void requireChef(CravesPrincipal principal) {
        if (principal == null || !principal.hasRole("CHEF")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chef role is required");
        }
    }

    private record LockedOrder(UUID chefIdentityId, OrderStatus status) {
    }
}
