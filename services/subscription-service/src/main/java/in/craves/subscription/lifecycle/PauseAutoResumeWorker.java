package in.craves.subscription.lifecycle;

import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.AutoResumeCandidate;
import java.time.LocalDate;
import java.time.ZoneId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Restarts paused plans when the bill's pause days run out. */
@Component
@EnableScheduling
@ConditionalOnProperty(prefix = "craves.subscription.pause", name = "auto-resume-enabled", havingValue = "true")
public class PauseAutoResumeWorker {
    private static final Logger LOGGER = LoggerFactory.getLogger(PauseAutoResumeWorker.class);
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Kolkata");
    private static final int BATCH_SIZE = 50;

    private final SubscriptionLifecycleRepository repository;
    private final SubscriptionLifecycleService service;

    public PauseAutoResumeWorker(SubscriptionLifecycleRepository repository, SubscriptionLifecycleService service) {
        this.repository = repository;
        this.service = service;
    }

    // Spring's default pool, which this job already used; CH-01 requires every job to name its pool.
    @Scheduled(
        scheduler = "taskScheduler",
        initialDelayString = "${craves.subscription.pause.auto-resume-initial-delay-ms:60000}",
        fixedDelayString = "${craves.subscription.pause.auto-resume-fixed-delay-ms:300000}"
    )
    public void run() {
        resumeDue(LocalDate.now(BUSINESS_ZONE));
    }

    /**
     * Restarts every plan due by tomorrow with meals from tomorrow: a day early, so breakfast (sent to the chef at 20:00
     * the night before) finds its meals generated, and an overdue restart never sends the chef a late order for today.
     */
    int resumeDue(LocalDate today) {
        LocalDate tomorrow = today.plusDays(1);
        int resumed = 0;
        for (AutoResumeCandidate candidate : repository.dueAutoResumes(tomorrow, BATCH_SIZE)) {
            try {
                if (service.autoResume(candidate.subscriptionId(), candidate.customerIdentityId(), tomorrow)) {
                    resumed++;
                }
            } catch (RuntimeException exception) {
                LOGGER.error("Automatic plan restart failed subscriptionId={}", candidate.subscriptionId(), exception);
            }
        }
        return resumed;
    }
}
