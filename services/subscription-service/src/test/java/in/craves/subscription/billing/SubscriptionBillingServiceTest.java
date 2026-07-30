package in.craves.subscription.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class SubscriptionBillingServiceTest {
    @Test
    void weeklyCycleAdvancesSevenDays() {
        LocalDate start = LocalDate.of(2026, 8, 3);
        assertThat(SubscriptionBillingService.cycleEnd(start, "WEEKLY"))
            .isEqualTo(LocalDate.of(2026, 8, 10));
    }

    @Test
    void monthlyCycleUsesCalendarMonth() {
        LocalDate start = LocalDate.of(2026, 1, 31);
        assertThat(SubscriptionBillingService.cycleEnd(start, "MONTHLY"))
            .isEqualTo(LocalDate.of(2026, 2, 28));
    }
}
