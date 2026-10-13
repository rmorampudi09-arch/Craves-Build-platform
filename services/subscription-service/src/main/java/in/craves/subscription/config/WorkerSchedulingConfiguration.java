package in.craves.subscription.config;

import org.springframework.boot.task.TaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * One scheduler pool per worker family (CH-01). Every {@code @Scheduled} job names its pool, so
 * a slow billing publish cannot stall occurrence generation or order dispatch.
 * Each pool has one thread per job, and this class does not enable scheduling: workers keep their switches.
 */
@Configuration(proxyBeanMethods = false)
public class WorkerSchedulingConfiguration {
    public static final String MONITOR_SCHEDULER = "monitorScheduler";
    public static final String OCCURRENCE_SCHEDULER = "occurrenceScheduler";
    public static final String ORDER_DISPATCH_SCHEDULER = "occurrenceOrderScheduler";
    public static final String BILLING_SCHEDULER = "billingScheduler";
    public static final String CAPACITY_SCHEDULER = "capacityScheduler";

    // Declaring any scheduler makes Spring Boot back off its default one, so keep it for jobs added later.
    @Bean(name = "taskScheduler")
    @SuppressWarnings("removal") // same builder Spring Boot 3.3 uses, so spring.task.scheduling.* still applies
    ThreadPoolTaskScheduler taskScheduler(TaskSchedulerBuilder builder) {
        return builder.build();
    }

    @Bean(name = OCCURRENCE_SCHEDULER)
    ThreadPoolTaskScheduler occurrenceScheduler() {
        return pool("occurrence-", 1);
    }

    // Order request worker and order request publisher.
    @Bean(name = ORDER_DISPATCH_SCHEDULER)
    ThreadPoolTaskScheduler occurrenceOrderScheduler() {
        return pool("occurrence-order-", 2);
    }

    // Invoice generator and billing outbox publisher.
    @Bean(name = BILLING_SCHEDULER)
    ThreadPoolTaskScheduler billingScheduler() {
        return pool("billing-", 2);
    }

    @Bean(name = CAPACITY_SCHEDULER)
    ThreadPoolTaskScheduler capacityScheduler() {
        return pool("capacity-", 1);
    }

    // CH-04: the watchdog and alert monitors get a plain pool of their own, so a stalled worker cannot silence them.
    @Bean(name = MONITOR_SCHEDULER)
    ThreadPoolTaskScheduler monitorScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("monitor-");
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }

    static ThreadPoolTaskScheduler pool(String threadNamePrefix, int size) {
        ThreadPoolTaskScheduler scheduler = new SchedulerLagWatchdog.MonitoredTaskScheduler();
        scheduler.setPoolSize(size);
        scheduler.setThreadNamePrefix(threadNamePrefix);
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }
}
