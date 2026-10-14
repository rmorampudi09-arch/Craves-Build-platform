package in.craves.subscription.credit;

import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.billing.SubscriptionBillingRepository.DeferredPause;
import in.craves.subscription.credit.DayCreditRepository.DayCredit;
import in.craves.subscription.exception.ApiException;
import in.craves.subscription.occurrence.OccurrenceGeneratorService;
import in.craves.subscription.occurrence.OccurrenceRepository;
import in.craves.subscription.occurrence.OccurrenceRepository.ActiveSchedule;
import in.craves.subscription.security.CurrentUser;
import in.craves.subscription.web.ApiDtos.DayCreditResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.function.Predicate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Declined and paused paid days. With the refunds switch off they are added at the end of the plan, exactly as before;
 * on, the customer gets 48 hours to choose a refund request or the days at the end.
 */
@Service
public class DayCreditService {
    private static final Logger LOGGER = LoggerFactory.getLogger(DayCreditService.class);
    static final Duration CHOICE_WINDOW = Duration.ofHours(48);
    private static final Duration SHOWN_FOR = Duration.ofDays(30);
    private static final int SWEEP_BATCH = 50;

    private final DayCreditRepository repository;
    private final SubscriptionBillingRepository billingRepository;
    private final OccurrenceRepository occurrenceRepository;
    private final boolean enabled;
    private final Clock clock;
    private final TransactionOperations perChoice;

    @Autowired
    public DayCreditService(
        DayCreditRepository repository,
        SubscriptionBillingRepository billingRepository,
        OccurrenceRepository occurrenceRepository,
        DayCreditProperties properties,
        PlatformTransactionManager transactionManager
    ) {
        this(repository, billingRepository, occurrenceRepository, properties.isEnabled(), Clock.systemUTC(),
            new TransactionTemplate(transactionManager));
    }

    public DayCreditService(
        DayCreditRepository repository,
        SubscriptionBillingRepository billingRepository,
        OccurrenceRepository occurrenceRepository,
        boolean enabled,
        Clock clock
    ) {
        this(repository, billingRepository, occurrenceRepository, enabled, clock, TransactionOperations.withoutTransaction());
    }

    DayCreditService(
        DayCreditRepository repository,
        SubscriptionBillingRepository billingRepository,
        OccurrenceRepository occurrenceRepository,
        boolean enabled,
        Clock clock,
        TransactionOperations perChoice
    ) {
        this.repository = repository;
        this.billingRepository = billingRepository;
        this.occurrenceRepository = occurrenceRepository;
        this.enabled = enabled;
        this.clock = clock;
        this.perChoice = perChoice;
    }

    public boolean enabled() {
        return enabled;
    }

    /** Inside the caller's transaction, after the chef declined (or never accepted) a meal. */
    public void declined(UUID subscriptionId, UUID planId, LocalDate serviceDate, String mealSlotCode) {
        if (!enabled || !repository.paidDay(subscriptionId, serviceDate)) {
            // Switch off, or an extra day that was already free: nothing to refund, so it is added at the end at once.
            billingRepository.applyDeclineCredit(subscriptionId, servesSlot(planId, mealSlotCode));
            return;
        }
        if (repository.planRunning(subscriptionId)) {
            // One choice per day, as one credit per day before: a second declined meal that day adds nothing.
            repository.insertPending(subscriptionId, "DECLINE", serviceDate, serviceDate, mealSlotCode, null, deadline());
        }
    }

    /** Inside the caller's resume transaction (customer, automatic or admin), after the pause is closed. */
    public void creditPausedDays(UUID subscriptionId, LocalDate resumeOn) {
        if (!enabled) {
            billingRepository.applyPauseCredit(subscriptionId, resumeOn);
            return;
        }
        DeferredPause deferred = billingRepository.applyPauseCreditDeferringPausedDays(subscriptionId, resumeOn);
        int days = deferred.pausedPaidDays();
        if (days > 0 && repository.insertPending(
            subscriptionId, "PAUSE", deferred.pausedOn(), resumeOn.minusDays(1), null, days, deadline()
        ).isEmpty()) {
            // A choice already exists for a pause from that day (paused again the same day): never drop paid days.
            billingRepository.applyEndCredit(subscriptionId, "PAUSE_CREDIT", start -> days, "Pause credit");
        }
    }

