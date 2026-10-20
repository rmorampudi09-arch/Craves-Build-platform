package in.craves.integration.fleet;

import in.craves.integration.config.SchedulerLagWatchdog;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

/**
 * The fleet exists only with CRAVES_FLEET_ENABLED. Every fleet class carries the same condition, so with the flag
 * off no fleet bean, pool or job is created. Fleet jobs run on their own pool, watched by SchedulerLagWatchdog.
 */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableConfigurationProperties(FleetProperties.class)
@ConditionalOnProperty(name = "craves.fleet.enabled", havingValue = "true")
public class FleetConfiguration {
    public static final String FLEET_SCHEDULER = "fleetScheduler";

    // One thread per fleet job (the daily joins-and-exits export) plus one spare for the jobs later phases add.
    @Bean(name = FLEET_SCHEDULER)
    ThreadPoolTaskScheduler fleetScheduler() {
        ThreadPoolTaskScheduler scheduler = new SchedulerLagWatchdog.MonitoredTaskScheduler();
        scheduler.setPoolSize(2);
        scheduler.setThreadNamePrefix("fleet-");
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }
}
