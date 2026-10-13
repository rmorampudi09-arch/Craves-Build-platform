package in.craves.notification.config;

import org.springframework.boot.task.TaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * One scheduler pool per worker family (CH-01). Every {@code @Scheduled} job names its pool, so
 * a slow push or email provider call cannot stall the preference sweeper.
 * Each pool has one thread per job, and this class does not enable scheduling: workers keep their switches.
 */
@Configuration(proxyBeanMethods = false)
public class WorkerSchedulingConfiguration {
    public static final String DELIVERY_SCHEDULER = "notificationDeliveryScheduler";

    // Declaring any scheduler makes Spring Boot back off its default one, so keep it for jobs added later.
    @Bean(name = "taskScheduler")
    @SuppressWarnings("removal") // same builder Spring Boot 3.3 uses, so spring.task.scheduling.* still applies
    ThreadPoolTaskScheduler taskScheduler(TaskSchedulerBuilder builder) {
        return builder.build();
    }

    // Push/email delivery and the opted-out preference sweeper.
    @Bean(name = DELIVERY_SCHEDULER)
    ThreadPoolTaskScheduler notificationDeliveryScheduler() {
        return pool("notification-delivery-", 2);
    }

    static ThreadPoolTaskScheduler pool(String threadNamePrefix, int size) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(size);
        scheduler.setThreadNamePrefix(threadNamePrefix);
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }
}
