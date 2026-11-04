package in.craves.auth.deletion;

import in.craves.auth.config.WorkerSchedulingConfiguration;
import java.time.Clock;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Runs the deletion engine on its own one-thread pool. Off unless CRAVES_ACCOUNT_DELETION_WORKER_ENABLED is true. */
@Component
@EnableScheduling
@ConditionalOnProperty(prefix = "craves.account-deletion", name = "worker-enabled", havingValue = "true")
public class AccountDeletionWorker {
    private final AccountDeletionEngine engine;
    private final Clock clock;

    public AccountDeletionWorker(AccountDeletionEngine engine, Clock clock) {
        this.engine = engine;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${craves.account-deletion.worker-delay:PT1M}",
        scheduler = WorkerSchedulingConfiguration.ACCOUNT_DELETION_SCHEDULER)
    public void tick() {
        engine.runOnce(clock.instant());
    }
}
