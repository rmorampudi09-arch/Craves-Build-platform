package in.craves.order.service;

import in.craves.order.service.CatalogClient.CatalogKitchen;
import in.craves.order.web.ApiDtos.OrderResponse;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

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
    private final NotificationOutboxService outboxService;
    private final ChefOrderNotificationClient chefOrderNotificationClient;

    public ChefAutoAcceptService(
        JdbcTemplate jdbcTemplate,
        CatalogClient catalogClient,
        ChefAcceptanceInitialNotificationService notifications,
        NotificationOutboxService outboxService,
        ChefOrderNotificationClient chefOrderNotificationClient
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.catalogClient = catalogClient;
        this.notifications = notifications;
        this.outboxService = outboxService;
        this.chefOrderNotificationClient = chefOrderNotificationClient;
    }

    /** True when the chef's notification was recorded (and, if the kitchen auto-accepts, the order accepted). */
    public boolean recordNewOrder(UUID orderId, CatalogKitchen kitchen) {
        UUID chefIdentityId = kitchen.identityId();
        Integer prepMinutes = Boolean.TRUE.equals(kitchen.autoAcceptOrders()) ? prepMinutes(orderId, kitchen) : null;
        if (prepMinutes == null) {
            return notifications.record(orderId, chefIdentityId);
        }
        OrderResponse accepted;
        try {
            accepted = notifications.recordAutoAccepted(orderId, chefIdentityId, prepMinutes);
        } catch (RuntimeException failure) {
            // Rolled back as a whole: the order is still pending, so tell the chef the normal way.
            LOGGER.warn("Auto-accept failed for orderId={}; leaving it for the chef: {}", orderId, failure.toString());
            return notifications.record(orderId, chefIdentityId);
        }
        if (accepted == null) {
            return false;
        }
        tellCustomer(accepted);
        return true;
    }

    /**
     * The order's slowest dish, else the kitchen's default, else 15. A dish the catalog cannot answer for (inactive,
     * or the catalog failing) is skipped. Null (leave the order for the chef) for a meal-plan or SCHEDULED order.
     */
    private Integer prepMinutes(UUID orderId, CatalogKitchen kitchen) {
        // shortcut: meal-plan and SCHEDULED orders stay manual; accept books the courier from now + prep and ignores
        // the meal/requested time, so accepting at creation would dispatch hours early. Lift once dispatch honours it.
        Map<String, Object> order = jdbcTemplate.queryForMap(
            "SELECT order_source, fulfilment_mode FROM order_schema.customer_order WHERE id = ?", orderId);
        if ("SUBSCRIPTION".equals(order.get("order_source")) || "SCHEDULED".equals(order.get("fulfilment_mode"))) {
            return null;
        }
        int slowestDish = 0;
        for (UUID menuItemId : jdbcTemplate.queryForList(
            "SELECT DISTINCT menu_item_id FROM order_schema.order_item WHERE order_id = ?", UUID.class, orderId)) {
            try {
                Integer minutes = catalogClient.getActiveMenuItem(menuItemId).preparationTimeMinutes();
                slowestDish = Math.max(slowestDish, minutes == null ? 0 : minutes);
            } catch (RuntimeException unanswered) {
                // The other dishes, then the kitchen default, decide; the chef's order is not held up by a lookup.
                LOGGER.warn("Dish prep time unavailable for orderId={} menuItemId={}: {}", orderId, menuItemId, unanswered.toString());
            }
        }
        Integer kitchenDefault = kitchen.defaultPrepMinutes();
        if (slowestDish > 0) {
            return slowestDish;
        }
        return kitchenDefault != null && kitchenDefault > 0 ? kitchenDefault : FALLBACK_PREP_MINUTES;
    }

    /** What the controller advices add after a manual accept; both are keyed on the order, so repeats are no-ops. */
    private void tellCustomer(OrderResponse accepted) {
        try {
            outboxService.recordChefAccepted(accepted);
            chefOrderNotificationClient.chefAcceptedOrder(accepted);
        } catch (RuntimeException failure) {
            LOGGER.warn("Customer notification after auto-accept failed for orderId={}: {}", accepted.id(), failure.toString());
        }
    }
}
