package in.craves.referral.core;

import in.craves.referral.ReferralProblem;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Objects;

/** Owner-confirmed economics; not a switch that activates the legacy wallet program. */
public final class ChefReferralPolicy {
    public static final String VERSION = "CHEF_COMMISSION_20260916";
    public static final ZoneId ACCOUNTING_ZONE = ZoneId.of("Asia/Kolkata");
    public static final long THRESHOLD_PAISE = 25_000;
    public static final long MONTHLY_CAP_PAISE = 150_000;
    public static final Duration HOLD = Duration.ofHours(24);
    private static final LocalTime POSTING_TIME = LocalTime.of(9, 0);
    private static final RewardPolicy RATES = new RewardPolicy(200, 120, 80, 400, 1,
        THRESHOLD_PAISE, 0, 0);

    private ChefReferralPolicy() { }

    public static boolean qualifies(long chefFoodSubtotalPaise) {
        RewardMath.money(chefFoodSubtotalPaise);
        return chefFoodSubtotalPaise > THRESHOLD_PAISE;
    }

    /** Eligibility must come from the authoritative chef service, never client-supplied roles. */
    public static long[] allocate(long chefFoodSubtotalPaise, boolean sellerIsEligibleChef,
            boolean[] eligibleChefAncestors) {
        Objects.requireNonNull(eligibleChefAncestors, "Chef eligibility required");
        ReferralProblem.require(eligibleChefAncestors.length == 3, 422, "THREE_LEVELS_REQUIRED");
        if (!qualifies(chefFoodSubtotalPaise) || !sellerIsEligibleChef) return new long[3];
        return RewardMath.allocate(chefFoodSubtotalPaise, RATES, eligibleChefAncestors);
    }

    /** Funding can only consume verified Craves commission, never the selling chef's payable. */
    public static boolean commissionCovers(long availableCommissionPaise, long[] rewards) {
        RewardMath.money(availableCommissionPaise);
        Objects.requireNonNull(rewards, "Rewards required");
        ReferralProblem.require(rewards.length == 3, 422, "THREE_LEVELS_REQUIRED");
        for (long reward : rewards) RewardMath.money(reward);
        return Arrays.stream(rewards).sum() <= availableCommissionPaise;
    }

    /** Both paid and delivered must have occurred. Delayed event arrival cannot shorten the hold. */
    public static Instant holdUntil(Instant paidAt, Instant deliveredAt) {
        Objects.requireNonNull(paidAt, "Verified payment time required");
        Objects.requireNonNull(deliveredAt, "Verified delivery time required");
        return (paidAt.isAfter(deliveredAt) ? paidAt : deliveredAt).plus(HOLD);
    }

    /** At the exact 9 AM boundary the complete 24-hour hold has elapsed, so that run is eligible. */
    public static Instant firstPostingRun(Instant paidAt, Instant deliveredAt) {
        Instant eligibleAt = holdUntil(paidAt, deliveredAt);
        var local = eligibleAt.atZone(ACCOUNTING_ZONE);
        var run = local.toLocalDate().atTime(POSTING_TIME).atZone(ACCOUNTING_ZONE);
        return (run.toInstant().isBefore(eligibleAt) ? run.plusDays(1) : run).toInstant();
    }

    /** A bounded worker may drain the current run after 9 AM without replaying earlier days. */
    public static Instant latestPostingRun(Instant now) {
        var local = Objects.requireNonNull(now).atZone(ACCOUNTING_ZONE);
        var run = local.toLocalDate().atTime(POSTING_TIME).atZone(ACCOUNTING_ZONE);
        return (run.toInstant().isAfter(now) ? run.minusDays(1) : run).toInstant();
    }

    public static YearMonth postingMonth(Instant actuallyPostedAt) {
        return YearMonth.from(Objects.requireNonNull(actuallyPostedAt).atZone(ACCOUNTING_ZONE));
    }

    public static long remainingAllowance(long postedPaise, long reversedPaise) {
        ReferralProblem.require(postedPaise >= 0 && reversedPaise >= 0 && reversedPaise <= postedPaise,
            422, "INVALID_MONTHLY_REFERRAL_TOTALS");
        long netPosted = postedPaise - reversedPaise;
        ReferralProblem.require(netPosted <= MONTHLY_CAP_PAISE, 409, "MONTHLY_REFERRAL_CAP_BREACH");
        return MONTHLY_CAP_PAISE - netPosted;
    }

    /** Use the immutable original posting timestamp, not the refund's arrival month. */
    public static YearMonth reversalAllowanceMonth(Instant originalPostedAt) {
        return postingMonth(originalPostedAt);
    }
}
