package in.craves.integration.finance;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.junit.jupiter.api.Assertions.*;

class FinanceCalculationsTest {
    static FinancePolicy policy(FinancePolicy.FeeTaxTreatment treatment,String platform) {
        return new FinancePolicy(LocalDate.of(2026,9,14),false,false,false,48,0,60,"7","5","18","18","18",treatment,platform,true,"TEST-CLASSIFICATION-ONLY");
    }
    @Test void cutoverUsesIstNotUtcMidnight() {
        assertEquals(Instant.parse("2026-09-13T18:30:00Z"),FinancePolicy.launchDraft().startInstant());
        assertFalse(FinancePolicy.launchDraft().inScope(Instant.parse("2026-09-13T18:29:59.999Z")));
        assertTrue(FinancePolicy.launchDraft().inScope(Instant.parse("2026-09-13T18:30:00Z")));
    }
    @Test void dueAtIs48ElapsedHoursFromDeliveryNotBankTPlusTwo() {
        var delivered=Instant.parse("2026-09-14T10:11:12Z");var p=FinancePolicy.launchDraft();
        assertEquals(delivered.plusSeconds(172800),p.automaticDueAt(delivered));assertEquals(delivered,p.manualAvailableAt(delivered));
    }
    @ParameterizedTest @CsvSource({"369,25.83,4.65,338.52","738,51.66,9.30,677.04","1.50,0.11,0.02,1.37","0,0.00,0.00,0.00"})
    void exclusiveFeeGstIsNotCustomerFoodGst(String gross,String fee,String tax,String net) {
        var result=FinanceCalculations.chef(gross,policy(FinancePolicy.FeeTaxTreatment.EXCLUSIVE,"0"));
        assertEquals(fee,result.serviceFee());assertEquals(tax,result.serviceFeeTax());assertEquals(net,result.payable());
    }
    @Test void inclusiveFeeHasDifferentPayableAndNoDoubleTax() {
        var result=FinanceCalculations.chef("369",policy(FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0"));
        assertEquals("21.89",result.serviceFee());assertEquals("3.94",result.serviceFeeTax());assertEquals("343.17",result.payable());
    }
    @Test void unconfirmedTaxCannotSilentlyBecomeZero() {
        assertThrows(IllegalStateException.class,()->FinanceCalculations.chef("369",FinancePolicy.launchDraft()));
    }
    @Test void subscriptionUsesExplicitOccurrencesAndOnePlatformFee() {
        var result=FinanceCalculations.subscription(List.of(new FinanceCalculations.MealQuote("meal-a","369","395","39"),new FinanceCalculations.MealQuote("meal-b","369","395","39")),policy(FinancePolicy.FeeTaxTreatment.INCLUSIVE,"3.00"));
        // 2 * (395 + 19.75 food GST + 39 + 7.02 delivery GST) + 3 + 0.54 platform GST.
        assertEquals("925.08",result.total());assertEquals("1.50",result.occurrences().getFirst().platformAllocation());
        assertEquals("343.17",result.occurrences().getFirst().chef().payable());assertTrue(result.breakdownRequiredBeforePayment());assertTrue(result.simulation());
    }
    @Test void platformTaxAndChargeAllocateWithoutLosingPaise() {
        var result=FinanceCalculations.subscription(List.of(new FinanceCalculations.MealQuote("a","1","1","0"),new FinanceCalculations.MealQuote("b","1","1","0"),new FinanceCalculations.MealQuote("c","1","1","0")),policy(FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0.03"));
        assertEquals("3.19",result.total());
        assertEquals(new BigDecimal("0.01"),result.occurrences().stream().map(m->new BigDecimal(m.platform().amount())).reduce(BigDecimal.ZERO,BigDecimal::add));
    }
    @Test void duplicateOccurrenceOrHiddenDiscountRejected() {
        var meal=new FinanceCalculations.MealQuote("a","10","10","0");
        assertThrows(IllegalArgumentException.class,()->FinanceCalculations.subscription(List.of(meal,meal),policy(FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0")));
        assertThrows(IllegalArgumentException.class,()->FinanceCalculations.subscription(List.of(new FinanceCalculations.MealQuote("a","10","9","0")),policy(FinancePolicy.FeeTaxTreatment.INCLUSIVE,"0")));
    }
    @ParameterizedTest @CsvSource({"0,true","59,true","60,false","61,false","3600,false"})
    void sixtySecondBoundaryIsServerEnforced(int seconds,boolean expected) {
        var at=Instant.parse("2026-09-14T00:00:00Z");var context=new FinanceCalculations.CancellationContext(at,at.plusSeconds(10),null,false,false);
        assertEquals(expected,FinanceCalculations.cancellation(context,FinanceCalculations.CancellationCause.CUSTOMER_REQUEST,at.plusSeconds(seconds),FinancePolicy.launchDraft()).allowed());
    }
    @Test void providerBookingCancellationIsNotFinalOrderFailure() {
        var at=Instant.parse("2026-09-14T00:00:00Z");var bookingOnly=new FinanceCalculations.CancellationContext(at,at,null,false,true);
        assertFalse(FinanceCalculations.cancellation(bookingOnly,FinanceCalculations.CancellationCause.PROVIDER_ORDER_CANCELLED,at.plusSeconds(300),FinancePolicy.launchDraft()).allowed());
        var failedOrder=new FinanceCalculations.CancellationContext(at,at,null,true,true);
        assertTrue(FinanceCalculations.cancellation(failedOrder,FinanceCalculations.CancellationCause.PROVIDER_ORDER_CANCELLED,at.plusSeconds(300),FinancePolicy.launchDraft()).fullRemainingCapturedAmount());
    }
    @Test void customerCannotClaimProviderReasonOrTimeoutAcceptedOrder() {
        var at=Instant.parse("2026-09-14T00:00:00Z");
        assertFalse(FinanceCalculations.cancellation(new FinanceCalculations.CancellationContext(at,null,null,true,false),FinanceCalculations.CancellationCause.PROVIDER_ORDER_CANCELLED,at.plusSeconds(90),FinancePolicy.launchDraft()).allowed());
        assertFalse(FinanceCalculations.cancellation(new FinanceCalculations.CancellationContext(at,at,null,true,true),FinanceCalculations.CancellationCause.CHEF_ACCEPTANCE_TIMEOUT,at.plusSeconds(90),FinancePolicy.launchDraft()).allowed());
    }
    @Test void fullRefundIncludesPendingReservationsAndCannotOverRefund() {
        assertEquals("80.00",FinanceCalculations.remainingRefund("100","10","10"));assertThrows(IllegalStateException.class,()->FinanceCalculations.remainingRefund("100","50","51"));
    }
}
