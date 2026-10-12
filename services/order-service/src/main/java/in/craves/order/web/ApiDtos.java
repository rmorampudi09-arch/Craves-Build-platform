package in.craves.order.web;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ApiDtos {
    private ApiDtos() {
    }

    public enum CheckoutStatus {
        PAYMENT_PENDING, PAID, CANCELLED
    }

    public enum OrderStatus {
        PAYMENT_PENDING, PAID, CHEF_ACCEPTANCE_PENDING, CHEF_ACCEPTED, PREPARING,
        READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED, CHEF_REJECTED, CANCELLED,
        REFUND_PENDING, REFUNDED, REFUND_FAILED
    }

    public record AddCartItemRequest(@NotNull UUID menuItemId, @Min(1) @jakarta.validation.constraints.Max(100) int quantity) {
    }

    public record UpdateCartItemRequest(@Min(1) @jakarta.validation.constraints.Max(100) int quantity) {
    }

    public record CartSnapshotItem(@NotNull UUID id, @Min(1) @jakarta.validation.constraints.Max(100) int quantity,
        @NotNull Instant updatedAt) {}

    public record CartSnapshotRequest(@NotNull UUID cartId,
        @NotNull @jakarta.validation.constraints.Size(max = 200)
        List<@NotNull @jakarta.validation.Valid CartSnapshotItem> items) {}

    public record SwitchKitchenRequest(@NotNull @jakarta.validation.Valid CartSnapshotRequest expectedCart,
        @NotNull UUID menuItemId, @NotNull UUID expectedKitchenId,
        @Min(1) @jakarta.validation.constraints.Max(100) int quantity) {}

    public record ReorderCartRequest(@NotNull @jakarta.validation.Valid CartSnapshotRequest expectedCart,
        @NotNull UUID expectedKitchenId) {}

    public record CartItemResponse(
        UUID id,
        UUID menuItemId,
        UUID kitchenId,
        String itemName,
        String kitchenName,
        BigDecimal unitPrice,
        String currency,
        int quantity,
        BigDecimal lineTotal,
        Instant createdAt,
        Instant updatedAt
    ) {
    }

    public record CartResponse(UUID id, UUID customerIdentityId, String currency, List<CartItemResponse> items, CartTotalsResponse totals) {
    }

    public record CartTotalsResponse(BigDecimal foodSubtotal, String currency) {
    }

    public record ChargePolicyResponse(
        UUID id,
        String policyName,
        BigDecimal platformFeePercent,
        BigDecimal platformFeeFlat,
        BigDecimal taxPercent,
        BigDecimal deliveryFeeFlat,
        boolean active,
        Instant createdAt
    ) {
    }

    public record ChargePolicyRequest(
        String policyName,
        @DecimalMin("0.00") BigDecimal platformFeePercent,
        @DecimalMin("0.00") BigDecimal platformFeeFlat,
        @DecimalMin("0.00") BigDecimal taxPercent,
        @DecimalMin("0.00") BigDecimal deliveryFeeFlat
    ) {
    }

    public record CheckoutRequest(UUID deliveryAddressId, String note, com.fasterxml.jackson.databind.JsonNode referralBenefits) {
        public CheckoutRequest(UUID deliveryAddressId,String note) { this(deliveryAddressId,note,null); }
        public CheckoutRequest(String note) {
            this(null, note);
        }
    }

    public record CustomerAddressSnapshotResponse(
        UUID sourceAddressId,
        String recipientName,
        String contactPhoneNumber,
        String addressLine1,
        String addressLine2,
        String landmark,
        String areaName,
        String city,
        String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude
    ) {
    }

    public record KitchenPickupSnapshotResponse(
        UUID kitchenId,
        String kitchenName,
        String contactPhoneNumber,
        String email,
        String addressLine1,
        String addressLine2,
        String landmark,
        String areaName,
        String city,
        String state,
        String postalCode,
        BigDecimal latitude,
        BigDecimal longitude
    ) {
    }

    public record CheckoutResponse(
        UUID id,
        UUID customerIdentityId,
        CheckoutStatus status,
        String currency,
        BigDecimal foodSubtotal,
        BigDecimal platformFee,
        BigDecimal taxAmount,
        BigDecimal deliveryFee,
        BigDecimal grandTotal,
        UUID chargePolicyId,
        UUID deliveryAddressId,
        CustomerAddressSnapshotResponse deliveryAddress,
        List<OrderResponse> orders,
        Instant createdAt,
        boolean referralBenefitsRequested
    ) {
        public CheckoutResponse(UUID id,UUID customerIdentityId,CheckoutStatus status,String currency,BigDecimal foodSubtotal,BigDecimal platformFee,BigDecimal taxAmount,BigDecimal deliveryFee,BigDecimal grandTotal,UUID chargePolicyId,UUID deliveryAddressId,CustomerAddressSnapshotResponse deliveryAddress,List<OrderResponse> orders,Instant createdAt) {
            this(id,customerIdentityId,status,currency,foodSubtotal,platformFee,taxAmount,deliveryFee,grandTotal,chargePolicyId,deliveryAddressId,deliveryAddress,orders,createdAt,false);
        }
        public CheckoutResponse withReferralBenefits() { return new CheckoutResponse(id,customerIdentityId,status,currency,foodSubtotal,platformFee,taxAmount,deliveryFee,grandTotal,chargePolicyId,deliveryAddressId,deliveryAddress,orders,createdAt,true); }
        public CheckoutResponse(
            UUID id,
            UUID customerIdentityId,
            CheckoutStatus status,
            String currency,
            BigDecimal foodSubtotal,
            BigDecimal platformFee,
            BigDecimal taxAmount,
            BigDecimal deliveryFee,
            BigDecimal grandTotal,
            UUID chargePolicyId,
            List<OrderResponse> orders,
            Instant createdAt
        ) {
            this(
                id,
                customerIdentityId,
                status,
                currency,
                foodSubtotal,
                platformFee,
                taxAmount,
                deliveryFee,
                grandTotal,
                chargePolicyId,
                null,
                null,
                orders,
                createdAt
            );
        }
    }

    public record OrderItemResponse(
        UUID id,
        UUID menuItemId,
        String itemName,
        String category,
        String foodType,
        BigDecimal unitPrice,
        int quantity,
        BigDecimal lineTotal
    ) {
    }

    public record OrderResponse(
        UUID id,
        UUID checkoutId,
        UUID customerIdentityId,
        UUID kitchenId,
        String kitchenName,
        OrderStatus status,
        String currency,
        BigDecimal foodSubtotal,
        BigDecimal platformFee,
        BigDecimal taxAmount,
        BigDecimal deliveryFee,
        BigDecimal grandTotal,
        String chefResponseNote,
        Integer prepTimeMinutes,
        CustomerAddressSnapshotResponse deliveryAddress,
        @JsonIgnore KitchenPickupSnapshotResponse pickupAddress,
        List<OrderItemResponse> items,
        Instant createdAt,
        Instant updatedAt,
        // Chef-only additions: absent (not null) on every customer and admin view, so those stay byte-identical.
        @JsonInclude(JsonInclude.Include.NON_NULL) Instant chefAcceptanceExpiresAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) String customerNote,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<OrderStatusHistoryEntry> statusHistory,
        @JsonInclude(JsonInclude.Include.NON_NULL) DeliveryPartnerResponse deliveryPartner,
        // Always present (null until handed over) so the app can tell the server supports hand-over.
        @JsonInclude(JsonInclude.Include.ALWAYS) Instant chefHandedOverAt
    ) {
        public OrderResponse(
            UUID id,
            UUID checkoutId,
            UUID customerIdentityId,
            UUID kitchenId,
            String kitchenName,
            OrderStatus status,
            String currency,
            BigDecimal foodSubtotal,
            BigDecimal platformFee,
            BigDecimal taxAmount,
            BigDecimal deliveryFee,
            BigDecimal grandTotal,
            String chefResponseNote,
            Integer prepTimeMinutes,
            CustomerAddressSnapshotResponse deliveryAddress,
            KitchenPickupSnapshotResponse pickupAddress,
            List<OrderItemResponse> items,
            Instant createdAt,
            Instant updatedAt
        ) {
            this(id, checkoutId, customerIdentityId, kitchenId, kitchenName, status, currency, foodSubtotal,
                platformFee, taxAmount, deliveryFee, grandTotal, chefResponseNote, prepTimeMinutes, deliveryAddress,
                pickupAddress, items, createdAt, updatedAt, null, null, null, null, null);
        }

        public OrderResponse(
            UUID id,
            UUID checkoutId,
            UUID customerIdentityId,
            UUID kitchenId,
            String kitchenName,
            OrderStatus status,
            String currency,
            BigDecimal foodSubtotal,
            BigDecimal platformFee,
            BigDecimal taxAmount,
            BigDecimal deliveryFee,
            BigDecimal grandTotal,
            String chefResponseNote,
            Integer prepTimeMinutes,
            List<OrderItemResponse> items,
            Instant createdAt,
            Instant updatedAt
        ) {
            this(
                id,
                checkoutId,
                customerIdentityId,
                kitchenId,
                kitchenName,
                status,
                currency,
                foodSubtotal,
                platformFee,
                taxAmount,
                deliveryFee,
                grandTotal,
                chefResponseNote,
                prepTimeMinutes,
                null,
                null,
                items,
                createdAt,
                updatedAt
            );
        }

        public OrderResponse withChefDetails(
            Instant chefAcceptanceExpiresAt,
            String customerNote,
            DeliveryPartnerResponse deliveryPartner,
            Instant chefHandedOverAt
        ) {
            return new OrderResponse(id, checkoutId, customerIdentityId, kitchenId, kitchenName, status, currency,
                foodSubtotal, platformFee, taxAmount, deliveryFee, grandTotal, chefResponseNote, prepTimeMinutes,
                deliveryAddress, pickupAddress, items, createdAt, updatedAt, chefAcceptanceExpiresAt, customerNote,
                statusHistory, deliveryPartner, chefHandedOverAt);
        }

        public OrderResponse withStatusHistory(List<OrderStatusHistoryEntry> history) {
            return new OrderResponse(id, checkoutId, customerIdentityId, kitchenId, kitchenName, status, currency,
                foodSubtotal, platformFee, taxAmount, deliveryFee, grandTotal, chefResponseNote, prepTimeMinutes,
                deliveryAddress, pickupAddress, items, createdAt, updatedAt, chefAcceptanceExpiresAt, customerNote,
                history, deliveryPartner, chefHandedOverAt);
        }
    }

    public record OrderStatusHistoryEntry(OrderStatus status, Instant at) {
    }

    public record DeliveryPartnerResponse(String name, String phone, String photoUrl, Instant pickupEtaAt) {
    }

    public record ChefAcceptRequest(@NotNull @Min(1) Integer prepTimeMinutes, String note) {
    }

    public record ChefRejectRequest(String reason) {
    }

    public record ApiErrorResponse(String error, String message) {
    }
}
