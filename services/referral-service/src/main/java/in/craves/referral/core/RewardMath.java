package in.craves.referral.core;

import in.craves.referral.ReferralProblem;
import java.math.BigInteger;
import java.util.Arrays;

/** Pure, deterministic reward arithmetic in integer paise. A missing ancestor never changes another level. */
public final class RewardMath {
    private static final BigInteger DENOMINATOR = BigInteger.valueOf(10000);
    private RewardMath() { }
    public static long floorBps(long paise, int bps) {
        money(paise);
        return BigInteger.valueOf(paise).multiply(BigInteger.valueOf(bps)).divide(DENOMINATOR).longValueExact();
    }
    public static long roundBps(long paise, int bps) {
        money(paise);
        return BigInteger.valueOf(paise).multiply(BigInteger.valueOf(bps))
            .add(BigInteger.valueOf(5000)).divide(DENOMINATOR).longValueExact();
    }
    public static long[] allocate(long basis, RewardPolicy policy, boolean[] eligible) {
        money(basis);
        ReferralProblem.require(eligible.length == 3, 422, "THREE_LEVELS_REQUIRED");
        long[] amounts = new long[3];
        for (int level = 0; level < 3; level++)
            amounts[level] = eligible[level] ? roundBps(basis, policy.rates().get(level)) : 0;
        trim(amounts, floorBps(basis, policy.capBps()));
        return amounts;
    }
    public static long[] refundTargets(long originalBasis, long cumulativeFoodRefund, RewardPolicy policy,
            boolean[] eligible, long[] outstanding) {
        money(originalBasis); money(cumulativeFoodRefund);
        ReferralProblem.require(cumulativeFoodRefund <= originalBasis && outstanding.length == 3,
            422, "INVALID_CUMULATIVE_REFUND");
        long[] targets = allocate(originalBasis - cumulativeFoodRefund, policy, eligible);
        for (int i = 0; i < 3; i++) {
            ReferralProblem.require(outstanding[i] >= 0, 422, "INVALID_OUTSTANDING");
            // Cap trimming can otherwise move a rounding penny between levels after a refund.
            // Refunds may only remove money; they must never award a new penny.
            targets[i] = Math.min(targets[i], outstanding[i]);
        }
        return targets;
    }
    private static void trim(long[] amounts, long cap) {
        long overflow = Math.max(0, Arrays.stream(amounts).sum() - cap);
        for (int i = 0; i < amounts.length && overflow > 0; i++) {
            long trim = Math.min(amounts[i], overflow);
            amounts[i] -= trim; overflow -= trim;
        }
        if (overflow != 0) throw new IllegalStateException("Untrimmable referral cap");
    }
    public static void money(long amount) {
        ReferralProblem.require(amount >= 0 && amount <= RewardPolicy.MAX_MONEY, 422, "MONEY_OUT_OF_RANGE");
    }
}
