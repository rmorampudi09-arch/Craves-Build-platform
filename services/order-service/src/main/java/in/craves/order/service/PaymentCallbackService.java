package in.craves.order.service;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentCallbackService {
    private final JdbcTemplate jdbcTemplate;

    public PaymentCallbackService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void markCheckoutPaid(UUID checkoutId, UUID actorId, String reason) {
        jdbcTemplate.update(
            "UPDATE order_schema.checkout SET status = ?, updated_at = now() WHERE id = ? AND status IN (?, ?)",
            "PAID", checkoutId, "PAYMENT_PENDING", "CREATED"
        );
        jdbcTemplate.query(
            "SELECT id, status FROM order_schema.customer_order WHERE checkout_id = ?",
            rs -> {
                UUID orderId = rs.getObject("id", UUID.class);
                String oldStatus = rs.getString("status");
                if ("PAYMENT_PENDING".equals(oldStatus) || "CREATED".equals(oldStatus) || "PAID".equals(oldStatus)) {
                    jdbcTemplate.update("UPDATE order_schema.customer_order SET status = ?, updated_at = now() WHERE id = ?", "CHEF_ACCEPTANCE_PENDING", orderId);
                    jdbcTemplate.update(
                        "INSERT INTO order_schema.order_status_history (id, order_id, old_status, new_status, actor_identity_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, now())",
                        UUID.randomUUID(), orderId, oldStatus, "CHEF_ACCEPTANCE_PENDING", actorId, reason
                    );
                }
            },
            checkoutId
        );
    }
}
