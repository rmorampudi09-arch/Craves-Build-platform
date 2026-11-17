package in.craves.order.outbox;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.order.config.DomainEventOutboxProperties;
import in.craves.order.event.OrderCancelledEventFactory;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** The merge-safe default: off the publication allow-list a cancel reads nothing and writes nothing. */
class OrderCancelledEventWriterTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final OrderDomainOutboxRepository outbox = mock(OrderDomainOutboxRepository.class);
    final DomainEventOutboxProperties properties = new DomainEventOutboxProperties();
    final OrderCancelledEventWriter writer = new OrderCancelledEventWriter(jdbc,
        new OrderCancelledEventFactory(JsonMapper.builder().findAndAddModules().build()), outbox, properties);

    @Test
    void writesNothingWithTheDefaultAllowList() {
        writer.write(UUID.randomUUID(), "CHEF_DECLINED");

        verifyNoInteractions(jdbc, outbox);
    }

    @Test
    void writesNothingWhileOtherEventsArePublishedButNotThisOne() {
        properties.setEnabledEventTypes(Set.of("CHEF_ACCEPTED_ORDER", "ORDER_READY_FOR_PICKUP", "REFUND_REQUESTED"));

        writer.write(UUID.randomUUID(), "CHEF_DECLINED");

        verifyNoInteractions(jdbc, outbox);
    }
}
