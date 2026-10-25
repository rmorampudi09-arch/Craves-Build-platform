package in.craves.order.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

// CH-04 alert 10: a job that stops ticking must be reported instead of failing silently.
class SchedulerLagWatchdogTest {

    @Test
    void reportsAJobThatHasNotTickedForThreeIntervals() {
        SchedulerLagWatchdog.MonitoredTaskScheduler scheduler = new SchedulerLagWatchdog.MonitoredTaskScheduler();
        scheduler.initialize();
        try {
            scheduler.scheduleWithFixedDelay(() -> { }, Instant.now().plus(Duration.ofHours(1)), Duration.ofSeconds(5));

            assertThat(scheduler.lagging(Instant.now())).isEmpty();
            assertThat(scheduler.lagging(Instant.now().plus(Duration.ofMinutes(2))))
                .singleElement()
                .asString()
                .contains("state=idle");
        } finally {
            scheduler.shutdown();
        }
    }
}
