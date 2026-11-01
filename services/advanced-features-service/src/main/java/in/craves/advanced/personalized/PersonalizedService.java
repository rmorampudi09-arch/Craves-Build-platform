package in.craves.advanced.personalized;

import in.craves.advanced.personalized.PersonalizedDtos.RankCandidate;
import in.craves.advanced.personalized.PersonalizedDtos.RankResult;
import in.craves.advanced.platform.clients.SavedFeedGateway;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Uses only the person's own saves and delivered orders, and only when their M22 personalization consent is on. */
@Service
public class PersonalizedService {
    /** shortcut: per-replica bounds (8 reads at once, 24 waiting, 1.5 s per ranking); tune if ranking falls back often. */
    static final Duration DEADLINE = Duration.ofMillis(1500);
    private static final ExecutorService READS = new ThreadPoolExecutor(8, 8, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(24),
            Thread.ofPlatform().daemon().name("adv-personalized-", 0).factory(), new ThreadPoolExecutor.AbortPolicy());
    private final SavedFeedGateway sources;
    private final JdbcTemplate jdbc;

    public PersonalizedService(SavedFeedGateway sources, JdbcTemplate jdbc) {
        this.sources = sources;
        this.jdbc = jdbc;
    }

    public RankResult rank(UUID person, String token, List<RankCandidate> items) {
        if (!consented(person)) return PersonalizedRules.unchanged(items);
        // Ranking is optional: the three reads run in parallel under one short deadline, and any failure (down, slow, a token or role
        // the sources refuse, a full pool) returns the list as sent rather than holding up or breaking the feed it reorders.
        try {
            var dishes = CompletableFuture.supplyAsync(withMdc(() -> sources.favoriteDishes(token)), READS);
            var kitchens = CompletableFuture.supplyAsync(withMdc(() -> sources.favoriteKitchens(token)), READS);
            var history = CompletableFuture.supplyAsync(withMdc(() -> sources.deliveredOrders(token)), READS);
            CompletableFuture.allOf(dishes, kitchens, history).get(DEADLINE.toMillis(), TimeUnit.MILLISECONDS);
            return PersonalizedRules.rank(items, dishes.join(), kitchens.join(), history.join());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return PersonalizedRules.unchanged(items);
        } catch (ExecutionException | TimeoutException | RejectedExecutionException | ApiProblem ex) {
            return PersonalizedRules.unchanged(items);
        }
    }

    /** Carries the correlation id to the worker thread, so upstream calls stay traceable. */
    private static <T> Supplier<T> withMdc(Supplier<T> read) {
        Map<String, String> context = MDC.getCopyOfContextMap();
        return () -> {
            if (context != null) MDC.setContextMap(context);
            try {
                return read.get();
            } finally {
                MDC.clear();
            }
        };
    }

    /** Absent or unreadable consent counts as no (M22: personalization defaults off). */
    boolean consented(UUID person) {
        try {
            return Boolean.TRUE.equals(jdbc.query("SELECT personalization FROM adv_taste_data.consent WHERE person_id = ?",
                    (rs, i) -> rs.getBoolean(1), person).stream().findFirst().orElse(false));
        } catch (DataAccessException unreadable) {
            return false;
        }
    }
}
