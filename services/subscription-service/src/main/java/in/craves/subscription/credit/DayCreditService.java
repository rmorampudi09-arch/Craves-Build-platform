package in.craves.subscription.credit;

import in.craves.subscription.billing.SubscriptionBillingRepository;
import in.craves.subscription.billing.SubscriptionBillingRepository.DeferredPause;
import in.craves.subscription.occurrence.OccurrenceGeneratorService;
import in.craves.subscription.occurrence.OccurrenceRepository;
import in.craves.subscription.occurrence.OccurrenceRepository.ActiveSchedule;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import java.util.function.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Declined and paused paid days. With the refunds switch off they are added at the end of the plan, exactly as before;
 * on, the customer gets 48 hours to choose a refund request or the days at the end.
 */
@Service
public class DayCreditService {
    static final Duration CHOICE_WINDOW = Duration.ofHours(48);

    private final DayCreditRepository repository;
    private final SubscriptionBillingRepository billingRepository;
    private final OccurrenceRepository occurrenceRepository;
    private final boolean enabled;
    private final Clock clock;

    @Autowired
    public DayCreditService(
        DayCreditRepository repository,
        SubscriptionBillingRepository billingRepository,
        OccurrenceRepository occurrenceRepository,
        DayCreditProperties properties
    ) {
        this(repository, billingRepository, occurrenceRepository, properties.isEnabled(), Clock.systemUTC());
    }

    public DayCreditService(
        DayCreditRepository repository,
        SubscriptionBillingRepository billingRepository,
        OccurrenceRepository occurrenceRepository,
        boolean enabled,
        Clock clock
    ) {
        this.repository = repository;
        this.billingRepository = billingRepository;
        this.occurrenceRepository = occurrenceRepository;
        this.enabled = enabled;
        this.clock = clock;
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

    /** The scan today's decline credit uses: days run through the next date that serves this meal slot. */
    Predicate<LocalDate> servesSlot(UUID planId, String mealSlotCode) {
        ActiveSchedule schedule = occurrenceRepository.findActiveSchedule(planId).orElse(null);
        return date -> schedule != null && OccurrenceGeneratorService.matchingItems(schedule, date).stream()
            .anyMatch(item -> mealSlotCode.equals(item.mealSlotCode()));
    }

    private Instant deadline() {
        return clock.instant().plus(CHOICE_WINDOW);
    }
}
