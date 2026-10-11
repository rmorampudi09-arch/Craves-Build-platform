package in.craves.subscription.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class PauseCreditTest {
    private static LocalDate d(String value) {
        return value == null ? null : LocalDate.parse("2026-" + value);
    }

    private static void assertPlan(
        String pausedOn, String resumeOn, String paidThrough, String keptThrough,
        String creditStart, int creditDays, String nextBillingDate
    ) {
        PauseCredit credit = PauseCredit.plan(d(pausedOn), d(resumeOn), d(paidThrough), d(keptThrough));
        assertThat(credit).isEqualTo(new PauseCredit(d(creditStart), creditDays, d(nextBillingDate)));
    }

    @Test
    void pausedMidCycleResumedAfterItEnds() {
        assertPlan("10-07", "10-14", "10-12", "10-12", "10-14", 5, "10-19");
    }

    @Test
    void resumedBeforePaidEndCreditGoesAfterOpenInvoice() {
        assertPlan("10-07", "10-09", "10-12", "10-19", "10-19", 2, "10-21");
    }

    @Test
    void pausedAfterPaidPeriodEndedGetsNoCredit() {
        assertPlan("10-13", "10-20", "10-12", "10-12", null, 0, "10-20");
    }

    @Test
    void neverPaidRestartsAtResume() {
        assertPlan("10-07", "10-14", null, null, null, 0, "10-14");
    }

    @Test
    void sameDayResumeKeepsBilledEnd() {
        assertPlan("10-07", "10-07", "10-12", "10-12", null, 0, "10-12");
    }

    @Test
    void secondPauseCountsEarlierCreditAsPaid() {
        assertPlan("10-16", "10-20", "10-19", "10-19", "10-20", 3, "10-23");
    }
}
