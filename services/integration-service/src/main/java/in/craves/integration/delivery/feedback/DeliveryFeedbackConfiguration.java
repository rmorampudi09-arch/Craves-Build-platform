package in.craves.integration.delivery.feedback;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
public class DeliveryFeedbackConfiguration {
    // Adding a named scheduler must not silently make it the default for all existing jobs.
    @Bean(name = "taskScheduler")
    @org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean(name = "taskScheduler")
    public ThreadPoolTaskScheduler taskScheduler(org.springframework.boot.task.TaskSchedulerBuilder builder) {
        return builder.build();
    }
    @Bean(name = "deliveryFeedbackScheduler")
    public ThreadPoolTaskScheduler deliveryFeedbackScheduler() {
        var scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("delivery-feedback-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(15);
        return scheduler;
    }
}
