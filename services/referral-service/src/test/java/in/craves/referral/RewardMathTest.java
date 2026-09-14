package in.craves.referral;

import in.craves.referral.core.ReferralCodes;
import in.craves.referral.core.RewardMath;
import in.craves.referral.core.RewardPolicy;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Random;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RewardMathTest {
    private final RewardPolicy policy=RewardPolicy.defaults();
    @Test void canonicalThousandRupeeSales() {
        assertArrayEquals(new long[]{2000,0,0},RewardMath.allocate(100000,policy,new boolean[]{true,false,false}));
        assertArrayEquals(new long[]{2000,1200,0},RewardMath.allocate(100000,policy,new boolean[]{true,true,false}));
        assertArrayEquals(new long[]{2000,1200,800},RewardMath.allocate(100000,policy,new boolean[]{true,true,true}));
    }
    @Test void missingAncestorDoesNotRollUpOrCompress() {
        assertArrayEquals(new long[]{0,1200,800},RewardMath.allocate(100000,policy,new boolean[]{false,true,true}));
        assertArrayEquals(new long[]{2000,0,800},RewardMath.allocate(100000,policy,new boolean[]{true,false,true}));
    }
    @Test void trimOverflowFromDirectLevelFirst() {
        assertArrayEquals(new long[]{0,1,1},RewardMath.allocate(63,policy,new boolean[]{true,true,true}));
        assertArrayEquals(new long[]{0,1,0},RewardMath.refundTargets(63,1,policy,new boolean[]{true,true,true},new long[]{0,1,1}));
    }
    @Test void refundsAreCumulativeAndMonotone() {
        boolean[] all={true,true,true};
        long[] current=RewardMath.allocate(100000,policy,all);
        current=RewardMath.refundTargets(100000,25000,policy,all,current);
        assertArrayEquals(new long[]{1500,900,600},current);
        current=RewardMath.refundTargets(100000,50000,policy,all,current);
        assertArrayEquals(new long[]{1000,600,400},current);
        assertArrayEquals(new long[]{0,0,0},RewardMath.refundTargets(100000,100000,policy,all,current));
    }
    @Test void randomizedCapsAndRefunds() {
        Random random=new Random(20260915L);
        for(int n=0;n<100000;n++) {
            long basis=random.nextLong(RewardPolicy.MAX_MONEY+1);
            boolean[] active={random.nextBoolean(),random.nextBoolean(),random.nextBoolean()};
            long[] award=RewardMath.allocate(basis,policy,active);
            assertTrue(Arrays.stream(award).sum()<=RewardMath.floorBps(basis,400));
            long refund=basis==0?0:random.nextLong(basis+1);
            long[] target=RewardMath.refundTargets(basis,refund,policy,active,award);
            assertTrue(Arrays.stream(target).sum()<=RewardMath.floorBps(basis-refund,400));
            for(int i=0;i<3;i++) assertTrue(target[i]>=0 && target[i]<=award[i]);
        }
    }
    @Test void rejectInvalidPolicyAndMoney() {
        assertThrows(ReferralProblem.class,()->new RewardPolicy(201,120,80,400,14,80000,40000,25000));
        assertThrows(ReferralProblem.class,()->RewardMath.allocate(-1,policy,new boolean[3]));
        assertThrows(ReferralProblem.class,()->RewardMath.refundTargets(100,101,policy,new boolean[3],new long[3]));
        assertArrayEquals(new long[]{20000000000L,12000000000L,8000000000L},RewardMath.allocate(RewardPolicy.MAX_MONEY,policy,new boolean[]{true,true,true}));
    }
    @Test void codesAreOpaqueUniqueAndValid() {
        HashSet<String> values=new HashSet<>();
        for(int n=0;n<10000;n++) { String value=ReferralCodes.generate(); assertTrue(ReferralCodes.valid(value)); assertTrue(values.add(value)); }
        assertFalse(ReferralCodes.valid("123")); assertFalse(ReferralCodes.valid("OOOOOOOOOOOOOOOO"));
    }
}
