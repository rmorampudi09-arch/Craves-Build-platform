package in.craves.auth.config;

import org.springframework.boot.task.TaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * One scheduler pool per worker family (CH-01). Every {@code @Scheduled} job names its pool, so
 * a slow Firebase call cannot delay token revocation publishing.
 * Each pool has one thread per job, and this class does not enable scheduling: workers keep their switches.
 */
@Configuration(proxyBeanMethods = false)
public class WorkerSchedulingConfiguration {
    public static final String ADMIN_INTERVENTION_SCHEDULER = "adminInterventionScheduler";
    public static final String TOKEN_REVOCATION_SCHEDULER = "tokenRevocationScheduler";

    // Declaring any scheduler makes Spring Boot back off its default one, so keep it for jobs added later.
    @Bean(name = "taskScheduler")
    @SuppressWarnings("removal") // same builder Spring Boot 3.3 uses, so spring.task.scheduling.* still applies
    ThreadPoolTaskScheduler taskScheduler(TaskSchedulerBuilder builder) {
        return builder.build();
    }

    @Bean(name = ADMIN_INTERVENTION_SCHEDULER)
    ThreadPoolTaskScheduler adminInterventionScheduler() {
        return pool("admin-intervention-", 1);
    }

    @Bean(name = TOKEN_REVOCATION_SCHEDULER)
    ThreadPoolTaskScheduler tokenRevocationScheduler() {
        return pool("token-revocation-", 1);
    }

    static ThreadPoolTaskScheduler pool(String threadNamePrefix, int size) {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(size);
        scheduler.setThreadNamePrefix(threadNamePrefix);
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }
}
