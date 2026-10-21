package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Publishing rules (Telangana Act 21 of 2026, s.13(2)): 14 days' notice and values inside the declared ranges. */
class FleetPolicyStoreTest {
    static final Instant NOW = Instant.parse("2026-10-20T06:30:00Z");
    static final Map<String, List<Long>> RANGES = Map.of("base_paise", List.of(3000L, 6000L), "drop_per_km_paise", List.of(600L, 1500L));

    @Test
    void aVersionStartingFourteenDaysAfterPublishingWithValuesInRangeMayBePublished() {
        assertThat(FleetPolicyStore.publishProblems(Map.of("base_paise", 4000L, "drop_per_km_paise", 900L), RANGES,
            NOW.plus(Duration.ofDays(14)), NOW)).isEmpty();
    }

    @Test
    void lessThanFourteenDaysNoticeIsRefused() {
        assertThat(FleetPolicyStore.publishProblems(Map.of("base_paise", 4000L), RANGES, NOW.plus(Duration.ofDays(14)).minusSeconds(1), NOW))
            .containsExactly("It must start at least 14 days after it is published.");
    }

    @Test
    void valuesOutsideOrWithoutADeclaredRangeAreRefused() {
        assertThat(FleetPolicyStore.publishProblems(Map.of("base_paise", 2999L), RANGES, NOW.plus(Duration.ofDays(30)), NOW))
            .containsExactly("base_paise 2999 is outside the declared range 3000 to 6000.");
        assertThat(FleetPolicyStore.publishProblems(Map.of("radius_m", 5000L), RANGES, NOW.plus(Duration.ofDays(30)), NOW))
            .containsExactly("radius_m has no declared range.");
    }
}
