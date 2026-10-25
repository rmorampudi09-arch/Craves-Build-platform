package in.craves.order.service;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import in.craves.order.web.ApiDtos.OrderResponse;
import in.craves.order.web.ApiDtos.OrderStatus;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Meal-plan orders have no checkout; accepting or readying one must still record the customer message. */
class MealPlanOrderNotificationTest {
    @Test void acceptedAndReadyMessagesWorkWithoutACheckout() {
        NotificationOutboxRepository repository = mock(NotificationOutboxRepository.class);
        NotificationOutboxService service = new NotificationOutboxService(repository);
        OrderResponse order = new OrderResponse(UUID.randomUUID(), null, UUID.randomUUID(), UUID.randomUUID(), "Kitchen",
            OrderStatus.CHEF_ACCEPTED, "INR", BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
            null, 20, List.of(), Instant.now(), Instant.now());

        service.recordChefAccepted(order);
        service.recordReadyForPickup(order);

        ArgumentCaptor<NotificationOutboxEvent> events = ArgumentCaptor.forClass(NotificationOutboxEvent.class);
        verify(repository, org.mockito.Mockito.times(2)).savePending(events.capture());
        assertNull(events.getValue().payload().get("checkoutId"));
    }
}
