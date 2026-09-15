package in.craves.order.schedule;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ScheduledOrderModels {
    private ScheduledOrderModels() {
    }

    public enum PaymentGate {
        PAYMENT_BEFORE_CHEF_CONFIRMATION,
        PAYMENT_AFTER_ALL_CHEFS_CONFIRM
    }

    public enum ScheduleStatus {
        PENDING_CHEF_CONFIRMATION,
        CONFIRMED,
        REJECTED,
        CANCELLED
    }

    public enum KitchenResponseStatus {
        PENDING,
        ACCEPTED,
        REJECTED
    }

    public enum ChefResponseAction {
        ACCEPT,
        REJECT
    }

    public record SchedulePolicyRequest(
        Boolean active,
        Integer minLeadMinutes,
        Integer maxHorizonMinutes,
        PaymentGate paymentGate,
        Integer expectedVersion
    ) {
    }

    public record SchedulePolicyView(
        UUID kitchenId,
        boolean active,
        int minLeadMinutes,
        int maxHorizonMinutes,
        PaymentGate paymentGate,
        int version,
        Instant updatedAt
    ) {
    }

    public record CreateScheduleRequest(
        Instant requestedFulfilmentAt,
        String requestedTimezone
    ) {
    }

    public record ScheduleCapabilityResponse(
        UUID checkoutId,
        boolean supported,
        Integer effectiveMinLeadMinutes,
        Integer effectiveMaxHorizonMinutes,
        PaymentGate paymentGate,
        List<String> blockers
    ) {
        public ScheduleCapabilityResponse {
            blockers = blockers == null ? List.of() : List.copyOf(blockers);
        }
    }

    public record ChefScheduleResponseRequest(
        ChefResponseAction action,
        String responseNote,
        Integer expectedVersion
    ) {
    }

    public record KitchenScheduleResponseView(
        UUID orderId,
        UUID kitchenId,
        KitchenResponseStatus status,
        PaymentGate paymentGate,
        String responseNote,
        int version,
        Instant respondedAt
    ) {
    }

    public record ScheduleRequestView(
        UUID scheduleRequestId,
        UUID checkoutId,
        Instant requestedFulfilmentAt,
        String requestedTimezone,
        ScheduleStatus status,
        int version,
        List<KitchenScheduleResponseView> kitchens,
        Instant createdAt,
        Instant updatedAt
    ) {
        public ScheduleRequestView {
            kitchens = kitchens == null ? List.of() : List.copyOf(kitchens);
        }
    }

    public record ChefScheduledOrderView(
        UUID scheduleRequestId,
        UUID checkoutId,
        UUID orderId,
        UUID kitchenId,
        Instant requestedFulfilmentAt,
        String requestedTimezone,
        ScheduleStatus scheduleStatus,
        KitchenResponseStatus responseStatus,
        PaymentGate paymentGate,
        String responseNote,
        int responseVersion,
        Instant respondedAt,
        Instant createdAt
    ) {
    }

    public record Page<T>(List<T> items, String nextCursor, boolean hasMore) {
        public Page {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    public record PaymentEligibilityResponse(
        UUID checkoutId,
        String fulfilmentMode,
        boolean paymentEligible,
        String reasonCode,
        UUID scheduleRequestId,
        ScheduleStatus scheduleStatus
    ) {
    }
}
