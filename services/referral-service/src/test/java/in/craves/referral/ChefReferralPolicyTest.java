package in.craves.referral;

import in.craves.referral.core.ChefReferralPolicy;
import in.craves.referral.core.RewardMath;
import java.time.Instant;
import java.time.YearMonth;
import java.util.Arrays;
import java.util.Random;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ChefReferralPolicyTest {
    private static final boolean[] CHEFS = {true, true, true};

    @Test void strictlyAbove250AndUsesTheWholeChefFoodSubtotal() {
        assertFalse(ChefReferralPolicy.qualifies(25_000));
        assertTrue(ChefReferralPolicy.qualifies(25_001));
        assertArrayEquals(new long[3], ChefReferralPolicy.allocate(25_000, true, CHEFS));
        assertArrayEquals(new long[]{600,360,240}, ChefReferralPolicy.allocate(15_000 + 15_000, true, CHEFS));
    }
    @Test void customerOrIneligibleChefCannotEarnAndMissingLevelsDoNotRollUp() {
        assertArrayEquals(new long[3], ChefReferralPolicy.allocate(100_000, false, CHEFS));
        assertArrayEquals(new long[]{2000,0,800}, ChefReferralPolicy.allocate(100_000, true, new boolean[]{true,false,true}));
        assertArrayEquals(new long[3], ChefReferralPolicy.allocate(100_000, true, new boolean[3]));
    }
    @Test void rejectsInvalidMoneyAndShape() {
        assertThrows(ReferralProblem.class, () -> ChefReferralPolicy.qualifies(-1));
        assertThrows(ReferralProblem.class, () -> ChefReferralPolicy.allocate(30_000, true, new boolean[4]));
        assertThrows(ReferralProblem.class, () -> ChefReferralPolicy.commissionCovers(100, new long[]{-1,0,0}));
    }
    @Test void preservesConfirmedRoundingAndNeverExceedsFourPercent() {
        Random random = new Random(20260916);
        for (int i=0; i<20_000; i++) {
            long basis = random.nextLong(25_001, 1_000_000_000_001L);
            long[] reward = ChefReferralPolicy.allocate(basis, true, CHEFS);
            assertTrue(Arrays.stream(reward).sum() <= RewardMath.floorBps(basis, 400));
            assertTrue(reward[0] <= RewardMath.roundBps(basis, 200));
            assertTrue(reward[1] <= RewardMath.roundBps(basis, 120));
            assertTrue(reward[2] <= RewardMath.roundBps(basis, 80));
        }
    }
    @Test void commissionShortfallDoesNotDeductFromTheSellingChef() {
        long[] rewards = ChefReferralPolicy.allocate(30_000, true, CHEFS);
        assertTrue(ChefReferralPolicy.commissionCovers(1200, rewards));
        assertFalse(ChefReferralPolicy.commissionCovers(1199, rewards));
    }
    @Test void laterOfPaidAndDeliveredStartsHold() {
        Instant delivery = Instant.parse("2026-09-16T03:29:59Z");
        Instant latePayment = delivery.plusSeconds(120);
        assertEquals(Instant.parse("2026-09-17T03:31:59Z"), ChefReferralPolicy.holdUntil(latePayment, delivery));
        assertEquals(Instant.parse("2026-09-18T03:30:00Z"), ChefReferralPolicy.firstPostingRun(latePayment, delivery));
    }
    @Test void beforeAtAndAfterNineAmBoundaries() {
        Instant nine = Instant.parse("2026-09-16T03:30:00Z");
        assertEquals(Instant.parse("2026-09-17T03:30:00Z"), ChefReferralPolicy.firstPostingRun(nine.minusSeconds(1), nine.minusSeconds(1)));
        assertEquals(Instant.parse("2026-09-17T03:30:00Z"), ChefReferralPolicy.firstPostingRun(nine, nine));
        assertEquals(Instant.parse("2026-09-18T03:30:00Z"), ChefReferralPolicy.firstPostingRun(nine.plusNanos(1), nine.plusNanos(1)));
        assertThrows(NullPointerException.class, () -> ChefReferralPolicy.holdUntil(null, nine));
    }
    @Test void boundedWorkerUsesLastEligibleDailyRun() {
        Instant nine = Instant.parse("2026-09-16T03:30:00Z");
        assertEquals(nine.minusSeconds(86_400), ChefReferralPolicy.latestPostingRun(nine.minusNanos(1)));
        assertEquals(nine, ChefReferralPolicy.latestPostingRun(nine));
        assertEquals(nine, ChefReferralPolicy.latestPostingRun(nine.plusSeconds(60)));
    }
    @Test void indiaCalendarMonthUsesActualPostingNotUtcMonthOrOrderMonth() {
        assertEquals(YearMonth.of(2026,9), ChefReferralPolicy.postingMonth(Instant.parse("2026-09-30T18:29:59Z")));
        assertEquals(YearMonth.of(2026,10), ChefReferralPolicy.postingMonth(Instant.parse("2026-09-30T18:30:00Z")));
        assertEquals(Instant.parse("2027-01-01T03:30:00Z"), ChefReferralPolicy.firstPostingRun(Instant.parse("2026-12-30T04:00:00Z"), Instant.parse("2026-12-30T04:00:00Z")));
    }
    @Test void originalMonthRefundRestoresAllowanceWithoutCreatingNewMonthCredit() {
        Instant original = Instant.parse("2026-09-30T03:30:00Z");
        assertEquals(YearMonth.of(2026,9), ChefReferralPolicy.reversalAllowanceMonth(original));
        assertEquals(150_000, ChefReferralPolicy.remainingAllowance(0,0));
        assertEquals(0, ChefReferralPolicy.remainingAllowance(150_000,0));
        assertEquals(500, ChefReferralPolicy.remainingAllowance(150_000,500));
        assertEquals(0, ChefReferralPolicy.remainingAllowance(150_500,500));
        assertThrows(ReferralProblem.class, () -> ChefReferralPolicy.remainingAllowance(150_001,0));
        assertThrows(ReferralProblem.class, () -> ChefReferralPolicy.remainingAllowance(100,101));
    }
}
