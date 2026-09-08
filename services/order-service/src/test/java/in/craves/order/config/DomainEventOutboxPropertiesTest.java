package in.craves.order.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class DomainEventOutboxPropertiesTest {
    @Test
    void publishesOnlyChefAcceptedEventsByDefault() {
        DomainEventOutboxProperties properties = new DomainEventOutboxProperties();

        assertThat(properties.normalizedEnabledEventTypes())
            .containsExactly("CHEF_ACCEPTED_ORDER");
    }

    @Test
    void readyForPickupEventCanBeExplicitlyEnabled() {
        DomainEventOutboxProperties properties = new DomainEventOutboxProperties();
        properties.setEnabledEventTypes(new LinkedHashSet<>(Set.of(
            "CHEF_ACCEPTED_ORDER",
            "ORDER_READY_FOR_PICKUP"
        )));

        assertThat(properties.normalizedEnabledEventTypes())
            .containsExactlyInAnyOrder("CHEF_ACCEPTED_ORDER", "ORDER_READY_FOR_PICKUP");
    }

    @Test
    void normalizesConfiguredEventTypes() {
        DomainEventOutboxProperties properties = new DomainEventOutboxProperties();
        properties.setEnabledEventTypes(new LinkedHashSet<>(Set.of(
            " chef_accepted_order ",
            "refund_requested",
            " "
        )));

        assertThat(properties.normalizedEnabledEventTypes())
            .containsExactlyInAnyOrder("CHEF_ACCEPTED_ORDER", "REFUND_REQUESTED");
    }
}
