package in.craves.advanced.trust;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.clients.OrderGateway.OrderLine;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.trust.TrustDtos.DisputeStatus;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TrustRulesTest {
    static final Instant PLACED = Instant.parse("2026-11-02T07:30:00Z");

    static Order order(String status, Long grandTotal, Instant createdAt) {
        return order(status, grandTotal, createdAt, createdAt);
    }

    static Order order(String status, Long grandTotal, Instant createdAt, Instant updatedAt) {
        return new Order(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), status,
                List.of(new OrderLine(UUID.randomUUID(), UUID.randomUUID(), "Biryani", 32_000, 2)), grandTotal, createdAt, updatedAt);
    }

    @Test
    void ordersAreDisputableOnceOverAndInsideTheStaffSetWindow() {
        assertThat(TrustRules.disputeProblem(order("DELIVERED", 70_000L, PLACED), 48, PLACED.plus(Duration.ofHours(48)))).isNull();
        assertThat(TrustRules.disputeProblem(order("DELIVERED", 70_000L, PLACED), 48, PLACED.plus(Duration.ofHours(48)).plusSeconds(1)))
                .isEqualTo("DISPUTE_WINDOW_OVER");
        assertThat(TrustRules.disputeProblem(order("REFUND_FAILED", 70_000L, PLACED), 1, PLACED)).isNull();
        assertThat(TrustRules.disputeProblem(order("CHEF_ACCEPTED", 70_000L, PLACED), 48, PLACED)).isEqualTo("ORDER_NOT_DISPUTABLE");
        assertThat(TrustRules.disputeProblem(order("OUT_FOR_DELIVERY", 70_000L, PLACED), 48, PLACED)).isEqualTo("ORDER_NOT_DISPUTABLE");
        assertThat(TrustRules.disputeProblem(order("DELIVERED", 70_000L, null), 48, PLACED)).isEqualTo("DISPUTE_WINDOW_OVER");
        // Order service cancels only before payment: nothing to dispute.
        assertThat(TrustRules.disputeProblem(order("CANCELLED", 70_000L, PLACED), 48, PLACED)).isEqualTo("ORDER_NOT_DISPUTABLE");
        // A scheduled order checked out four days before it was delivered still has its window after delivery.
        Order scheduled = order("DELIVERED", 70_000L, PLACED.minus(Duration.ofDays(4)), PLACED);
        assertThat(TrustRules.disputeProblem(scheduled, 48, PLACED.plus(Duration.ofHours(47)))).isNull();
    }

    @Test
    void onlyDeliveredOrdersCanGetMoneyBackHere() {
        assertThat(TrustRules.refundable(order("DELIVERED", 70_050L, PLACED), 70_050)).isEqualTo(70_050);
        // Order service already refunds rejected and refunded orders in full.
        assertThat(TrustRules.refundable(order("REFUNDED", 70_050L, PLACED), 70_050)).isZero();
        assertThat(TrustRules.refundable(order("CHEF_REJECTED", 70_050L, PLACED), 70_050)).isZero();
        assertThat(TrustRules.refundable(order("REFUND_FAILED", 70_050L, PLACED), 70_050)).isZero();
    }

    @Test
    void refundsGoOnlyWithAResolutionAndNeverAboveWhatMayBeRefunded() {
        assertThat(TrustRules.decisionProblem(DisputeStatus.RESOLVED, 64_000L, 64_000)).isNull();
        assertThat(TrustRules.decisionProblem(DisputeStatus.RESOLVED, null, 64_000)).isNull();
        assertThat(TrustRules.decisionProblem(DisputeStatus.REJECTED, null, 64_000)).isNull();
        assertThat(TrustRules.decisionProblem(DisputeStatus.RESOLVED, 64_001L, 64_000)).isEqualTo("REFUND_ABOVE_REFUNDABLE");
        assertThat(TrustRules.decisionProblem(DisputeStatus.RESOLVED, 1L, 0)).isEqualTo("REFUND_ABOVE_REFUNDABLE");
        assertThat(TrustRules.decisionProblem(DisputeStatus.REJECTED, 100L, 64_000)).isEqualTo("REFUND_ONLY_WHEN_RESOLVED");
        assertThat(TrustRules.decisionProblem(DisputeStatus.OPEN, null, 64_000)).isEqualTo("INVALID_OUTCOME");
        assertThat(TrustRules.decisionProblem(DisputeStatus.WITHDRAWN, null, 64_000)).isEqualTo("INVALID_OUTCOME");
    }

    @Test
    void textIsTrimmedAndBlankTextRefused() {
        assertThat(TrustRules.text("  Cold food\nand late  ", "details")).isEqualTo("Cold food\nand late");
        assertThatThrownBy(() -> TrustRules.text("  ", "details")).isInstanceOfSatisfying(ApiProblem.class,
                problem -> assertThat(problem.code()).isEqualTo("BLANK_TEXT"));
    }
}
