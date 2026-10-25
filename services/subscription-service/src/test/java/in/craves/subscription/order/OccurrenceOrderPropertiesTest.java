package in.craves.subscription.order;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class OccurrenceOrderPropertiesTest {
    @Test
    void workersAreDisabledByDefault() {
        OccurrenceOrderProperties properties = new OccurrenceOrderProperties();
        properties.validate();

        assertThat(properties.isRequestWorkerEnabled()).isFalse();
        assertThat(properties.isPublisherEnabled()).isFalse();
    }
}
