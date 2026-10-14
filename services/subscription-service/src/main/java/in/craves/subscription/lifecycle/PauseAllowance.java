package in.craves.subscription.lifecycle;

import in.craves.subscription.lifecycle.SubscriptionLifecycleRepository.PauseUsage;
import java.time.LocalDate;
import java.util.Objects;

/** How many days a customer may pause in one paid bill: 1 weekly, 3 in a 14-day bill, 7 in a 28-day bill. */
public final class PauseAllowance {
    private PauseAllowance() {
    }

    public record PauseStatus(int perBill, int left, LocalDate autoResumeDate) {
    }

    public static int daysPerBill(String billingPeriod) {
        if (billingPeriod == null) return 0;
        return switch (billingPeriod) {
            case "WEEKLY" -> 1;
            case "FORTNIGHTLY" -> 3;
            case "MONTHLY" -> 7;
            default -> 0;
        };
    }

    /** Days used so far count only while they belong to the bill the customer is in now. */
    public static int daysLeft(int perBill, LocalDate currentBillStart, LocalDate usageBillStart, int usedDays) {
        return Objects.equals(currentBillStart, usageBillStart) ? Math.max(0, perBill - usedDays) : perBill;
    }

    public static PauseStatus status(String billingPeriod, String subscriptionStatus, LocalDate currentBillStart, PauseUsage usage) {
        int perBill = daysPerBill(billingPeriod);
        int left = "PAUSED".equals(subscriptionStatus) ? 0 : daysLeft(perBill, currentBillStart, usage.billStart(), usage.usedDays());
        return new PauseStatus(perBill, left, usage.autoResumeDate());
    }
}
