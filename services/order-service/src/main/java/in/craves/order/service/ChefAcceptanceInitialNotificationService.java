package in.craves.order.service;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.ChefAcceptRequest;
import in.craves.order.web.ApiDtos.OrderResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChefAcceptanceInitialNotificationService {
    private final JdbcTemplate jdbcTemplate;
    private final NotificationOutboxRepository notificationOutboxRepository;
    private final ChefAcceptanceService chefAcceptanceService;

    public ChefAcceptanceInitialNotificationService(
        JdbcTemplate jdbcTemplate,
        NotificationOutboxRepository notificationOutboxRepository,
        ChefAcceptanceService chefAcceptanceService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.notificationOutboxRepository = notificationOutboxRepository;
        this.chefAcceptanceService = chefAcceptanceService;
    }

    /** Records the chef's new-order notification; false when the order is no longer waiting or was already recorded. */
    @Transactional
    public boolean record(UUID orderId, UUID chefIdentityId) {
        InitialNotificationOrder order = lockPendingOrder(orderId, chefIdentityId);
        if (order == null) {
            return false;
        }
        saveNotification(order, chefIdentityId, false);
        return true;
    }

    /**
     * Accepts the order through the chef's accept service and records the notification in one transaction, so a
     * failed accept rolls everything back and the caller can fall back to {@link #record} with the order still
     * pending. Returns the accepted order, or null when the order is no longer waiting or was already recorded.
     */
    @Transactional
    public OrderResponse recordAutoAccepted(UUID orderId, UUID chefIdentityId, int prepMinutes) {
        InitialNotificationOrder order = lockPendingOrder(orderId, chefIdentityId);
        if (order == null) {
            return null;
        }
        OrderResponse accepted = chefAcceptanceService.accept(
            new CravesPrincipal(chefIdentityId, "", Set.of("CHEF")),
            orderId,
            new ChefAcceptRequest(prepMinutes, null),
            null,
            "auto-accept:" + orderId,
            "Accepted automatically"
        );
        saveNotification(order, chefIdentityId, true);
        return accepted;
    }

    private InitialNotificationOrder lockPendingOrder(UUID orderId, UUID chefIdentityId) {
        if (chefIdentityId == null) {
            return null;
        }
        InitialNotificationOrder order = lockOrder(orderId);
        if (!"CHEF_ACCEPTANCE_PENDING".equals(order.status())
            || order.recordedAt() != null
            || order.expiresAt() == null
            || !order.databaseNow().isBefore(order.expiresAt())) {
            return null;
        }
        return order;
    }

    private void saveNotification(InitialNotificationOrder order, UUID chefIdentityId, boolean auto) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderId", order.orderId().toString());
        payload.put("checkoutId", Objects.toString(order.checkoutId(), null));
        payload.put("kitchenId", order.kitchenId().toString());
        payload.put("kitchenName", order.kitchenName());
        payload.put("grandTotal", order.grandTotal());
        payload.put("currency", order.currency());
        payload.put("acceptanceExpiresAt", order.expiresAt().toString());

        notificationOutboxRepository.savePending(new NotificationOutboxEvent(
            "chef-new-order-" + order.orderId(),
            "CHEF_ORDER_AWAITING_ACCEPTANCE",
            "ORDER",
            order.orderId(),
            chefIdentityId,
            "CHEF",
            "IN_APP",
            "CHEF_ORDER_AWAITING_ACCEPTANCE_IN_APP",
            auto ? "New order accepted automatically" : "New order received",
            auto
                ? "A paid Craves order was accepted for you automatically."
                : "A paid Craves order is waiting for your confirmation.",
            "ORDER",
            order.orderId(),
            payload
        ));

        jdbcTemplate.update(
            "UPDATE order_schema.customer_order SET chef_acceptance_initial_recorded_at = now(), updated_at = now() WHERE id = ?",
            order.orderId()
        );
    }

    private InitialNotificationOrder lockOrder(UUID orderId) {
        return jdbcTemplate.query(
            """
                SELECT id, checkout_id, kitchen_id, kitchen_name_snapshot, status,
                       currency, grand_total, chef_acceptance_expires_at,
                       chef_acceptance_initial_recorded_at, now() AS database_now
                FROM order_schema.customer_order
                WHERE id = ?
                FOR UPDATE
                """,
            this::mapOrder,
            orderId
        ).stream().findFirst().orElseThrow(() -> new IllegalArgumentException(
            "Order was not found for initial chef notification"
        ));
    }

    private InitialNotificationOrder mapOrder(ResultSet resultSet, int rowNumber) throws SQLException {
        return new InitialNotificationOrder(
            resultSet.getObject("id", UUID.class),
            resultSet.getObject("checkout_id", UUID.class),
            resultSet.getObject("kitchen_id", UUID.class),
            resultSet.getString("kitchen_name_snapshot"),
            resultSet.getString("status"),
            resultSet.getString("currency"),
            resultSet.getBigDecimal("grand_total").toPlainString(),
            instant(resultSet, "chef_acceptance_expires_at"),
            instant(resultSet, "chef_acceptance_initial_recorded_at"),
            instant(resultSet, "database_now")
        );
    }

    private static Instant instant(ResultSet resultSet, String column) throws SQLException {
        Timestamp timestamp = resultSet.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private record InitialNotificationOrder(
        UUID orderId,
        UUID checkoutId,
        UUID kitchenId,
        String kitchenName,
        String status,
        String currency,
        String grandTotal,
        Instant expiresAt,
        Instant recordedAt,
        Instant databaseNow
    ) {
    }
}
