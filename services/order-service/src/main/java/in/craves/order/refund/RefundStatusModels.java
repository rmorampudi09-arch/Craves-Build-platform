package in.craves.order.refund;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class RefundStatusModels {
    private RefundStatusModels() {
    }

    public record EventEnvelope<T>(
        UUID eventId,
        String eventType,
        String eventVersion,
        Instant occurredAt,
        UUID correlationId,
        UUID causationId,
        String source,
        String subject,
        T data
    ) {
    }

    public record RefundStatusChangedData(
        UUID refundId,
        UUID checkoutId,
        UUID chefSubOrderId,
        UUID customerIdentityId,
        String refundReference,
        BigDecimal refundAmount,
        String currency,
        String reason,
        String status,
        String providerStatus,
        String cfRefundId,
        Instant updatedAt
    ) {
    }
}
