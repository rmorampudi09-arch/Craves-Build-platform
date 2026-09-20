package in.craves.referral.core;

import in.craves.referral.ReferralProblem;
import java.util.List;

/** Immutable order-time policy. No floating point and no retroactive configuration lookup. */
public record RewardPolicy(int l1Bps, int l2Bps, int l3Bps, int capBps, int holdDays,
        long minimumPaise, long customerBonusPaise, long inviteeDiscountPaise) {
    public static final long MAX_MONEY = 1_000_000_000_000L;
    public static RewardPolicy defaults() { return new RewardPolicy(200, 120, 80, 400, 14, 80000, 40000, 25000); }
    public RewardPolicy {
        ReferralProblem.require(l1Bps >= 0 && l2Bps >= 0 && l3Bps >= 0 && capBps > 0 && capBps <= 400
            && (long) l1Bps + l2Bps + l3Bps <= capBps, 422, "INVALID_REWARD_RATES");
        ReferralProblem.require(holdDays >= 1 && holdDays <= 365, 422, "INVALID_HOLD_DAYS");
        ReferralProblem.require(minimumPaise > 0 && minimumPaise <= MAX_MONEY
            && customerBonusPaise >= 0 && customerBonusPaise <= MAX_MONEY
            && inviteeDiscountPaise >= 0 && inviteeDiscountPaise <= MAX_MONEY, 422, "INVALID_POLICY_MONEY");
    }
    public List<Integer> rates() { return List.of(l1Bps, l2Bps, l3Bps); }
}
