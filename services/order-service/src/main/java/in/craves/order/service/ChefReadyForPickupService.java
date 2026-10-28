package in.craves.order.service;

import in.craves.order.config.DomainEventOutboxProperties;
import in.craves.order.event.OrderHandedOverEventData;
import in.craves.order.event.OrderHandedOverEventFactory;
import in.craves.order.event.OrderReadyForPickupEventData;
import in.craves.order.event.OrderReadyForPickupEventFactory;
import in.craves.order.event.SerializedDomainEvent;
import in.craves.order.outbox.OrderDomainOutboxRepository;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.OrderResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ChefReadyForPickupService {
    private final JdbcTemplate jdbcTemplate;
    private final OrderService orderService;
    private final OrderReadyForPickupEventFactory eventFactory;
    private final OrderDomainOutboxRepository outboxRepository;
    private final OrderHandedOverEventFactory handedOverEvents;
    private final DomainEventOutboxProperties outboxProperties;

    public ChefReadyForPickupService(
        JdbcTemplate jdbcTemplate,
        OrderService orderService,
        OrderReadyForPickupEventFactory eventFactory,
        OrderDomainOutboxRepository outboxRepository,
        OrderHandedOverEventFactory handedOverEvents,
        DomainEventOutboxProperties outboxProperties
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.orderService = orderService;
        this.eventFactory = eventFactory;
        this.outboxRepository = outboxRepository;
        this.handedOverEvents = handedOverEvents;
        this.outboxProperties = outboxProperties;
    }

    @Transactional
    public OrderResponse markReady(
        CravesPrincipal principal,
        UUID chefSubOrderId,
        UUID correlationId,
        String idempotencyKey
    ) {
        orderService.getOrderForChef(principal, chefSubOrderId);

        LockedReadyState locked = lockReadyState(chefSubOrderId);
        if (locked.status() == OrderStatus.READY_FOR_PICKUP) {
            return orderService.getOrderForChef(principal, chefSubOrderId);
        }
        if (locked.status() != OrderStatus.CHEF_ACCEPTED
            && locked.status() != OrderStatus.PREPARING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Order cannot be marked ready yet");
        }

        orderService.markReadyForPickup(principal, chefSubOrderId);

        ReadyState readyState = jdbcTemplate.query(
            """
                UPDATE order_schema.customer_order
                SET ready_at = now(), updated_at = now()
                WHERE id = ? AND status = 'READY_FOR_PICKUP'
                RETURNING COALESCE(checkout_id, id) AS delivery_checkout_id, ready_at
                """,
            // A meal-plan order has no checkout; it stands in for its own checkout in delivery messages.
            (resultSet, rowNumber) -> new ReadyState(
                resultSet.getObject("delivery_checkout_id", UUID.class),
                resultSet.getTimestamp("ready_at").toInstant()
            ),
            chefSubOrderId
        ).stream().findFirst().orElseThrow(() -> new IllegalStateException(
            "Ready-for-pickup timestamp could not be persisted"
        ));

        SerializedDomainEvent event = eventFactory.create(
            new OrderReadyForPickupEventData(
                readyState.orderId(),
                chefSubOrderId,
                readyState.readyAt()
            ),
            correlationId,
            idempotencyKey
        );

        if (!outboxRepository.insert(chefSubOrderId, event)) {
            throw new IllegalStateException(
                "ORDER_READY_FOR_PICKUP event could not be persisted uniquely"
            );
        }

        return orderService.getOrderForChef(principal, chefSubOrderId);
    }

    /**
     * The chef handed the food over (OrderService.markHandedOver) and, while ORDER_HANDED_OVER is on the publication allow-list
     * (CRAVES_DOMAIN_EVENT_ENABLED_TYPES), the event that tells the rider fleet, whose watchdog then keeps the trip with its
     * rider (WORKPLAN P2-05). Off the list nothing is written, so no unpublished rows pile up. A repeat writes nothing new:
     * the outbox's event key is the type and the order.
     */
    @Transactional
    public OrderResponse markHandedOver(CravesPrincipal principal, UUID orderId) {
        OrderResponse order = orderService.markHandedOver(principal, orderId);
        if (order.chefHandedOverAt() != null
            && outboxProperties.normalizedEnabledEventTypes().contains(OrderHandedOverEventFactory.EVENT_TYPE)) {
            // A meal-plan order has no checkout; it stands in for its own checkout in delivery messages (as markReady).
            UUID checkoutId = jdbcTemplate.queryForObject(
                "SELECT COALESCE(checkout_id, id) FROM order_schema.customer_order WHERE id = ?", UUID.class, orderId);
            outboxRepository.insert(orderId, handedOverEvents.create(
                new OrderHandedOverEventData(checkoutId, orderId, order.chefHandedOverAt())));
        }
        return order;
    }

    private LockedReadyState lockReadyState(UUID chefSubOrderId) {
        return jdbcTemplate.query(
            """
                SELECT status
                FROM order_schema.customer_order
                WHERE id = ?
                FOR UPDATE
                """,
            (resultSet, rowNumber) -> new LockedReadyState(
                OrderStatus.valueOf(resultSet.getString("status"))
            ),
            chefSubOrderId
        ).stream().findFirst().orElseThrow(() -> new ResponseStatusException(
            HttpStatus.NOT_FOUND,
            "Order was not found"
        ));
    }

    private record LockedReadyState(OrderStatus status) {}

    private record ReadyState(UUID orderId, Instant readyAt) {}
}
