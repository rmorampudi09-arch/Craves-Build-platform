package in.craves.notification.config;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.stereotype.Component;

/**
 * CH-04 alert 10: reports a worker whose fixed-delay/fixed-rate job stopped ticking (stuck in a slow call, or its
 * pool died). It runs on its own monitor pool, so a stalled worker pool cannot silence it. Logging only.
 */
@Component
public class SchedulerLagWatchdog {
    private static final Logger LOGGER = LoggerFactory.getLogger(SchedulerLagWatchdog.class);
    private static final Duration IDLE_GRACE = Duration.ofMinutes(1);
    private static final Duration RUNNING_GRACE = Duration.ofMinutes(10);

    private final List<ThreadPoolTaskScheduler> schedulers;

    public SchedulerLagWatchdog(List<ThreadPoolTaskScheduler> schedulers) {
        this.schedulers = schedulers;
    }

    @Scheduled(
        scheduler = WorkerSchedulingConfiguration.MONITOR_SCHEDULER,
        initialDelayString = "${craves.monitoring.scheduler-lag-check-ms:60000}",
        fixedDelayString = "${craves.monitoring.scheduler-lag-check-ms:60000}"
    )
    public void check() {
        Instant now = Instant.now();
        for (ThreadPoolTaskScheduler scheduler : schedulers) {
            if (scheduler instanceof MonitoredTaskScheduler monitored) {
                for (String lag : monitored.lagging(now)) {
                    LOGGER.error("CRAVES_ALERT alert=SCHEDULER_LAG pool={} {}", monitored.getThreadNamePrefix(), lag);
                }
            }
        }
    }

    /** A worker pool that records when each periodic job last started and finished. */
    public static final class MonitoredTaskScheduler extends ThreadPoolTaskScheduler {
        private final Map<String, Heartbeat> heartbeats = new ConcurrentHashMap<>();

        @Override
        public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Duration delay) {
            return super.scheduleWithFixedDelay(track(task, delay), delay);
        }

        @Override
        public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Instant startTime, Duration delay) {
            return super.scheduleWithFixedDelay(track(task, delay), startTime, delay);
        }

        @Override
        public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Duration period) {
            return super.scheduleAtFixedRate(track(task, period), period);
        }

        @Override
        public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Instant startTime, Duration period) {
            return super.scheduleAtFixedRate(track(task, period), startTime, period);
        }

        private Runnable track(Runnable task, Duration interval) {
            Heartbeat heartbeat = new Heartbeat(interval, Instant.now());
            heartbeats.put(task.toString(), heartbeat);
            return () -> {
                heartbeat.lastStart = Instant.now();
                heartbeat.running = true;
                try {
                    task.run();
                } finally {
                    heartbeat.running = false;
                    heartbeat.lastFinish = Instant.now();
                }
            };
        }

        List<String> lagging(Instant now) {
            List<String> lagging = new ArrayList<>();
            heartbeats.forEach((task, heartbeat) -> {
                Duration expected = heartbeat.interval.multipliedBy(3);
                if (heartbeat.running) {
                    Duration running = Duration.between(heartbeat.lastStart, now);
                    if (running.compareTo(max(expected, RUNNING_GRACE)) > 0) {
                        lagging.add("task=" + task + " state=running seconds=" + running.toSeconds());
                    }
                } else {
                    Duration idle = Duration.between(heartbeat.lastFinish, now);
                    if (idle.compareTo(expected.plus(IDLE_GRACE)) > 0) {
                        lagging.add("task=" + task + " state=idle seconds=" + idle.toSeconds()
                            + " expectedEverySeconds=" + heartbeat.interval.toSeconds());
                    }
                }
            });
            return lagging;
        }

        private static Duration max(Duration first, Duration second) {
            return first.compareTo(second) >= 0 ? first : second;
        }
    }

    static final class Heartbeat {
        final Duration interval;
        volatile Instant lastStart;
        volatile Instant lastFinish;
        volatile boolean running;

        Heartbeat(Duration interval, Instant registeredAt) {
            this.interval = interval;
            this.lastStart = registeredAt;
            this.lastFinish = registeredAt;
        }
    }
}
