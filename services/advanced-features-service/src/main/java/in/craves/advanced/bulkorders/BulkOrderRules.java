package in.craves.advanced.bulkorders;

import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderLine;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderStatus;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkQuoteLine;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Pure bulk-order rules, kept apart from the database so they are unit-tested directly. */
final class BulkOrderRules {
    private BulkOrderRules() { }

    /** Rounded down to whole paise, so the deposit never exceeds the staff-set share. */
    static long deposit(long totalPaise, int depositPercent) {
        return Math.multiplyExact(totalPaise, (long) depositPercent) / 100;
    }

    /** An open request lapses when its event passes, a quote when its validity passes (the chef may quote again before the event). */
    static boolean expired(BulkOrderStatus status, Instant eventAt, Instant quoteValidUntil, Instant now) {
        if (status != BulkOrderStatus.REQUESTED && status != BulkOrderStatus.QUOTED) return false;
        return !now.isBefore(eventAt) || (status == BulkOrderStatus.QUOTED && !now.isBefore(quoteValidUntil));
    }

    /** EVENT_TOO_SOON, EVENT_TOO_FAR, or null when the event fits the policy's lead time and horizon. */
    static String timingProblem(Instant eventAt, Instant now, int minLeadHours, int maxDaysAhead) {
        if (eventAt.isBefore(now.plus(Duration.ofHours(minLeadHours))) || !eventAt.isAfter(now)) return "EVENT_TOO_SOON";
        if (eventAt.isAfter(now.plus(Duration.ofDays(maxDaysAhead)))) return "EVENT_TOO_FAR";
        return null;
    }

    /** A quote prices exactly the requested dishes, each once. */
    static boolean pricesEveryDishOnce(List<BulkOrderLine> requested, List<BulkQuoteLine> quoted) {
        Set<UUID> wanted = new HashSet<>(requested.stream().map(BulkOrderLine::menuItemId).toList());
        Set<UUID> priced = new HashSet<>(quoted.stream().map(BulkQuoteLine::menuItemId).toList());
        return priced.size() == quoted.size() && priced.equals(wanted);
    }

    static long total(List<BulkOrderLine> priced) {
        long total = 0;
        for (BulkOrderLine line : priced) total = Math.addExact(total, Math.multiplyExact(line.unitPricePaise().longValue(), line.quantity()));
        return total;
    }
}
