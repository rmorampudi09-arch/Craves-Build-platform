package in.craves.integration.web;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class PaymentDtos {
    private PaymentDtos() {}

    public enum PaymentOrderStatus {
        CREATED, PAYMENT_PENDING, PAID, FAILED, CANCELLED
    }

    public record CreatePaymentOrderRequest(
        @NotNull UUID checkoutId,
        String customerName,
        String customerEmail,
        String customerPhone,
        String returnUrl
    ) {}

    public record CreatePaymentOrderResponse(
        UUID paymentOrderId,
        UUID checkoutId,
        String cravesPaymentOrderRef,
        String cashfreeOrderId,
        String cfOrderId,
        String paymentSessionId,
        BigDecimal amount,
        String currency,
        PaymentOrderStatus status,
        Instant createdAt
    ) {}

    public record PaymentOrderResponse(
        UUID paymentOrderId,
        UUID checkoutId,
        UUID customerIdentityId,
        String cravesPaymentOrderRef,
        String cashfreeOrderId,
        String cfOrderId,
        BigDecimal amount,
        String currency,
        PaymentOrderStatus status,
        String providerStatus,
        Instant createdAt,
        Instant updatedAt
    ) {}

    public record VerifyPaymentResponse(UUID paymentOrderId, PaymentOrderStatus status, String providerStatus) {}
}
