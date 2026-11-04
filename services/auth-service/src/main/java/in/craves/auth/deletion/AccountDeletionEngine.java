package in.craves.auth.deletion;

import static in.craves.auth.deletion.DeletionModel.RequestStatus.COMPLETED;
import static in.craves.auth.deletion.DeletionModel.RequestStatus.ERASING;
import static in.craves.auth.deletion.DeletionModel.RequestStatus.SCHEDULED;
import static in.craves.auth.deletion.DeletionModel.RequestStatus.WAITING_ON_OPEN_ITEMS;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.firebase.auth.FirebaseAuthException;
import in.craves.auth.config.JwtProperties;
import in.craves.auth.deletion.AccountDeletionRepository.Contact;
import in.craves.auth.deletion.AccountErasureClient.Blocker;
import in.craves.auth.deletion.AccountErasureClient.Outcome;
import in.craves.auth.deletion.AccountErasureClient.ServiceCall;
import in.craves.auth.deletion.DeletionModel.DeletionRequest;
import in.craves.auth.deletion.DeletionModel.DeletionStep;
import in.craves.auth.deletion.DeletionModel.Phase;
import in.craves.auth.deletion.DeletionModel.RequestStatus;
import in.craves.auth.deletion.DeletionModel.Scope;
import in.craves.auth.deletion.DeletionModel.StepStatus;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * What the deletion worker does at each tick. Part 1: runs due PREPARE, RELEASE and SWEEP steps with back-off, sends the
 * reminder, and on the due date either waits on open items (re-checked daily) or locks the account and schedules the ERASE
 * steps. Part 2: erases one service per tick in the fixed order, then sends the final notice, runs auth's own step and
 * completes the request. No HTTP call runs inside a transaction (the Hikari pool is 3): each answer is recorded in its own
 * short statement.
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
    private static final Duration SWEEP_AFTER = Duration.ofHours(24);
    private static final String AUTH = "auth";
    private static final List<String> ERASE_STEPS =
        Stream.concat(AccountErasureClient.ERASE_ORDER.stream(), Stream.of(AUTH)).toList();
    /** Before erasing: PREPARE steps run only in these statuses (a kept or rejected request prepares nothing more). */
    private static final Set<RequestStatus> PREPARING = EnumSet.of(RequestStatus.PENDING_REVIEW, SCHEDULED, WAITING_ON_OPEN_ITEMS);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final AccountDeletionRepository deletions;
    private final AccountErasureClient client;
    private final DeletionNotices notices;
    private final AccountLock lock;
    private final AuthAccountEraser eraser;
    private final AccountDeletionProperties properties;
    private final JwtProperties jwt;
    private final TransactionTemplate tx;
    private final Clock clock;

    public AccountDeletionEngine(AccountDeletionRepository deletions, AccountErasureClient client, DeletionNotices notices,
                                 AccountLock lock, AuthAccountEraser eraser, AccountDeletionProperties properties, JwtProperties jwt,
                                 PlatformTransactionManager transactions, Clock clock) {
        this.deletions = deletions;
        this.client = client;
        this.notices = notices;
        this.lock = lock;
        this.eraser = eraser;
        this.properties = properties;
        this.jwt = jwt;
        this.tx = new TransactionTemplate(transactions);
        this.clock = clock;
    }

    /**
     * Claims up to 10 requests with work due at {@code now} (the tick start) and does it, releasing each claim afterwards.
     * {@code now} decides only what was due at the claim; every time written is read from the clock when it is written,
     * because one slow tick can take many minutes.
     */
    public void runOnce(Instant now) {
        Instant leaseUntil = now.plus(LEASE);
        for (UUID id : deletions.claimDue(now, BATCH, LEASE, reminderLead())) {
            try {
                deletions.find(id).ifPresent(request -> process(request, now));
            } catch (RuntimeException error) {
                // The class only: a message can carry row values.
                LOGGER.error("CRAVES_ALERT alert=ACCOUNT_DELETION_REQUEST_FAILING requestId={} error={}", id, error.getClass().getSimpleName());
            }
            deletions.releaseLease(id, leaseUntil);
        }
    }

    private void process(DeletionRequest request, Instant now) {
        List<DeletionStep> steps = deletions.steps(request.id());
        for (DeletionStep step : steps) {
            if (step.status() != StepStatus.DONE && due(step.nextAttemptAt(), now) && runsIn(step.phase(), request.status())) {
                run(request, step);
            }
        }
        // A request already due gets no "in 7 days" notice: this same pass goes straight to the due-date check.
        if (request.status() == SCHEDULED && request.reminderSentAt() == null && request.dueAt().isAfter(now)
            && due(request.dueAt().minus(reminderLead()), now)) {
            notices.reminder(request);
            Instant sentAt = clock.instant();
            deletions.transition(request.id(), SCHEDULED, SCHEDULED, columns -> columns.put("reminder_sent_at", sentAt));
        }
        if ((request.status() == SCHEDULED && due(request.dueAt(), now))
            || (request.status() == WAITING_ON_OPEN_ITEMS && due(request.nextCheckAt(), now))) {
            check(request);
        }
        if (request.status() == ERASING) eraseNext(request, steps, now);
    }

    /** RELEASE and SWEEP outlive the request; ERASE steps run one at a time, in order ({@link #eraseNext}). */
    private static boolean runsIn(Phase phase, RequestStatus status) {
        return switch (phase) {
            case PREPARE -> PREPARING.contains(status);
            case RELEASE, SWEEP -> true;
            case ERASE -> false;
        };
    }

    /** True when the step is done. */
    private boolean run(DeletionRequest request, DeletionStep step) {
        UUID id = request.id();
        ServiceCall call = switch (step.phase()) {
            case PREPARE -> client.prepare(step.service(), id, request.identityId(), request.scope());
            case RELEASE -> client.release(step.service(), id, request.identityId(), request.scope());
            case ERASE, SWEEP -> AUTH.equals(step.service()) ? eraseLogin(request)
                : client.erase(step.service(), id, request.identityId(), request.scope());
        };
        Instant now = clock.instant(); // when the answer came, which can be well after the tick started
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
        return call.outcome() == Outcome.DONE;
    }

    /** Auth's own step, answered like a service's. */
    private ServiceCall eraseLogin(DeletionRequest request) {
        try {
            return new ServiceCall(Outcome.DONE, eraser.erase(request), List.of(), null);
        } catch (FirebaseAuthException | RuntimeException error) {
            // Codes only: a message can carry row values.
            String code = error instanceof FirebaseAuthException firebase ? "FIREBASE " + firebase.getErrorCode() : error.getClass().getSimpleName();
            return new ServiceCall(Outcome.FAILED, Map.of(), List.of(), code);
        }
    }

    /**
     * Part 2, at most one erase call per tick: the first service of ERASE_ORDER not done runs once due, and a step not done
     * (failed or blocked) stops the run there. With all 8 done: the final notice (once), auth's own step, then COMPLETED.
     */
    private void eraseNext(DeletionRequest request, List<DeletionStep> steps, Instant now) {
        Map<String, DeletionStep> erase = steps.stream().filter(step -> step.phase() == Phase.ERASE)
            .collect(Collectors.toMap(DeletionStep::service, step -> step));
        if (!erase.keySet().containsAll(ERASE_STEPS)) {
            // The lock commits its steps with ERASING, so only a hand edit gets here: re-create the missing ones on its schedule.
            deletions.insertSteps(request.id(), Phase.ERASE, ERASE_STEPS, eraseAfter(request.lockedAt()));
            return;
        }
        for (String service : AccountErasureClient.ERASE_ORDER) {
            DeletionStep step = erase.get(service);
            if (step.status() != StepStatus.DONE) {
                if (due(step.nextAttemptAt(), now)) run(request, step);
                return;
            }
        }
        if (request.finalNoticeSentAt() == null) {
            Contact contact = deletions.contact(request.identityId()); // before auth's step wipes them
            notices.completed(request, contact.phone(), contact.verifiedEmail());
            Instant sentAt = clock.instant();
            deletions.transition(request.id(), ERASING, ERASING, columns -> columns.put("final_notice_sent_at", sentAt));
        }
        DeletionStep auth = erase.get(AUTH);
        if (auth.status() == StepStatus.DONE || (due(auth.nextAttemptAt(), now) && run(request, auth))) complete(request);
    }

    /**
     * COMPLETED. A whole account also gets a notification SWEEP a day later, committed with it: notification's erase runs
     * again and blanks the final email's row once it has been delivered.
     */
    private void complete(DeletionRequest request) {
        Boolean completed = tx.execute(status -> {
            Instant completedAt = clock.instant();
            if (!deletions.transition(request.id(), ERASING, COMPLETED, columns -> columns.put("completed_at", completedAt))) return false;
            if (request.scope() == Scope.ALL)
                deletions.insertSteps(request.id(), Phase.SWEEP, List.of("notification"), completedAt.plus(SWEEP_AFTER));
            return true;
        });
        if (Boolean.TRUE.equals(completed)) LOGGER.info("Account deletion completed requestId={} scope={}", request.id(), request.scope());
    }

    /** min(5 min x 2^(attempts - 1), 6 h); the exponent stops growing long before it could overflow. */
    private static Duration backoff(int attempts) {
        Duration wait = FIRST_RETRY.multipliedBy(1L << Math.min(attempts - 1, 10));
        return wait.compareTo(LONGEST_RETRY) < 0 ? wait : LONGEST_RETRY;
    }

    /** The due-date check: erasing starts only when every PREPARE step is done and no service reports anything open. */
    private void check(DeletionRequest request) {
        List<Blocker> blockers = new ArrayList<>();
        for (DeletionStep step : deletions.steps(request.id())) {
            if (step.phase() == Phase.PREPARE && step.status() != StepStatus.DONE) {
                blockers.add(new Blocker(step.service(), "PREPARE_NOT_DONE", ""));
            }
        }
        for (String service : AccountErasureClient.ERASE_ORDER) {
            ServiceCall answer = client.blockers(service, request.identityId(), request.scope());
            // A refusal (BLOCKED) keeps its reasons; only a failed call, or a refusal giving none, counts as no answer.
            boolean answered = answer.outcome() == Outcome.DONE || (answer.outcome() == Outcome.BLOCKED && !answer.blockers().isEmpty());
            if (answered) blockers.addAll(answer.blockers());
            else blockers.add(new Blocker(service, "SERVICE_UNREACHABLE", Objects.requireNonNullElse(answer.error(), answer.outcome().name())));
        }
        if (blockers.isEmpty()) lockAndScheduleErase(request);
        else waitOn(request, blockers);
    }

    /** One transaction: the move to ERASING, the lock and the ERASE steps commit together or not at all (plan Decision 2). */
    private void lockAndScheduleErase(DeletionRequest request) {
        Instant eraseAfter = tx.execute(status -> {
            // The identity row first, as "keep" takes it, so the two never deadlock; a keep committed meanwhile fails the move.
            deletions.lockOpen(request.identityId());
            // Read once the row is held: tokens issued until this moment must all expire before the first erase call.
            Instant lockedAt = clock.instant();
            if (!deletions.transition(request.id(), request.status(), ERASING, columns -> {
                columns.put("locked_at", lockedAt);
                columns.put("blockers_json", null);
            })) return null;
            lock.lock(request);
            Instant runAfter = eraseAfter(lockedAt);
            deletions.insertSteps(request.id(), Phase.ERASE, ERASE_STEPS, runAfter);
            return runAfter;
        });
        if (eraseAfter != null) LOGGER.info("Account deletion locked requestId={} scope={} eraseAfter={}", request.id(), request.scope(), eraseAfter);
    }

    private void waitOn(DeletionRequest request, List<Blocker> blockers) {
        Instant now = clock.instant(); // after the blockers calls
        String json = JSON.valueToTree(blockers).toString();
        if (!deletions.transition(request.id(), request.status(), WAITING_ON_OPEN_ITEMS, columns -> {
            columns.put("blockers_json", json);
            columns.put("next_check_at", now.plus(RECHECK));
        })) return;
        long days = Duration.between(request.dueAt(), now).toDays();
        if (days >= ALERT_WAITING_DAYS) LOGGER.error("CRAVES_ALERT alert=ACCOUNT_DELETION_WAITING requestId={} days={}", request.id(), days);
        else LOGGER.info("Account deletion waiting requestId={} blockers={}", request.id(), blockers.size());
    }

    /** Every access token issued until the lock has expired by then. */
    private Instant eraseAfter(Instant lockedAt) {
        return lockedAt.plus(jwt.getAccessTokenTtl()).plus(Duration.ofMinutes(1));
    }

    private Duration reminderLead() {
        return Duration.ofDays(properties.getReminderDays());
    }

    /** A NULL time means due now. */
    private static boolean due(Instant at, Instant now) {
        return at == null || !at.isAfter(now);
    }
}
