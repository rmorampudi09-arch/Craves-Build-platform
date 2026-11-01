package in.craves.advanced.bulkorders;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderLine;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkOrderStatus;
import in.craves.advanced.bulkorders.BulkOrderDtos.BulkQuoteLine;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class BulkOrderRulesTest {
    static final Instant NOW = Instant.parse("2026-11-01T06:00:00Z");

    @Test
    void depositsRoundDownToTheStaffSetShare() {
        assertThat(BulkOrderRules.deposit(930_000, 25)).isEqualTo(232_500);
        assertThat(BulkOrderRules.deposit(999, 33)).isEqualTo(329);
        assertThat(BulkOrderRules.deposit(930_000, 0)).isZero();
        assertThat(BulkOrderRules.deposit(930_000, 100)).isEqualTo(930_000);
    }

    @Test
    void openRequestsLapseWithTheEventAndQuotesWithTheirValidity() {
        Instant event = NOW.plus(Duration.ofDays(2));
        Instant validUntil = NOW.plus(Duration.ofHours(1));
        assertThat(BulkOrderRules.expired(BulkOrderStatus.REQUESTED, event, null, NOW)).isFalse();
        assertThat(BulkOrderRules.expired(BulkOrderStatus.REQUESTED, event, null, event)).isTrue();
        assertThat(BulkOrderRules.expired(BulkOrderStatus.QUOTED, event, validUntil, NOW)).isFalse();
        assertThat(BulkOrderRules.expired(BulkOrderStatus.QUOTED, event, validUntil, validUntil)).isTrue();
        assertThat(BulkOrderRules.expired(BulkOrderStatus.ACCEPTED, event, validUntil, event.plusSeconds(1))).isFalse();
        assertThat(BulkOrderRules.expired(BulkOrderStatus.DECLINED, event, null, event.plusSeconds(1))).isFalse();
    }

    @Test
    void theEventMustRespectLeadTimeAndHorizon() {
        assertThat(BulkOrderRules.timingProblem(NOW.plus(Duration.ofHours(23)), NOW, 24, 30)).isEqualTo("EVENT_TOO_SOON");
        assertThat(BulkOrderRules.timingProblem(NOW.plus(Duration.ofHours(24)), NOW, 24, 30)).isNull();
        assertThat(BulkOrderRules.timingProblem(NOW.plus(Duration.ofDays(30)), NOW, 24, 30)).isNull();
        assertThat(BulkOrderRules.timingProblem(NOW.plus(Duration.ofDays(30)).plusSeconds(1), NOW, 24, 30)).isEqualTo("EVENT_TOO_FAR");
        assertThat(BulkOrderRules.timingProblem(NOW, NOW, 0, 30)).isEqualTo("EVENT_TOO_SOON");
        assertThat(BulkOrderRules.timingProblem(NOW.plusSeconds(1), NOW, 0, 30)).isNull();
    }

    @Test
    void aQuotePricesEveryRequestedDishOnce() {
        UUID biryani = UUID.randomUUID();
        UUID raita = UUID.randomUUID();
        List<BulkOrderLine> requested = List.of(new BulkOrderLine(biryani, "Biryani", 30, 32_000L, null),
                new BulkOrderLine(raita, "Raita", 30, 4_000L, null));
        assertThat(BulkOrderRules.pricesEveryDishOnce(requested, List.of(new BulkQuoteLine(raita, 3_000L), new BulkQuoteLine(biryani, 28_000L)))).isTrue();
        assertThat(BulkOrderRules.pricesEveryDishOnce(requested, List.of(new BulkQuoteLine(biryani, 28_000L)))).isFalse();
        assertThat(BulkOrderRules.pricesEveryDishOnce(requested, List.of(new BulkQuoteLine(biryani, 28_000L), new BulkQuoteLine(raita, 3_000L),
                new BulkQuoteLine(UUID.randomUUID(), 1L)))).isFalse();
        assertThat(BulkOrderRules.pricesEveryDishOnce(requested, List.of(new BulkQuoteLine(biryani, 28_000L), new BulkQuoteLine(raita, 3_000L),
                new BulkQuoteLine(raita, 2_000L)))).isFalse();
        assertThat(BulkOrderRules.total(List.of(new BulkOrderLine(biryani, "Biryani", 30, 32_000L, 28_000L),
                new BulkOrderLine(raita, "Raita", 30, 4_000L, 3_000L)))).isEqualTo(930_000);
    }
}
