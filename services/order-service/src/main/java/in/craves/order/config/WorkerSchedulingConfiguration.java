package in.craves.order.config;

import org.springframework.boot.task.TaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * One scheduler pool per worker family (CH-01). Every {@code @Scheduled} job names its pool, so a slow
 * HTTP call or broker publish in one family can no longer freeze the jobs of another family.
 * This class deliberately does not enable scheduling: each worker keeps its existing on/off switch.
 */
@Configuration(proxyBeanMethods = false)
public class WorkerSchedulingConfiguration {
    public static final String MONITOR_SCHEDULER = "monitorScheduler";
    public static final String OUTBOX_SCHEDULER = "orderOutboxScheduler";
    public static final String CHEF_ACCEPTANCE_SCHEDULER = "chefAcceptanceScheduler";
    public static final String SUBSCRIPTION_CALLBACK_SCHEDULER = "subscriptionCallbackScheduler";

    // Declaring any scheduler makes Spring Boot back off its default one, so keep it for jobs added later.
    @Bean(name = "taskScheduler")
    @SuppressWarnings("removal") // same builder Spring Boot 3.3 uses, so spring.task.scheduling.* still applies
    ThreadPoolTaskScheduler taskScheduler(TaskSchedulerBuilder builder) {
        return builder.build();
    }

    // Domain events, notification outbox and finance source outbox: one thread each.
    @Bean(name = OUTBOX_SCHEDULER)
    ThreadPoolTaskScheduler orderOutboxScheduler() {
        return pool("order-outbox-", 3);
    }

    @Bean(name = CHEF_ACCEPTANCE_SCHEDULER)
    ThreadPoolTaskScheduler chefAcceptanceScheduler() {
        return pool("chef-acceptance-", 1);
    }

    @Bean(name = SUBSCRIPTION_CALLBACK_SCHEDULER)
    ThreadPoolTaskScheduler subscriptionCallbackScheduler() {
        return pool("subscription-callback-", 1);
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
