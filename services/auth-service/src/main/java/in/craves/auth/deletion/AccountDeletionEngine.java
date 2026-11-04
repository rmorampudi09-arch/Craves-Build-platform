package in.craves.auth.deletion;

import static in.craves.auth.deletion.DeletionModel.RequestStatus.ERASING;
import static in.craves.auth.deletion.DeletionModel.RequestStatus.SCHEDULED;
import static in.craves.auth.deletion.DeletionModel.RequestStatus.WAITING_ON_OPEN_ITEMS;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.deletion.AccountErasureClient.Blocker;
import in.craves.auth.deletion.AccountErasureClient.Outcome;
import in.craves.auth.deletion.AccountErasureClient.ServiceCall;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.DeletionStep;
import in.craves.auth.deletion.DeletionModel.Phase;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.StepStatus;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * What the deletion worker does at each tick (part 1): runs due PREPARE, RELEASE and SWEEP steps with back-off, sends the
 * reminder, and on the due date either waits on open items (re-checked daily) or locks the account and schedules the ERASE
 * steps. No HTTP call runs inside a transaction (the Hikari pool is 3): each answer is recorded in its own short statement.
 */
@Component
public class AccountDeletionEngine {
    private static final Logger LOGGER = LoggerFactory.getLogger(AccountDeletionEngine.class);
    private static final int BATCH = 10;
    private static final Duration LEASE = Duration.ofMinutes(5);
    private static final Duration RECHECK = Duration.ofHours(24);
    private static final Duration FIRST_RETRY = Duration.ofMinutes(5);
    private static final Duration LONGEST_RETRY = Duration.ofHours(6);
    private static final int ALERT_FROM_ATTEMPT = 5;
    private static final int ALERT_WAITING_DAYS = 7;
    private static final List<String> ERASE_STEPS =
        Stream.concat(AccountErasureClient.ERASE_ORDER.stream(), Stream.of("auth")).toList();
    /** Before erasing: PREPARE steps run only in these statuses (a kept or rejected request prepares nothing more). */
    private static final Set<RequestStatus> PREPARING = EnumSet.of(RequestStatus.PENDING_REVIEW, SCHEDULED, WAITING_ON_OPEN_ITEMS);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AccountDeletionRepository deletions;
    private final AccountErasureClient client;
    private final DeletionNotices notices;
    private final AccountLock lock;
    private final AccountDeletionProperties properties;
    private final JwtProperties jwt;
    private final TransactionTemplate tx;

    public AccountDeletionEngine(AccountDeletionRepository deletions, AccountErasureClient client, DeletionNotices notices,
                                 AccountLock lock, AccountDeletionProperties properties, JwtProperties jwt,
                                 PlatformTransactionManager transactions) {
        this.deletions = deletions;
        this.client = client;
        this.notices = notices;
        this.lock = lock;
        this.properties = properties;
        this.jwt = jwt;
        this.tx = new TransactionTemplate(transactions);
    }

    /** Claims up to 10 requests with work due and does it, releasing each claim once its work is recorded. */
    public void runOnce(Instant now) {
        for (UUID id : deletions.claimDue(now, BATCH, LEASE, reminderLead())) {
            try {
                deletions.find(id).ifPresent(request -> process(request, now));
                deletions.releaseLease(id);
            } catch (RuntimeException error) {
                // The lease is kept, so a request that keeps failing is retried when it runs out, not at every tick.
                LOGGER.error("Account deletion work failed requestId={} error={}", id, error.getClass().getSimpleName());
            }
        }
    }

    private void process(DeletionRequest request, Instant now) {
        for (DeletionStep step : deletions.steps(request.id())) {
            if (step.status() != StepStatus.DONE && due(step.nextAttemptAt(), now) && runsIn(step.phase(), request.status())) {
                run(request, step, now);
            }
        }
        if (request.status() == SCHEDULED && request.reminderSentAt() == null && due(request.dueAt().minus(reminderLead()), now)) {
            notices.reminder(request);
            deletions.transition(request.id(), SCHEDULED, SCHEDULED, columns -> columns.put("reminder_sent_at", now));
        }
        if ((request.status() == SCHEDULED && due(request.dueAt(), now))
            || (request.status() == WAITING_ON_OPEN_ITEMS && due(request.nextCheckAt(), now))) {
            check(request, now);
        }
    }

    /** RELEASE and SWEEP outlive the request; ERASE steps are the worker's part 2. */
    private static boolean runsIn(Phase phase, RequestStatus status) {
        return switch (phase) {
            case PREPARE -> PREPARING.contains(status);
            case RELEASE, SWEEP -> true;
            case ERASE -> false;
        };
    }

