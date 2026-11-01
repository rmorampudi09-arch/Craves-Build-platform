package in.craves.advanced.demandforecast;

import in.craves.advanced.demandforecast.DemandForecastDtos.DemandForecast;
import in.craves.advanced.platform.clients.ChefOrderHistory;
import in.craves.advanced.platform.clients.ChefOrderHistory.History;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;

/** No database: the forecast comes from the chef's own orders in Order service, read with their token. */
@Service
public class DemandForecastService {
    static final int MAX_DAYS_AHEAD = 13;
    private final ChefOrderHistory history;
    private final Clock clock;

    public DemandForecastService(ChefOrderHistory history, Clock clock) {
        this.history = history;
        this.clock = clock;
    }

    /** {@code date} is an India date from today to 13 days ahead. */
    public DemandForecast forDate(String chefToken, LocalDate date) {
        LocalDate today = clock.instant().atZone(DemandForecastRules.INDIA).toLocalDate();
        if (date == null || date.isBefore(today) || date.isAfter(today.plusDays(MAX_DAYS_AHEAD))) {
            throw ApiProblem.badRequest("INVALID_DATE", "Give an India date from today to " + MAX_DAYS_AHEAD + " days ahead");
        }
        List<LocalDate> weeks = DemandForecastRules.sameWeekdays(date, today);
        LocalDate oldest = weeks.isEmpty() ? today : weeks.get(weeks.size() - 1);
        // One extra day back, so the kitchen's first order is seen when it falls on the oldest week counted.
        History read = history.since(chefToken, oldest.minusDays(1).atStartOfDay(DemandForecastRules.INDIA).toInstant());
        return DemandForecastRules.forecast(read.orders(), date, today, read.complete());
    }
}
