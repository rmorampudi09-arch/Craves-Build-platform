package in.craves.subscription.lifecycle;

import static org.junit.jupiter.api.Assertions.assertEquals;

import in.craves.subscription.lifecycle.PauseAllowance.PauseStatus;
import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.PauseUsage;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class PauseAllowanceTest {
    static LocalDate d(String monthDay) { return LocalDate.parse("2026-" + monthDay); }

    @Test void daysPerBill() {
        assertEquals(List.of(1, 3, 7, 0), Stream.of("WEEKLY", "FORTNIGHTLY", "MONTHLY", "X").map(PauseAllowance::daysPerBill).toList());
    }

    @Test void sameBillSubtractsUsed() { assertEquals(4, PauseAllowance.daysLeft(7, d("10-13"), d("10-13"), 3)); }

    @Test void newBillResets() { assertEquals(7, PauseAllowance.daysLeft(7, d("11-10"), d("10-13"), 7)); }

    @Test void neverNegative() { assertEquals(0, PauseAllowance.daysLeft(1, d("10-13"), d("10-13"), 3)); }

    @Test void statusWhileActiveShowsDaysLeft() {
        assertEquals(new PauseStatus(3, 1, null),
            PauseAllowance.status("FORTNIGHTLY", "ACTIVE", d("10-13"), new PauseUsage(d("10-13"), 2, null, null)));
    }

    @Test void statusWhilePausedShowsRestartDateAndNoDaysLeft() {
        assertEquals(new PauseStatus(7, 0, d("10-27")),
            PauseAllowance.status("MONTHLY", "PAUSED", d("10-13"), new PauseUsage(d("10-13"), 0, d("10-20"), d("10-27"))));
    }
}
