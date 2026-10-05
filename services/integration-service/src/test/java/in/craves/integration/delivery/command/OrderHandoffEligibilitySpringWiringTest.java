package in.craves.integration.delivery.command;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.config.OrderClientProperties;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.web.client.RestClient;

class OrderHandoffEligibilitySpringWiringTest {

    @Test
    void springSelectsTheProductionConstructorWhenTheTestConstructorAlsoExists() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(OrderClientProperties.class, () -> new OrderClientProperties(
                "https://order.example", "https://order.internal/internal/v1", "test-internal-key"));
            context.registerBean(RestClient.Builder.class, () -> RestClient.builder());
            context.registerBean(OrderHandoffEligibilityClient.class);

            context.refresh();

            assertThat(context.getBean(OrderHandoffEligibilityClient.class)).isNotNull();
        }
    }
}
