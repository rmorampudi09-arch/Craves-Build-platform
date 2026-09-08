package in.craves.order.service;

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

    public ChefReadyForPickupService(
        JdbcTemplate jdbcTemplate,
        OrderService orderService,
        OrderReadyForPickupEventFactory eventFactory,
        OrderDomainOutboxRepository outboxRepository
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.orderService = orderService;
        this.eventFactory = eventFactory;
        this.outboxRepository = outboxRepository;
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
                RETURNING checkout_id, ready_at
                """,
            (resultSet, rowNumber) -> new ReadyState(
                resultSet.getObject("checkout_id", UUID.class),
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
