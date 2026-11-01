package in.craves.advanced.chefinsights;

import in.craves.advanced.chefinsights.ChefInsightsDtos.ChefInsightsSummary;
import in.craves.advanced.platform.clients.ChefOrderHistory;
import in.craves.advanced.platform.clients.ChefOrderHistory.History;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.LocalDate;
import org.springframework.stereotype.Service;

/** No database: every answer is worked out from Order service with the chef's own token, so a chef only ever sees their kitchen. */
@Service
public class ChefInsightsService {
    static final int MAX_DAYS = 92;
    private final ChefOrderHistory history;
    private final Clock clock;

    public ChefInsightsService(ChefOrderHistory history, Clock clock) {
        this.history = history;
        this.clock = clock;
    }

    /** {@code from} and {@code to} are India dates, both included, at most 92 days, not in the future. */
    public ChefInsightsSummary summary(String chefToken, LocalDate from, LocalDate to) {
        LocalDate today = clock.instant().atZone(ChefInsightsRules.INDIA).toLocalDate();
        if (from == null || to == null || to.isBefore(from) || to.isAfter(today) || from.plusDays(MAX_DAYS).isBefore(to.plusDays(1))) {
            throw ApiProblem.badRequest("INVALID_RANGE", "Give from and to India dates, not in the future, at most " + MAX_DAYS + " days apart");
        }
        History read = history.since(chefToken, from.atStartOfDay(ChefInsightsRules.INDIA).toInstant());
        return ChefInsightsRules.summarize(read.orders(), from, to, read.complete());
    }
}
