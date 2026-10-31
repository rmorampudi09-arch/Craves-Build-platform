package in.craves.advanced.kitchencapacity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class KitchenCapacityRulesTest {
    // 2 Nov 2026, 11:30 in India.
    static final Instant NOW = Instant.parse("2026-11-02T06:00:00Z");
    static final LocalDate TODAY = LocalDate.of(2026, 11, 2);

    @Test
    void holdsOnlyWhileOpenBeforeTheCutoffAndOnTheServiceDate() {
        assertThat(KitchenCapacityService.acceptsHolds("OPEN", null, TODAY, NOW)).isTrue();
        assertThat(KitchenCapacityService.acceptsHolds("OPEN", NOW.plusSeconds(1), TODAY, NOW)).isTrue();
        assertThat(KitchenCapacityService.acceptsHolds("OPEN", NOW, TODAY, NOW)).isFalse();
        assertThat(KitchenCapacityService.acceptsHolds("CLOSED", null, TODAY, NOW)).isFalse();
        // The India date 2 Nov ends at 18:30 UTC.
        assertThat(KitchenCapacityService.acceptsHolds("OPEN", null, TODAY, Instant.parse("2026-11-02T18:29:59Z"))).isTrue();
        assertThat(KitchenCapacityService.acceptsHolds("OPEN", null, TODAY, Instant.parse("2026-11-02T18:30:00Z"))).isFalse();
        assertThat(KitchenCapacityService.acceptsHolds("OPEN", null, TODAY.minusDays(1), NOW)).isFalse();
    }

    @Test
    void batchesAreForTodayUpToThirtyDaysAhead() {
        assertThat(KitchenCapacityService.serviceDateAllowed(TODAY, TODAY)).isTrue();
        assertThat(KitchenCapacityService.serviceDateAllowed(TODAY.plusDays(30), TODAY)).isTrue();
        assertThat(KitchenCapacityService.serviceDateAllowed(TODAY.plusDays(31), TODAY)).isFalse();
        assertThat(KitchenCapacityService.serviceDateAllowed(TODAY.minusDays(1), TODAY)).isFalse();
    }

    @Test
    void anUnreadableHoldSettingFallsBackInsteadOfStoppingTheService() {
        assertThat(KitchenCapacityService.holdMinutes(" 15 ")).isEqualTo(15);
        assertThat(KitchenCapacityService.holdMinutes("10m")).isEqualTo(10);
        assertThat(KitchenCapacityService.holdMinutes(null)).isEqualTo(10);
        assertThat(KitchenCapacityService.holdMinutes("0")).isEqualTo(1);
        assertThat(KitchenCapacityService.holdMinutes("600")).isEqualTo(60);
    }
}
