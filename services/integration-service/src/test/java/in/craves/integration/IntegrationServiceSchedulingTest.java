package in.craves.integration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.scheduling.annotation.EnableScheduling;

class IntegrationServiceSchedulingTest {

    @Test
    void scheduledWorkersAreExplicitlyEnabled() {
        assertThat(
            AnnotatedElementUtils.hasAnnotation(
                IntegrationServiceApplication.class,
                EnableScheduling.class
            )
        ).isTrue();
    }
}