    private void run(DeletionRequest request, DeletionStep step, Instant now) {
        UUID id = request.id();
        ServiceCall call = switch (step.phase()) {
            case PREPARE -> client.prepare(step.service(), id, request.identityId(), request.scope());
            case RELEASE -> client.release(step.service(), id, request.identityId(), request.scope());
            case ERASE, SWEEP -> client.erase(step.service(), id, request.identityId(), request.scope());
        };
        switch (call.outcome()) {
            case DONE -> deletions.recordStep(id, step.phase(), step.service(), StepStatus.DONE, call.erasedCount(), null, null);
            case BLOCKED -> deletions.recordStep(id, step.phase(), step.service(), StepStatus.BLOCKED, null, null, now.plus(RECHECK));
            case FAILED -> {
                int attempts = step.attempts() + 1;
                deletions.recordStep(id, step.phase(), step.service(), StepStatus.PENDING, null, call.error(), now.plus(backoff(attempts)));
                if (attempts >= ALERT_FROM_ATTEMPT) {
                    LOGGER.error("CRAVES_ALERT alert=ACCOUNT_DELETION_STEP_FAILING requestId={} phase={} service={} attempts={} error={}",
                        id, step.phase(), step.service(), attempts, call.error());
                }
            }
        }
    }

    /** min(5 min x 2^(attempts - 1), 6 h); the exponent stops growing long before it could overflow. */
    private static Duration backoff(int attempts) {
        Duration wait = FIRST_RETRY.multipliedBy(1L << Math.min(attempts - 1, 10));
        return wait.compareTo(LONGEST_RETRY) < 0 ? wait : LONGEST_RETRY;
    }

    /** The due-date check: erasing starts only when every PREPARE step is done and no service reports anything open. */
    private void check(DeletionRequest request, Instant now) {
        List<Blocker> blockers = new ArrayList<>();
        for (DeletionStep step : deletions.steps(request.id())) {
            if (step.phase() == Phase.PREPARE && step.status() != StepStatus.DONE) {
                blockers.add(new Blocker(step.service(), "PREPARE_NOT_DONE", ""));
            }
        }
        for (String service : AccountErasureClient.ERASE_ORDER) {
            ServiceCall answer = client.blockers(service, request.identityId(), request.scope());
            if (answer.outcome() == Outcome.DONE) blockers.addAll(answer.blockers());
            else blockers.add(new Blocker(service, "SERVICE_UNREACHABLE", Objects.requireNonNullElse(answer.error(), answer.outcome().name())));
        }
        if (blockers.isEmpty()) lockAndScheduleErase(request, now);
        else waitOn(request, blockers, now);
    }

    /** One transaction: the move to ERASING, the lock and the ERASE steps commit together or not at all (plan Decision 2). */
    private void lockAndScheduleErase(DeletionRequest request, Instant now) {
        Instant eraseAfter = now.plus(jwt.getAccessTokenTtl()).plus(Duration.ofMinutes(1));
        boolean locked = Boolean.TRUE.equals(tx.execute(status -> {
            // The identity row first, as "keep" takes it, so the two never deadlock; a keep committed meanwhile fails the move.
            deletions.lockOpen(request.identityId());
            if (!deletions.transition(request.id(), request.status(), ERASING, columns -> {
                columns.put("locked_at", now);
                columns.put("blockers_json", null);
            })) return false;
            lock.lock(request);
            deletions.insertSteps(request.id(), Phase.ERASE, ERASE_STEPS, eraseAfter);
            return true;
        }));
        if (locked) LOGGER.info("Account deletion locked requestId={} scope={} eraseAfter={}", request.id(), request.scope(), eraseAfter);
    }

    private void waitOn(DeletionRequest request, List<Blocker> blockers, Instant now) {
        String json = JSON.valueToTree(blockers).toString();
        if (!deletions.transition(request.id(), request.status(), WAITING_ON_OPEN_ITEMS, columns -> {
            columns.put("blockers_json", json);
            columns.put("next_check_at", now.plus(RECHECK));
        })) return;
        long days = Duration.between(request.dueAt(), now).toDays();
        if (days >= ALERT_WAITING_DAYS) LOGGER.error("CRAVES_ALERT alert=ACCOUNT_DELETION_WAITING requestId={} days={}", request.id(), days);
        else LOGGER.info("Account deletion waiting requestId={} blockers={}", request.id(), blockers.size());
    }

    private Duration reminderLead() {
        return Duration.ofDays(properties.getReminderDays());
    }

    /** A NULL time means due now. */
    private static boolean due(Instant at, Instant now) {
        return at == null || !at.isAfter(now);
    }
}
