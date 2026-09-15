package in.craves.integration.ledger;

import in.craves.integration.pricing.TieredPricingPolicy;
import in.craves.integration.pricing.TieredPricingPolicy.Mode;
import in.craves.integration.pricing.TieredPricingPolicy.Purpose;
import in.craves.integration.pricing.TieredPricingPolicy.Tier;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.junit.jupiter.api.Assertions.*;

class LedgerMoneyAndPolicyTest {
    private static BigDecimal n(String value) { return new BigDecimal(value); }
    @ParameterizedTest
    @CsvSource({"369,25.83", "738,51.66", "1.50,0.11", "0,0.00", "200,14.00"})
    void flatChefSevenRoundsOnce(String base, String fee) {
        assertEquals(n(fee), TieredPricingPolicy.flatChefSeven().calculate(n(base)));
    }
    @Test void frozenPolicyDoesNotFollowAnotherVersion() {
        var original = TieredPricingPolicy.flatChefSeven().snapshot(n("369"));
        var later = new TieredPricingPolicy("chef-eight-v2", Purpose.CHEF_SERVICE_FEE, "INR", Mode.PROGRESSIVE,
            List.of(new Tier(null, n("8"))), null);
        assertEquals("25.83", original.commissionAmount());
        assertEquals(n("29.52"), later.calculate(n("369")));
        assertNotEquals(original.policyHash(), later.hash());
        assertEquals("CHEF_ORDER_GROSS", original.basis());
        assertThrows(UnsupportedOperationException.class, () -> original.policy().tiers().clear());
    }
    @ParameterizedTest
    @CsvSource({"149,11.92", "200,16.00", "369,26.14", "500,33.00", "699,42.95", "1000,50.00"})
    void customerProposalIsPerUnitAndCapped(String base, String uplift) {
        assertEquals(n(uplift), TieredPricingPolicy.proposedCustomerCeiling().calculate(n(base)));
    }
    @Test void progressiveBoundariesAndWholeAmountAreExplicit() {
        var tiers = List.of(new Tier(n("200"), n("7")), new Tier(n("400"), n("6")), new Tier(null, n("5")));
        var marginal = new TieredPricingPolicy("marginal-v1", Purpose.CHEF_SERVICE_FEE, "INR", Mode.PROGRESSIVE, tiers, n("50"));
        assertEquals(n("14.00"), marginal.calculate(n("200")));
        assertEquals(n("26.00"), marginal.calculate(n("400")));
        assertEquals(n("31.00"), marginal.calculate(n("500")));
        assertEquals(n("50.00"), marginal.calculate(n("5000")));
        var whole = new TieredPricingPolicy("whole-v1", Purpose.CHEF_SERVICE_FEE, "INR", Mode.WHOLE_AMOUNT_BAND, tiers, null);
        assertEquals(n("25.00"), whole.calculate(n("500")));
    }
    @Test void priceEndingsCannotExceedCeiling() {
        var policy = TieredPricingPolicy.proposedCustomerCeiling();
        assertEquals(n("395.00"), policy.publishWithinCeiling(n("369"), n("395")));
        assertThrows(IllegalArgumentException.class, () -> policy.publishWithinCeiling(n("369"), n("399")));
        assertThrows(IllegalArgumentException.class, () -> policy.publishWithinCeiling(n("369"), n("368")));
    }
    @Test void rejectsInvalidPolicy() {
        assertThrows(IllegalArgumentException.class, () -> new Tier(null, n("101")));
        assertThrows(IllegalArgumentException.class, () -> new Tier(null, n("-1")));
        assertThrows(IllegalArgumentException.class, () -> new TieredPricingPolicy("v1", Purpose.CHEF_SERVICE_FEE, "USD", Mode.PROGRESSIVE, List.of(new Tier(null,n("7"))),null));
        assertThrows(IllegalArgumentException.class, () -> new TieredPricingPolicy("", Purpose.CHEF_SERVICE_FEE, "INR", Mode.PROGRESSIVE, List.of(new Tier(null,n("7"))),null));
        assertThrows(IllegalArgumentException.class, () -> new TieredPricingPolicy("v1", Purpose.CHEF_SERVICE_FEE, "INR", Mode.PROGRESSIVE, List.of(new Tier(n("200"),n("7"))),null));
        assertThrows(IllegalArgumentException.class, () -> new TieredPricingPolicy("v1", Purpose.CHEF_SERVICE_FEE, "INR", Mode.PROGRESSIVE, List.of(new Tier(n("200"),n("7")),new Tier(n("100"),n("6")),new Tier(null,n("5"))),null));
        assertThrows(IllegalArgumentException.class, () -> new TieredPricingPolicy("v1", Purpose.CHEF_SERVICE_FEE, "INR", Mode.PROGRESSIVE, List.of(new Tier(null,n("7"))),n("0.001")));
    }
    @Test void exactMoneyRejectsRoundingAndBinaryInputs() {
        assertEquals("1.50", LedgerMoney.text(LedgerMoney.parse("1.5")));
        for (String invalid : List.of("0.001", "-1", "1e2", "NaN", "", " 1", "1.", "100000000000000"))
            assertThrows(IllegalArgumentException.class, () -> LedgerMoney.parse(invalid));
        assertThrows(IllegalArgumentException.class, () -> LedgerMoney.amount(n("0.001")));
    }
    @Test void allocationIsDeterministicAndConservesEveryPaise() {
        Map<String,BigDecimal> reversed = new LinkedHashMap<>();
        reversed.put("chef-c",n("1")); reversed.put("chef-b",n("1")); reversed.put("chef-a",n("1"));
        var result = LedgerMoney.allocate(n("1.00"), reversed);
        assertEquals(n("0.34"), result.get("chef-a"));
        assertEquals(n("0.33"), result.get("chef-b"));
        assertEquals(n("1.00"), result.values().stream().reduce(BigDecimal.ZERO,BigDecimal::add));
        assertEquals(n("0.00"), LedgerMoney.allocate(n("0"),Map.of("a",n("0"))).get("a"));
        assertThrows(IllegalArgumentException.class, () -> LedgerMoney.allocate(n("1"),Map.of("a",n("0"))));
    }
    @Test void normalFixtureBalancesAndHasSeparateRevenueComponents() {
        UUID chef = UUID.randomUUID();
        var lines = List.of(LedgerJournal.Line.debit("CUSTOMER_FUNDS",n("434"),chef),
            LedgerJournal.Line.credit("CHEF_PAYABLE",n("343.17"),chef),
            LedgerJournal.Line.credit("CHEF_FEE_REVENUE",n("25.83"),chef),
            LedgerJournal.Line.credit("CUSTOMER_UPLIFT_REVENUE",n("26"),chef),
            LedgerJournal.Line.credit("DELIVERY_REVENUE",n("39"),chef));
        assertNotNull(new LedgerJournal.Entry("chef-order/fixture/normal-earning/v1", UUID.randomUUID(), "order-service",
            "NORMAL_EARNING", UUID.randomUUID(), UUID.randomUUID(), "INR", Instant.parse("2026-09-13T12:00:00Z"),
            "snapshot/fixture", null,"SERVICE","order-service",lines));
        assertEquals(n("28.83"),n("26").add(n("25.83")).add(n("39")).subtract(n("52")).subtract(n("10")));
    }
    @Test void zeroOrUnbalancedLinesAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> LedgerJournal.Line.debit("BANK",n("0"),null));
        assertThrows(IllegalArgumentException.class, () -> new LedgerJournal.Entry("test/unbalanced", UUID.randomUUID(), "test",
            "TEST",null,null,"INR",Instant.now(),"test/evidence",null,"SERVICE","test",
            List.of(LedgerJournal.Line.debit("BANK",n("10"),null),LedgerJournal.Line.credit("CHEF_PAYABLE",n("9"),null))));
    }
}
