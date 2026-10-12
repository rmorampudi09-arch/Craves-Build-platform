package in.craves.order.service;

import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.CatalogClient.CatalogKitchen;
import in.craves.order.web.ApiDtos.OrderResponse;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Sends the chef's new-order notification, accepting the order first when the kitchen has auto-accept on. Runs from the
 * chef-acceptance worker, after the order was committed as pending, so a failure here never touches checkout or payment.
 */
@Service
public class ChefAutoAcceptService {
    private static final Logger LOGGER = LoggerFactory.getLogger(ChefAutoAcceptService.class);
    static final int FALLBACK_PREP_MINUTES = 15;

    private final JdbcTemplate jdbcTemplate;
    private final CatalogClient catalogClient;
    private final ChefAcceptanceInitialNotificationService notifications;
    private final OrderService orderService;
    private final NotificationOutboxService outboxService;
    private final ChefOrderNotificationClient chefOrderNotificationClient;

    public ChefAutoAcceptService(
        JdbcTemplate jdbcTemplate,
        CatalogClient catalogClient,
        ChefAcceptanceInitialNotificationService notifications,
        OrderService orderService,
        NotificationOutboxService outboxService,
        ChefOrderNotificationClient chefOrderNotificationClient
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.catalogClient = catalogClient;
        this.notifications = notifications;
        this.orderService = orderService;
        this.outboxService = outboxService;
        this.chefOrderNotificationClient = chefOrderNotificationClient;
    }

    /** True when the chef's notification was recorded (and, if the kitchen auto-accepts, the order accepted). */
    public boolean recordNewOrder(UUID orderId, CatalogKitchen kitchen) {
        UUID chefIdentityId = kitchen.identityId();
        Integer prepMinutes = Boolean.TRUE.equals(kitchen.autoAcceptOrders()) ? prepMinutes(orderId, kitchen) : null;
        if (prepMinutes == null) {
            return notifications.record(orderId, chefIdentityId, null);
        }
        boolean accepted;
        try {
            accepted = notifications.record(orderId, chefIdentityId, prepMinutes);
        } catch (RuntimeException failure) {
            // Rolled back as a whole: the order is still pending, so tell the chef the normal way.
            LOGGER.warn("Auto-accept failed for orderId={}; leaving it for the chef: {}", orderId, failure.toString());
            return notifications.record(orderId, chefIdentityId, null);
        }
        if (accepted) {
            tellCustomer(orderId, chefIdentityId);
        }
        return accepted;
    }

    /**
     * The order's own prep time, else its slowest dish, else the kitchen's default, else 15.
     * Null (leave the order for the chef) for a meal-plan order or when the catalog is unreachable.
     */
    private Integer prepMinutes(UUID orderId, CatalogKitchen kitchen) {
        try {
            Map<String, Object> order = jdbcTemplate.queryForMap(
                "SELECT prep_time_minutes, order_source FROM order_schema.customer_order WHERE id = ?", orderId);
            // shortcut: meal-plan orders stay manual; accept books the courier from now + prep and ignores the meal
            // time, so accepting at creation would dispatch hours early. Lift once dispatch honours scheduled_service_at.
            if ("SUBSCRIPTION".equals(order.get("order_source"))) {
                return null;
            }
            Integer own = (Integer) order.get("prep_time_minutes");
            if (own != null && own > 0) {
                return own;
            }
            int slowestDish = 0;
            for (UUID menuItemId : jdbcTemplate.queryForList(
                "SELECT DISTINCT menu_item_id FROM order_schema.order_item WHERE order_id = ?", UUID.class, orderId)) {
                try {
                    Integer minutes = catalogClient.getActiveMenuItem(menuItemId).preparationTimeMinutes();
                    slowestDish = Math.max(slowestDish, minutes == null ? 0 : minutes);
                } catch (ResponseStatusException noLongerOnTheMenu) {
                    // Says nothing about prep time; the other dishes decide.
                }
            }
            Integer kitchenDefault = kitchen.defaultPrepMinutes();
            if (slowestDish > 0) {
                return slowestDish;
            }
            return kitchenDefault != null && kitchenDefault > 0 ? kitchenDefault : FALLBACK_PREP_MINUTES;
        } catch (RuntimeException failure) {
            LOGGER.warn("Auto-accept prep time unavailable for orderId={}; leaving it for the chef: {}", orderId, failure.toString());
            return null;
        }
    }

    /** What the controller advices add after a manual accept; both are keyed on the order, so repeats are no-ops. */
    private void tellCustomer(UUID orderId, UUID chefIdentityId) {
        try {
            OrderResponse accepted = orderService.getOrderForChef(new CravesPrincipal(chefIdentityId, "", Set.of("CHEF")), orderId);
            outboxService.recordChefAccepted(accepted);
            chefOrderNotificationClient.chefAcceptedOrder(accepted);
        } catch (RuntimeException failure) {
            LOGGER.warn("Customer notification after auto-accept failed for orderId={}: {}", orderId, failure.toString());
        }
    }
}
