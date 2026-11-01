package in.craves.order.outbox;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.order.config.DomainEventOutboxProperties;
import in.craves.order.config.ServiceBusDomainEventProperties;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

// CH-02: blocked event types must never sit in the outbox silently, and housekeeping must never stop publication.
class OrderDomainOutboxHousekeepingTest {
    private static final List<String> ENABLED = List.of("CHEF_ACCEPTED_ORDER");

    private final OrderDomainOutboxRepository repository = mock(OrderDomainOutboxRepository.class);
    private final DomainEventOutboxProperties properties = new DomainEventOutboxProperties();
    @SuppressWarnings("unchecked")
    private final ObjectProvider<DomainEventTransport> transport = mock(ObjectProvider.class);
    private final OrderDomainOutboxPublisherWorker worker =
        new OrderDomainOutboxPublisherWorker(repository, transport, properties, new ServiceBusDomainEventProperties());

    @Test
    void blockedEventTypesAreReportedButKeptByDefault() {
        when(repository.blockedEventTypeBacklog(ENABLED, 300)).thenReturn(Map.of("REFUND_REQUESTED", 2));

        worker.reapAndReport(10, 300, ENABLED);

        verify(repository).deadLetterExhausted(10, 300);
        verify(repository).blockedEventTypeBacklog(ENABLED, 300);
        verify(repository, never()).deadLetterBlockedEventTypes(anyList(), anyInt());
    }

    @Test
    void blockedEventTypesGoDeadOnlyWhenThatPolicyIsChosen() {
        properties.setDeadLetterBlockedTypes(true);

        worker.reapAndReport(10, 300, ENABLED);

        verify(repository).deadLetterBlockedEventTypes(ENABLED, 300);
        verify(repository, never()).blockedEventTypeBacklog(anyList(), anyInt());
    }

    @Test
    void housekeepingFailureNeverStopsPublication() {
        when(repository.deadLetterExhausted(anyInt(), anyInt())).thenThrow(new IllegalStateException("database unavailable"));

        assertDoesNotThrow(() -> worker.reapAndReport(10, 300, ENABLED));
    }
}
