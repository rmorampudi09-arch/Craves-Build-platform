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

    @Scheduled(
        initialDelayString = "${craves.subscription.pause.auto-resume-initial-delay-ms:60000}",
        fixedDelayString = "${craves.subscription.pause.auto-resume-fixed-delay-ms:300000}"
    )
    public void run() {
        resumeDue(LocalDate.now(BUSINESS_ZONE));
    }

    /** Resumes a day early so breakfast, sent to the chef at 20:00 the night before, finds its meals generated. */
    int resumeDue(LocalDate today) {
        int resumed = 0;
        for (AutoResumeCandidate candidate : repository.dueAutoResumes(today.plusDays(1), BATCH_SIZE)) {
            LocalDate resumeDate = candidate.autoResumeDate().isBefore(today) ? today : candidate.autoResumeDate();
            try {
                if (service.autoResume(candidate.subscriptionId(), candidate.customerIdentityId(), resumeDate)) {
                    resumed++;
                }
            } catch (RuntimeException exception) {
                LOGGER.error("Automatic plan restart failed subscriptionId={}", candidate.subscriptionId(), exception);
            }
        }
        return resumed;
    }
}
