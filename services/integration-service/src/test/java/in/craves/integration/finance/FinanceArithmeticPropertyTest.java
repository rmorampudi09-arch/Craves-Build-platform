package in.craves.integration.finance;

import in.craves.integration.ledger.LedgerMoney;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Random;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class FinanceArithmeticPropertyTest {
    @Test void tenThousandDeterministicFeeExamplesConserveEveryPaise() {
        var random=new Random(20260914);
        var inclusive=FinanceCalculationsTest.policy(FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0");
        var exclusive=FinanceCalculationsTest.policy(FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0");
        for(int n=0;n<10000;n++) {
            var gross=BigDecimal.valueOf(random.nextLong(100_000_000L),2);
            for(var policy:new FinancePolicy[]{inclusive,exclusive}) {
                var result=FinanceCalculations.chef(gross.toPlainString(),policy);
                var fee=new BigDecimal(result.serviceFee());var tax=new BigDecimal(result.serviceFeeTax());var net=new BigDecimal(result.payable());
                assertEquals(gross,fee.add(tax).add(net));assertTrue(net.signum()>=0);
                if(policy.chefFeeTaxTreatment()==FinancePolicy.FeeTaxTreatment.INCLUSIVE)
                    assertEquals(gross.multiply(new BigDecimal("0.07")).setScale(2,RoundingMode.HALF_UP),fee.add(tax));
            }
        }
    }
    @Test void tenThousandDeterministicAllocationsPreserveCheckoutTotal() {
        var random=new Random(20260915);
        for(int n=0;n<10000;n++) {
            var weights=new LinkedHashMap<String,BigDecimal>();int count=random.nextInt(1,30);
            for(int i=0;i<count;i++)weights.put("chef-"+i,BigDecimal.valueOf(random.nextLong(1,1_000_000),2));
            var total=BigDecimal.valueOf(random.nextLong(1_000_000),2);var allocations=LedgerMoney.allocate(total,weights);
            assertEquals(total,allocations.values().stream().reduce(LedgerMoney.ZERO,BigDecimal::add));
            assertTrue(allocations.values().stream().allMatch(value->value.signum()>=0 && value.scale()==2));
            assertEquals(allocations,LedgerMoney.allocate(total,new java.util.TreeMap<>(weights)));
        }
    }
}
