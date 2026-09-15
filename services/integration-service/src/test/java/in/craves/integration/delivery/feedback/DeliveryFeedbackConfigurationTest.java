package in.craves.integration.delivery.feedback;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.task.TaskSchedulingAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

class DeliveryFeedbackConfigurationTest {
    @Test void feedbackSchedulerDoesNotReplaceExistingDefaultScheduler() {
        new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(TaskSchedulingAutoConfiguration.class))
            .withUserConfiguration(DeliveryFeedbackConfiguration.class)
            .withPropertyValues("spring.task.scheduling.pool.size=4")
            .run(context->{
                assertThat(context).hasNotFailed();
                var regular=context.getBean("taskScheduler",ThreadPoolTaskScheduler.class);
                var feedback=context.getBean("deliveryFeedbackScheduler",ThreadPoolTaskScheduler.class);
                assertThat(regular).isNotSameAs(feedback);
                assertThat(regular.getScheduledThreadPoolExecutor().getCorePoolSize()).isEqualTo(4);
                assertThat(feedback.getScheduledThreadPoolExecutor().getCorePoolSize()).isEqualTo(1);
            });
    }
}
