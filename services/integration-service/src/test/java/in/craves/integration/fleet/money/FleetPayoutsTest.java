package in.craves.integration.fleet.money;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.fleet.money.FleetPayouts.Balance;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import org.junit.jupiter.api.Test;

/** The balance rules, the next payout day and the payout-execution guard. */
class FleetPayoutsTest {
    @Test
    void withNoDebtTheWholeAvailableBalanceIsWithdrawable() {
        Balance balance = new Balance(9_900, 0, 2_000, 0, 500);
        assertThat(balance.available()).isEqualTo(7_900);
        assertThat(balance.withdrawable()).isEqualTo(7_900);
        assertThat(balance.recovery()).isZero();
    }

    @Test
    void debtIsRecoveredFromPayAtMostTheWeeklyCapAndNeverPastZero() {
        Balance week1 = new Balance(9_900, 3_000, 2_000, 0, 500);
        assertThat(week1.recovery()).isEqualTo(500);
        assertThat(week1.withdrawable()).as("the weekly payout").isEqualTo(7_400);
        // After week 1's payout (7,400) and recovery (500), with ₹10 more earned.
        Balance week2 = new Balance(10_900, 3_000, 9_400, 500, 500);
        assertThat(week2.outstanding()).isEqualTo(2_500);
        assertThat(week2.recovery()).isEqualTo(500);
        assertThat(week2.withdrawable()).isEqualTo(500);
        // Nothing earned: nothing is recovered and nothing is paid; the debt waits for future pay.
        Balance empty = new Balance(9_900, 3_000, 9_400, 500, 500);
        assertThat(empty.recovery()).isZero();
        assertThat(empty.withdrawable()).isZero();
        Balance little = new Balance(10_100, 3_000, 9_400, 500, 500);
        assertThat(little.recovery()).as("only what there is").isEqualTo(200);
        assertThat(little.withdrawable()).isZero();
        Balance repaid = new Balance(20_000, 3_000, 9_400, 3_000, 500);
        assertThat(repaid.outstanding()).isZero();
        assertThat(repaid.withdrawable()).isEqualTo(7_600);
    }

    @Test
    void theNextPayoutIsMondayAndTodayUntilThreeOnAMonday() {
        assertThat(FleetPayouts.nextPayoutOn(ZonedDateTime.parse("2026-10-26T14:59:00+05:30[Asia/Kolkata]")))
            .isEqualTo(LocalDate.parse("2026-10-26"));
        assertThat(FleetPayouts.nextPayoutOn(ZonedDateTime.parse("2026-10-26T15:00:00+05:30[Asia/Kolkata]")))
            .isEqualTo(LocalDate.parse("2026-11-02"));
        assertThat(FleetPayouts.nextPayoutOn(ZonedDateTime.parse("2026-10-25T23:59:00+05:30[Asia/Kolkata]")))
            .isEqualTo(LocalDate.parse("2026-10-26"));
        assertThat(FleetPayouts.nextPayoutOn(ZonedDateTime.parse("2026-10-20T10:00:00+05:30[Asia/Kolkata]")))
            .isEqualTo(LocalDate.parse("2026-10-26"));
    }

    @Test
    void askingForAutomatedPayoutsIsRefused() {
        assertThat(FleetPayouts.refuseAutomatedExecution(true)).isTrue();
        assertThat(FleetPayouts.refuseAutomatedExecution(false)).isFalse();
    }
}
