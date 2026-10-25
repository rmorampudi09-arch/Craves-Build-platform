package in.craves.subscription.billing;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.subscription.billing.PauseCredit.Cycle;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class PauseCreditTest {
    private static LocalDate d(String value) {
        return value == null ? null : LocalDate.parse("2026-" + value);
    }

    private static Cycle paid(String start, String end) {
        return new Cycle(d(start), d(end));
    }

    private static void assertPlan(
        String pausedOn, String resumeOn, List<Cycle> paidCycles, int carriedDays, String keptThrough,
        String creditStart, int creditDays, String nextBillingDate
    ) {
        PauseCredit credit = PauseCredit.plan(d(pausedOn), d(resumeOn), paidCycles, carriedDays, d(keptThrough));
        assertThat(credit).isEqualTo(new PauseCredit(d(creditStart), creditDays, d(nextBillingDate)));
    }

    @Test
    void pausedMidCycleResumedAfterItEnds() {
        assertPlan("10-07", "10-14", List.of(paid("10-05", "10-12")), 0, "10-12", "10-14", 5, "10-19");
    }

    @Test
    void resumedBeforePaidEndCreditGoesAfterOpenInvoice() {
        assertPlan("10-07", "10-09", List.of(paid("10-05", "10-12")), 0, "10-19", "10-19", 2, "10-21");
    }

    @Test
    void pausedAfterPaidPeriodEndedGetsNoCredit() {
        assertPlan("10-13", "10-20", List.of(paid("10-05", "10-12")), 0, "10-12", null, 0, "10-20");
    }

    @Test
    void neverPaidRestartsAtResume() {
        assertPlan("10-07", "10-14", List.of(), 0, null, null, 0, "10-14");
    }

    @Test
    void sameDayResumeKeepsBilledEnd() {
        assertPlan("10-07", "10-07", List.of(paid("10-05", "10-12")), 0, "10-12", null, 0, "10-12");
    }

    @Test
    void secondPauseCountsEarlierCreditAsPaid() {
        assertPlan("10-16", "10-20", List.of(paid("10-05", "10-12"), paid("10-14", "10-19")), 0, "10-19", "10-20", 3, "10-23");
    }

    @Test
    void unpaidGapInsideThePauseIsNotCredited() {
        // 10-12..10-18 was never paid (its payment failed), so only 10-19..10-21 counts.
        assertPlan("10-14", "10-22", List.of(paid("10-05", "10-12"), paid("10-19", "10-26")), 0, "10-26", "10-26", 3, "10-29");
    }

    @Test
    void earlierCreditNotYetStartedIsLaidOutAgainWithTheNewOne() {
        assertPlan("10-10", "10-15", List.of(paid("10-05", "10-12")), 2, "10-12", "10-15", 4, "10-19");
    }
}
