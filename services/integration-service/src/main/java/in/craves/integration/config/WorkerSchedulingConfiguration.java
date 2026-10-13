package in.craves.integration.config;

import org.springframework.boot.task.TaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * One scheduler pool per worker family (CH-01). Every {@code @Scheduled} job names its pool, so a slow
 * carrier tracking batch can no longer stall webhooks, outboxes, refunds and payouts (Cascade E).
 * Each pool has one thread per job, and this class does not enable scheduling: workers keep their switches.
 */
@Configuration(proxyBeanMethods = false)
public class WorkerSchedulingConfiguration {
    public static final String REFUND_SCHEDULER = "refundScheduler";
    public static final String DELIVERY_SCHEDULER = "deliveryScheduler";
    public static final String DELIVERY_TRACKING_SCHEDULER = "deliveryTrackingScheduler";
    public static final String DELIVERY_MAINTENANCE_SCHEDULER = "deliveryMaintenanceScheduler";
    public static final String PAYMENT_SCHEDULER = "paymentScheduler";
    public static final String PAYOUT_SCHEDULER = "payoutScheduler";
    public static final String FINANCE_SCHEDULER = "financeScheduler";

    // Declaring any scheduler makes Spring Boot back off its default one, so keep it for jobs added later.
    @Bean(name = "taskScheduler")
    @SuppressWarnings("removal") // same builder Spring Boot 3.3 uses, so spring.task.scheduling.* still applies
    ThreadPoolTaskScheduler taskScheduler(TaskSchedulerBuilder builder) {
        return builder.build();
    }

    // Refund execution and refund status outbox.
    @Bean(name = REFUND_SCHEDULER)
    ThreadPoolTaskScheduler refundScheduler() {
        return pool("refund-", 2);
    }

    // Delivery outbox, Borzo-to-Pidge handoff, create reconciliation and webhook processing.
    @Bean(name = DELIVERY_SCHEDULER)
    ThreadPoolTaskScheduler deliveryScheduler() {
        return pool("delivery-", 4);
    }

    // Carrier tracking polls are the slowest calls, so they get a pool of their own.
    @Bean(name = DELIVERY_TRACKING_SCHEDULER)
    ThreadPoolTaskScheduler deliveryTrackingScheduler() {
        return pool("delivery-tracking-", 1);
    }

    @Bean(name = DELIVERY_MAINTENANCE_SCHEDULER)
    ThreadPoolTaskScheduler deliveryMaintenanceScheduler() {
        return pool("delivery-maintenance-", 1);
    }

    // Cashfree webhook inbox and subscription payment status outbox.
    @Bean(name = PAYMENT_SCHEDULER)
    ThreadPoolTaskScheduler paymentScheduler() {
        return pool("payment-", 2);
    }

    // Chef payouts and bank onboarding.
    @Bean(name = PAYOUT_SCHEDULER)
    ThreadPoolTaskScheduler payoutScheduler() {
        return pool("payout-", 2);
    }

    @Bean(name = FINANCE_SCHEDULER)
    ThreadPoolTaskScheduler financeScheduler() {
        return pool("finance-", 1);
    }

    static ThreadPoolTaskScheduler pool(String threadNamePrefix, int size) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(size);
        scheduler.setThreadNamePrefix(threadNamePrefix);
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }
}
