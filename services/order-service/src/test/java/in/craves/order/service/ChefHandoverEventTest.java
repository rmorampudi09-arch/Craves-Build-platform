package in.craves.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.order.config.DomainEventOutboxProperties;
import in.craves.order.event.OrderHandedOverEventFactory;
import in.craves.order.event.OrderReadyForPickupEventFactory;
import in.craves.order.event.SerializedDomainEvent;
import in.craves.order.outbox.OrderDomainOutboxRepository;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.OrderResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

/** WORKPLAN P2-05: the chef's hand-over tells the rider fleet only while ORDER_HANDED_OVER is on the publication allow-list. */
class ChefHandoverEventTest {
    static final Instant HANDED = Instant.parse("2026-10-27T10:00:00Z");
    final JsonMapper json = JsonMapper.builder().findAndAddModules().build();
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final OrderService orders = mock(OrderService.class);
    final OrderDomainOutboxRepository outbox = mock(OrderDomainOutboxRepository.class);
    final DomainEventOutboxProperties properties = new DomainEventOutboxProperties();
    final ChefReadyForPickupService service = new ChefReadyForPickupService(jdbc, orders, new OrderReadyForPickupEventFactory(json), outbox,
        new OrderHandedOverEventFactory(json), properties);
    final CravesPrincipal chef = new CravesPrincipal(UUID.randomUUID(), "+919800000001", Set.of("CHEF"));
    final UUID orderId = UUID.randomUUID();
    final UUID checkoutId = UUID.randomUUID();

    OrderResponse handedOver() {
        return new OrderResponse(orderId, checkoutId, UUID.randomUUID(), UUID.randomUUID(), "Kitchen", OrderStatus.READY_FOR_PICKUP, "INR",
            new BigDecimal("250.00"), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("250.00"), null, null, null, null,
            List.of(), HANDED, HANDED).withChefDetails(null, null, null, HANDED);
    }

    @Test
    void writesNothingWhileTheEventIsNotPublished() {
        when(orders.markHandedOver(chef, orderId)).thenReturn(handedOver());
        properties.setEnabledEventTypes(Set.of("CHEF_ACCEPTED_ORDER", "ORDER_READY_FOR_PICKUP"));

        assertThat(service.markHandedOver(chef, orderId).chefHandedOverAt()).isEqualTo(HANDED);
        verify(outbox, never()).insert(any(), any());
    }

    @Test
    void writesOneEventForTheFleetOnceItIsPublished() throws Exception {
        when(orders.markHandedOver(chef, orderId)).thenReturn(handedOver());
        when(jdbc.queryForObject(anyString(), eq(UUID.class), eq(orderId))).thenReturn(checkoutId);
        properties.setEnabledEventTypes(Set.of("CHEF_ACCEPTED_ORDER", "order_handed_over"));

        service.markHandedOver(chef, orderId);

        ArgumentCaptor<SerializedDomainEvent> event = ArgumentCaptor.forClass(SerializedDomainEvent.class);
        verify(outbox).insert(eq(orderId), event.capture());
        assertThat(event.getValue().eventKey()).isEqualTo("ORDER_HANDED_OVER:" + orderId);
        JsonNode data = json.readTree(event.getValue().payloadJson()).path("data");
        assertThat(data.path("orderId").asText()).isEqualTo(checkoutId.toString());
        assertThat(data.path("chefSubOrderId").asText()).isEqualTo(orderId.toString());
        assertThat(data.path("handedOverAt").asText()).isEqualTo("2026-10-27T10:00:00Z");
        assertThat(event.getValue().payloadJson()).doesNotContain("contactPhone", "address", "recipientName");
    }
}
