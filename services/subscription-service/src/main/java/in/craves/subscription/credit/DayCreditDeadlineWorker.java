package in.craves.subscription.credit;

import java.time.Instant;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Unanswered refund-or-extend choices are settled 48 hours after they were offered. */
@Component
@EnableScheduling
@ConditionalOnProperty(prefix = "craves.subscription.refund-choice", name = "deadline-sweep-enabled", havingValue = "true")
public class DayCreditDeadlineWorker {
    private final DayCreditService service;

    public DayCreditDeadlineWorker(DayCreditService service) {
        this.service = service;
    }

    @Scheduled(
        initialDelayString = "${craves.subscription.refund-choice.deadline-sweep-initial-delay-ms:60000}",
        fixedDelayString = "${craves.subscription.refund-choice.deadline-sweep-fixed-delay-ms:300000}"
    )
    public void run() {
        service.settleOverdue(Instant.now());
    }
}