    /**
     * The customer's choice, made once. The same choice again returns the outcome; a different one after the choice
     * was settled (by the customer or at the deadline) is refused. Refunds need the switch on; days at the end need a
     * running plan.
     */
    @Transactional
    public DayCreditResponse choose(UUID subscriptionId, UUID creditId, String choice, CurrentUser user) {
        if (user == null || !user.hasRole("CUSTOMER")) {
            throw ApiException.forbidden("ROLE_NOT_ALLOWED", "Customer role is required");
        }
        if (!repository.ownedBy(subscriptionId, user.identityId())) {
            throw notFound();
        }
        DayCredit credit = repository.lockForSubscription(creditId, subscriptionId).orElseThrow(DayCreditService::notFound);
        boolean refund = "REFUND".equals(choice);
        if (!"PENDING_CHOICE".equals(credit.status())) {
            boolean refunded = credit.status().startsWith("REFUND");
            if (refund != refunded) {
                throw ApiException.conflict("DAY_CREDIT_ALREADY_SETTLED", "This day has already been settled.");
            }
            return response(credit);
        }
        if (refund) {
            if (!enabled) {
                throw ApiException.conflict("REFUNDS_NOT_AVAILABLE", "Refunds are not available yet.");
            }
            repository.settle(creditId, "REFUND_REQUESTED", "CUSTOMER");
        } else {
            if (extend(credit) == null) {
                throw ApiException.conflict(
                    "EXTEND_NOT_AVAILABLE", "This plan has ended, so a day can't be added. Choose a refund."
                );
            }
            repository.settle(creditId, "EXTENDED", "CUSTOMER");
        }
        return response(repository.lockForSubscription(creditId, subscriptionId).orElseThrow());
    }

    /**
     * Settles unanswered choices past their deadline, switch on or off: the days go at the end while the plan runs,
     * otherwise a refund request is saved. Each choice settles in its own transaction; one failure is logged and skipped.
     */
    public int settleOverdue(Instant now) {
        int settled = 0;
        for (DayCredit due : repository.dueDeadlines(now, SWEEP_BATCH)) {
            try {
                Boolean done = perChoice.execute(status -> {
                    DayCredit credit = repository.lockForSubscription(due.id(), due.subscriptionId()).orElse(null);
                    if (credit == null || !"PENDING_CHOICE".equals(credit.status())) {
                        return false; // the customer chose meanwhile
                    }
                    String outcome = extend(credit) == null ? "REFUND_REQUESTED" : "EXTENDED";
                    return repository.settle(credit.id(), outcome, "SYSTEM");
                });
                if (Boolean.TRUE.equals(done)) {
                    settled++;
                }
            } catch (RuntimeException exception) {
                LOGGER.error("Day credit deadline could not be settled creditId={}", due.id(), exception);
            }
        }
        return settled;
    }

    /** Pending choices and those settled in the last 30 days, for the customer's subscription response. */
    public List<DayCreditResponse> forCustomer(UUID subscriptionId) {
        List<DayCredit> credits = repository.listForCustomer(subscriptionId, clock.instant().minus(SHOWN_FOR));
        if (credits.isEmpty()) {
            return List.of();
        }
        boolean running = repository.planRunning(subscriptionId);
        return credits.stream().map(credit -> response(credit, running)).toList();
    }

    /** Adds the choice's days at the end: null when the plan is no longer running. */
    private LocalDate extend(DayCredit credit) {
        if ("DECLINE".equals(credit.kind())) {
            UUID planId = repository.planIdOf(credit.subscriptionId());
            return billingRepository.applyDeclineCredit(credit.subscriptionId(), servesSlot(planId, credit.mealSlotCode()));
        }
        int days = credit.days();
        return billingRepository.applyEndCredit(
            credit.subscriptionId(), "PAUSE_CREDIT", start -> days, "Customer chose paused days at the end"
        );
    }

    /** The scan today's decline credit uses: days run through the next date that serves this meal slot. */
    Predicate<LocalDate> servesSlot(UUID planId, String mealSlotCode) {
        ActiveSchedule schedule = occurrenceRepository.findActiveSchedule(planId).orElse(null);
        return date -> schedule != null && OccurrenceGeneratorService.matchingItems(schedule, date).stream()
            .anyMatch(item -> mealSlotCode.equals(item.mealSlotCode()));
    }

    private DayCreditResponse response(DayCredit credit) {
        return response(credit, repository.planRunning(credit.subscriptionId()));
    }

    private static DayCreditResponse response(DayCredit credit, boolean running) {
        return new DayCreditResponse(
            credit.id(), credit.kind(), credit.firstDate(), credit.lastDate(), credit.mealSlotCode(), credit.days(),
            credit.status(), credit.refundAmount(), credit.currency(), credit.choiceDeadline(), running
        );
    }

    private static ApiException notFound() {
        return ApiException.notFound("DAY_CREDIT_NOT_FOUND", "This choice was not found");
    }

    private Instant deadline() {
        return clock.instant().plus(CHOICE_WINDOW);
    }
}
