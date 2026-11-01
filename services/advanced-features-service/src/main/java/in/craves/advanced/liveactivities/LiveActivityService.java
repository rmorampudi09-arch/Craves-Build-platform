package in.craves.advanced.liveactivities;

import in.craves.advanced.liveactivities.LiveActivityDtos.LiveActivityView;
import in.craves.advanced.liveactivities.LiveActivityDtos.LiveOrderState;
import in.craves.advanced.platform.clients.OrderGateway;
import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Order service stays the authority: every state is read from it with the caller's token. Pushing updates to Apple (APNs) is not wired
 * yet (needs the owner's Apple push key); until then the app refreshes the activity with {@link #state}.
 */
@Service
public class LiveActivityService implements PersonalDataContributor {
    /** shortcut: a technical bound against token spam, not a product rule; an activity lasts hours, so few are ever live at once. */
    static final int MAX_ACTIVE = 10;
    /** iOS ends a Live Activity after at most 12 hours; one not refreshed for a day is gone on the phone, so its token is cleared. */
    static final Duration STALE = Duration.ofHours(24);
    private final LiveActivityRepository repository;
    private final OrderGateway orders;
    private final Clock clock;
    private final TransactionTemplate tx;

    public LiveActivityService(LiveActivityRepository repository, OrderGateway orders, Clock clock, PlatformTransactionManager transactions) {
        this.repository = repository;
        this.orders = orders;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
    }

    /** A finished order ends its activity here too (after the read), so a crashed or uninstalled app leaves no token behind. */
    public LiveOrderState state(UUID person, String token, UUID orderId) {
        LiveOrderState state = read(person, token, orderId);
        if (state.isFinal()) end(person, orderId);
        return state;
    }

    private LiveOrderState read(UUID person, String token, UUID orderId) {
        return LiveActivityRules.state(order(person, token, orderId));
    }

    /** Only the caller's own order that is still in progress; Order service is asked before a database connection is taken. */
    public LiveOrderState register(UUID person, String token, UUID orderId, String pushToken) {
        LiveOrderState state = read(person, token, orderId);
        if (state.isFinal()) throw ApiProblem.conflict("ORDER_FINISHED", "This order is finished; there is nothing to follow live");
        tx.executeWithoutResult(status -> {
            repository.lockPerson(person);
            repository.endStale(person, clock.instant().minus(STALE), clock.instant());
            if (repository.activeCount(person, orderId) >= MAX_ACTIVE) {
                throw ApiProblem.conflict("TOO_MANY_ACTIVITIES", "End an older live activity first");
            }
            repository.upsert(person, orderId, pushToken.toLowerCase(Locale.ROOT), clock.instant());
        });
        return state;
    }

    /** Ending twice, or an order never registered, is not an error. */
    public void end(UUID person, UUID orderId) {
        tx.executeWithoutResult(status -> repository.end(person, orderId, clock.instant()));
    }

    public List<LiveActivityView> mine(UUID person) {
        return repository.of(person);
    }

    @Override
    public String moduleId() {
        return LiveActivitiesModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("activities", repository.of(person));
        return export;
    }

    @Override
    public int erase(UUID person) {
        repository.lockPerson(person);
        return repository.deleteOf(person);
    }

    private Order order(UUID person, String token, UUID orderId) {
        return orders.customerOrder(token, orderId).filter(found -> person.equals(found.customerId()))
                .orElseThrow(() -> ApiProblem.notFound("ORDER_NOT_FOUND", "No such order"));
    }
}
