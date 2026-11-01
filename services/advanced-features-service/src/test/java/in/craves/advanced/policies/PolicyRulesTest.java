package in.craves.advanced.policies;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.policies.PolicyDtos.CancelStage;
import in.craves.advanced.policies.PolicyDtos.CancellationCheck;
import in.craves.advanced.policies.PolicyDtos.CancellationPolicy;
import in.craves.advanced.policies.PolicyDtos.CancellationRule;
import in.craves.advanced.policies.PolicyDtos.CancelledBy;
import in.craves.advanced.policies.PolicyDtos.NotificationCap;
import in.craves.advanced.policies.PolicyDtos.NotificationCheck;
import in.craves.advanced.policies.PolicyDtos.NotificationFrequencyPolicy;
import in.craves.advanced.policies.PolicyDtos.ProviderCandidate;
import in.craves.advanced.policies.PolicyDtos.ProviderRankingPolicy;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityCheck;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityPolicy;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PolicyRulesTest {
    @Test
    void serviceabilityUsesCityLimitsAndPauses() {
        ServiceabilityPolicy p = PolicyRules.check(new ServiceabilityPolicy(5000, Map.of(" Hyderabad ", 8000), List.of("Pune")));
        // About 6.7 km apart in Hyderabad.
        var check = new ServiceabilityCheck(17.4400, 78.3489, 17.4239, 78.4071, "hyderabad");
        var verdict = PolicyRules.serviceability(p, 3, check);
        assertThat(verdict.serviceable()).isTrue();
        assertThat(verdict.limitMeters()).isEqualTo(8000);
        assertThat(verdict.distanceMeters()).isBetween(6000L, 7000L);
        assertThat(PolicyRules.serviceability(p, 3, new ServiceabilityCheck(17.4400, 78.3489, 17.4239, 78.4071, null)).reason()).isEqualTo("TOO_FAR");
        assertThat(PolicyRules.serviceability(p, 3, new ServiceabilityCheck(18.5, 73.8, 18.5, 73.8, "PUNE")).reason()).isEqualTo("CITY_PAUSED");
        assertThatThrownBy(() -> PolicyRules.check(new ServiceabilityPolicy(null, null, null))).isInstanceOf(ApiProblem.class);
    }

    @Test
    void cancellationRefundsFollowTheRuleAndNeverExceedWhatWasPaid() {
        CancellationPolicy p = PolicyRules.check(new CancellationPolicy(List.of(
                new CancellationRule(CancelStage.PLACED, CancelledBy.CUSTOMER, true, 100, true, true),
                new CancellationRule(CancelStage.COOKING, CancelledBy.CUSTOMER, true, 33, false, false),
                new CancellationRule(CancelStage.READY, CancelledBy.CUSTOMER, false, null, null, null))));
        var placed = PolicyRules.cancellation(p, 1, new CancellationCheck("PAID", CancelledBy.CUSTOMER, 20000L, 4000L, 1000L, 22000L));
        assertThat(placed.totalRefundPaise()).isEqualTo(22000); // 25,000 by the rule, capped at what was paid
        assertThat(placed.foodRefundPaise() + placed.deliveryFeeRefundPaise() + placed.platformFeeRefundPaise()).isEqualTo(22000);
        assertThat(placed.platformFeeRefundPaise()).isZero();
        assertThat(placed.deliveryFeeRefundPaise()).isEqualTo(2000);
        var cooking = PolicyRules.cancellation(p, 1, new CancellationCheck("CHEF_ACCEPTED", CancelledBy.CUSTOMER, 10001L, 4000L, 1000L, 15001L));
        assertThat(cooking.foodRefundPaise()).isEqualTo(3300); // rounded down
        assertThat(cooking.totalRefundPaise()).isEqualTo(3300);
        assertThat(PolicyRules.cancellation(p, 1, new CancellationCheck("READY_FOR_PICKUP", CancelledBy.CUSTOMER, 1L, 0L, 0L, 1L)).reason()).isEqualTo("NOT_ALLOWED");
        assertThat(PolicyRules.cancellation(p, 1, new CancellationCheck("PAID", CancelledBy.CHEF, 1L, 0L, 0L, 1L)).reason()).isEqualTo("NO_RULE");
        assertThat(PolicyRules.cancellation(p, 1, new CancellationCheck("DELIVERED", CancelledBy.CUSTOMER, 1L, 0L, 0L, 1L)).reason()).isEqualTo("NOT_CANCELLABLE");
        assertThatThrownBy(() -> PolicyRules.check(new CancellationPolicy(List.of(new CancellationRule(CancelStage.PLACED, CancelledBy.CHEF, true, 120, true, true)))))
                .isInstanceOf(ApiProblem.class);
    }

    @Test
    void providersRankByWeightsAndExclusionsComeLast() {
        ProviderRankingPolicy p = PolicyRules.check(new ProviderRankingPolicy(50, 50, 0, List.of("BORZO"), 60));
        var verdict = PolicyRules.rank(p, 2, List.of(new ProviderCandidate("PIDGE", 5000L, 40, 0.9), new ProviderCandidate("SHADOWFAX", 4000L, 30, null),
                new ProviderCandidate("BORZO", 1000L, 10, 1.0), new ProviderCandidate("PORTER", 3000L, 90, 1.0)));
        assertThat(verdict.providers()).extracting(r -> r.provider() + ":" + r.reason()).containsExactly("SHADOWFAX:OK", "PIDGE:OK", "BORZO:DISABLED", "PORTER:TOO_SLOW");
        assertThat(verdict.providers().get(0).score()).isEqualTo(1000);
        assertThatThrownBy(() -> PolicyRules.check(new ProviderRankingPolicy(0, 0, 0, null, null))).isInstanceOf(ApiProblem.class);
    }

    @Test
    void notificationsRespectDailyCapsGapsAndQuietHours() {
        NotificationFrequencyPolicy p = PolicyRules.check(new NotificationFrequencyPolicy(Map.of("PROMO", new NotificationCap(2, 60),
                "ORDER_UPDATE", new NotificationCap(50, 0)), "22:00", "08:00", List.of("ORDER_UPDATE")));
        Instant noonIst = Instant.parse("2026-11-01T06:30:00Z");
        assertThat(PolicyRules.notification(p, 1, new NotificationCheck("PROMO", noonIst, List.of()), noonIst).allowed()).isTrue();
        var tooSoon = PolicyRules.notification(p, 1, new NotificationCheck("PROMO", noonIst, List.of(noonIst.minus(Duration.ofMinutes(10)))), noonIst);
        assertThat(tooSoon.reason()).isEqualTo("TOO_SOON");
        assertThat(tooSoon.nextAllowedAt()).isEqualTo(noonIst.plus(Duration.ofMinutes(50)));
        var daily = PolicyRules.notification(p, 1, new NotificationCheck("PROMO", noonIst,
                List.of(noonIst.minus(Duration.ofHours(5)), noonIst.minus(Duration.ofHours(3)))), noonIst);
        assertThat(daily.reason()).isEqualTo("DAILY_LIMIT");
        assertThat(daily.nextAllowedAt()).isEqualTo(Instant.parse("2026-11-02T02:30:00Z")); // 19 h later is 07:00 IST, inside quiet hours: 08:00 IST
        Instant lateIst = Instant.parse("2026-11-01T17:30:00Z"); // 23:00 IST
        var quiet = PolicyRules.notification(p, 1, new NotificationCheck("PROMO", lateIst, List.of()), lateIst);
        assertThat(quiet.reason()).isEqualTo("QUIET_HOURS");
        assertThat(quiet.nextAllowedAt()).isEqualTo(Instant.parse("2026-11-02T02:30:00Z")); // 08:00 IST
        assertThat(PolicyRules.notification(p, 1, new NotificationCheck("ORDER_UPDATE", lateIst, List.of()), lateIst).allowed()).isTrue();
        Instant tenToTen = Instant.parse("2026-11-01T16:20:00Z"); // 21:50 IST; a 60-minute gap would end inside quiet hours
        assertThat(PolicyRules.notification(p, 1, new NotificationCheck("PROMO", tenToTen, List.of(tenToTen.minus(Duration.ofMinutes(10)))), tenToTen)
                .nextAllowedAt()).isEqualTo(Instant.parse("2026-11-02T02:30:00Z"));
        assertThat(PolicyRules.notification(p, 1, new NotificationCheck("PROMO", noonIst, List.of(noonIst.plus(Duration.ofMinutes(5)))), noonIst).reason())
                .isEqualTo("TOO_SOON");
        assertThat(PolicyRules.notification(p, 1, new NotificationCheck("OTHER", lateIst, List.of()), lateIst).reason()).isEqualTo("NOT_CONFIGURED");
        assertThatThrownBy(() -> PolicyRules.check(new NotificationFrequencyPolicy(Map.of("PROMO", new NotificationCap(1, 0)), "22:00", null, null)))
                .isInstanceOf(ApiProblem.class);
    }
}
