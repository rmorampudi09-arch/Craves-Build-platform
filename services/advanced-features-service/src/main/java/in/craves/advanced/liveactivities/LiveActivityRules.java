package in.craves.advanced.liveactivities;

import in.craves.advanced.liveactivities.LiveActivityDtos.LiveOrderStage;
import in.craves.advanced.liveactivities.LiveActivityDtos.LiveOrderState;
import in.craves.advanced.platform.clients.OrderGateway.Order;

final class LiveActivityRules {
    private LiveActivityRules() { }

    /** Order service's statuses mapped to what the lock screen shows. Order service never writes PREPARING today (accepted goes to READY_FOR_PICKUP). */
    static LiveOrderStage stage(String status) {
        if (status == null) return LiveOrderStage.UNKNOWN;
        return switch (status) {
            case "PAYMENT_PENDING" -> LiveOrderStage.PAYMENT_PENDING;
            case "PAID", "CHEF_ACCEPTANCE_PENDING" -> LiveOrderStage.PLACED;
            case "CHEF_ACCEPTED", "PREPARING" -> LiveOrderStage.COOKING;
            case "READY_FOR_PICKUP" -> LiveOrderStage.READY;
            case "OUT_FOR_DELIVERY" -> LiveOrderStage.ON_THE_WAY;
            case "DELIVERED" -> LiveOrderStage.DELIVERED;
            case "CHEF_REJECTED", "CANCELLED", "REFUND_PENDING", "REFUNDED", "REFUND_FAILED" -> LiveOrderStage.ENDED;
            default -> LiveOrderStage.UNKNOWN;
        };
    }

    static boolean isFinal(LiveOrderStage stage) {
        return stage == LiveOrderStage.DELIVERED || stage == LiveOrderStage.ENDED;
    }

    static LiveOrderState state(Order order) {
        LiveOrderStage stage = stage(order.status());
        int step = switch (stage) {
            case PAYMENT_PENDING, ENDED, UNKNOWN -> 0;
            case PLACED -> 1;
            case COOKING -> 2;
            case READY -> 3;
            case ON_THE_WAY -> 4;
            case DELIVERED -> 5;
        };
        return new LiveOrderState(order.id(), order.status(), stage, step, isFinal(stage), order.updatedAt());
    }
}
