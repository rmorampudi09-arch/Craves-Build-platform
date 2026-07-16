package in.craves.integration;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.refund.RefundStatusPublisherSchedulingConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.scheduling.annotation.EnableScheduling;

class IntegrationServiceSchedulingTest {

    @Test
    void schedulingIsScopedToRefundStatusPublisherActivation() {
        assertThat(
            AnnotatedElementUtils.hasAnnotation(
                RefundStatusPublisherSchedulingConfiguration.class,
                EnableScheduling.class
            )
        ).isTrue();

        ConditionalOnProperty condition = AnnotatedElementUtils.findMergedAnnotation(
            RefundStatusPublisherSchedulingConfiguration.class,
            ConditionalOnProperty.class
        );

        assertThat(condition).isNotNull();
        assertThat(condition.prefix()).isEqualTo("craves.refund");
        assertThat(condition.name()).containsExactly("status-publisher-enabled");
        assertThat(condition.havingValue()).isEqualTo("true");

        assertThat(
            AnnotatedElementUtils.hasAnnotation(
                IntegrationServiceApplication.class,
                EnableScheduling.class
            )
        ).isFalse();
    }
}
