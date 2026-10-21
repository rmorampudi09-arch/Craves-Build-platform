package in.craves.integration.delivery.feedback;

import in.craves.integration.config.SchedulerLagWatchdog;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration(proxyBeanMethods = false)
public class DeliveryFeedbackConfiguration {
    // The default taskScheduler lives in WorkerSchedulingConfiguration with the other worker pools.
    @Bean(name = "deliveryFeedbackScheduler")
    public ThreadPoolTaskScheduler deliveryFeedbackScheduler() {
        var scheduler = new SchedulerLagWatchdog.MonitoredTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setThreadNamePrefix("delivery-feedback-");
        scheduler.setWaitForTasksToCompleteOnShutdown(true);
        scheduler.setAwaitTerminationSeconds(15);
        return scheduler;
    }
}
