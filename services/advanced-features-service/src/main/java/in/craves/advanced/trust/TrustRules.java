package in.craves.advanced.trust;

import in.craves.advanced.platform.clients.OrderGateway.Order;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.trust.TrustDtos.DisputeStatus;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;

/** Pure trust rules, kept apart from the database and the gateways so they are unit-tested directly. */
final class TrustRules {
    /**
     * Paid orders that are over: delivered, or rejected or refunded by Order service. CANCELLED is left out on purpose: Order
     * service cancels only before payment, so there is no money to dispute.
     */
    static final Set<String> DISPUTABLE = Set.of("DELIVERED", "CHEF_REJECTED", "REFUND_PENDING", "REFUNDED", "REFUND_FAILED");

    private TrustRules() { }

    /**
     * ORDER_NOT_DISPUTABLE, DISPUTE_WINDOW_OVER, or null when a dispute may be opened. The window runs from when the order last
     * changed (for a finished order about when it finished, so a scheduled order delivered days after checkout still has its window).
     */
    static String disputeProblem(Order order, int windowHours, Instant now) {
        if (!DISPUTABLE.contains(order.status())) return "ORDER_NOT_DISPUTABLE";
        Instant ended = order.updatedAt() != null ? order.updatedAt() : order.createdAt();
        if (ended == null || now.isAfter(ended.plus(Duration.ofHours(windowHours)))) return "DISPUTE_WINDOW_OVER";
        return null;
    }

    /** The most a decision may refund: the total of a delivered order; nothing for orders Order service already refunds in full. */
    static long refundable(Order order, long grandTotalPaise) {
        return "DELIVERED".equals(order.status()) ? grandTotalPaise : 0;
    }

    /** Why the decision does not fit (an error code), or null. A refund goes only with RESOLVED and never above what may be refunded. */
    static String decisionProblem(DisputeStatus outcome, Long refundPaise, long refundablePaise) {
        if (outcome != DisputeStatus.RESOLVED && outcome != DisputeStatus.REJECTED) return "INVALID_OUTCOME";
        if (refundPaise != null && outcome != DisputeStatus.RESOLVED) return "REFUND_ONLY_WHEN_RESOLVED";
        if (refundPaise != null && refundPaise > refundablePaise) return "REFUND_ABOVE_REFUNDABLE";
        return null;
    }

    /** Trimmed; text that is blank after trimming (for example only Unicode spaces) is refused. Line breaks are kept. */
    static String text(String value, String field) {
        String tidy = value == null ? "" : value.strip();
        if (tidy.isEmpty()) throw ApiProblem.badRequest("BLANK_TEXT", field + " cannot be blank");
        return tidy;
    }
}
