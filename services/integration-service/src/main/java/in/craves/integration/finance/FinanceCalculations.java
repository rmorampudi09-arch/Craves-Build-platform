package in.craves.integration.finance;

import in.craves.integration.ledger.LedgerMoney;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Pure calculations shared by preview and future binding checkout integration. No external calls. */
public final class FinanceCalculations {
    private FinanceCalculations() {}
    public record ChefAmounts(String gross,String serviceFee,String serviceFeeTax,String payable) {}
    public record Tax(String base,String rate,String amount) {}
    public record MealQuote(String occurrenceId,String chefFoodBase,String customerFoodPrice,String deliveryEstimate) {}
    public record PricedMeal(String occurrenceId,ChefAmounts chef,Tax food,Tax delivery,Tax platform,
        String platformAllocation,String total) {}
    public record SubscriptionQuote(List<PricedMeal> occurrences,String total,boolean taxIncludedInTotal,
        boolean breakdownRequiredBeforePayment,boolean simulation,String notice) {}
    public enum CancellationCause { CUSTOMER_REQUEST, CHEF_REJECTED, CHEF_ACCEPTANCE_TIMEOUT, PROVIDER_ORDER_CANCELLED }
    public record CancellationContext(Instant placedAt,Instant acceptedAt,Instant deliveredAt,
        boolean finalOrderCancelled,boolean trustedSystemCause) {}
    public record RefundDecision(boolean allowed,boolean fullRemainingCapturedAmount,String code) {}

    public static BigDecimal percent(BigDecimal base,String rate) {
        return base.multiply(new BigDecimal(FinancePolicy.rate(rate))).movePointLeft(2).setScale(2,RoundingMode.HALF_UP);
    }
    public static ChefAmounts chef(String grossText,FinancePolicy policy) {
        BigDecimal gross=LedgerMoney.parse(grossText), advertised=percent(gross,policy.chefFeePercent());
        if(policy.chefFeeTaxTreatment()==FinancePolicy.FeeTaxTreatment.UNCONFIRMED)
            throw new IllegalStateException("Commission GST treatment is not approved; customer GST does not resolve it");
        BigDecimal fee=advertised,tax;
        if(policy.chefFeeTaxTreatment()==FinancePolicy.FeeTaxTreatment.INCLUSIVE) {
            fee=advertised.multiply(new BigDecimal("100")).divide(new BigDecimal("100").add(new BigDecimal(policy.chefFeeGstPercent())),2,RoundingMode.HALF_UP);
            tax=advertised.subtract(fee);
        } else tax=percent(fee,policy.chefFeeGstPercent());
        BigDecimal net=gross.subtract(fee).subtract(tax);
        if(net.signum()<0) throw new IllegalArgumentException("Fee and its GST exceed chef gross");
        return new ChefAmounts(LedgerMoney.text(gross),LedgerMoney.text(fee),LedgerMoney.text(tax),LedgerMoney.text(net));
    }
    public static Tax tax(BigDecimal base,String rate) {
        return new Tax(LedgerMoney.text(base),FinancePolicy.rate(rate),LedgerMoney.text(percent(base,rate)));
    }
    /** Explicit per-occurrence chef quotes: never divide a subscription invoice by an assumed meal count. */
    public static SubscriptionQuote subscription(List<MealQuote> meals,FinancePolicy policy) {
        if(meals==null || meals.isEmpty() || meals.size()>500) throw new IllegalArgumentException("Provide 1 to 500 priced occurrences");
        var ids=new HashSet<String>();var weights=new LinkedHashMap<String,BigDecimal>();
        for(var meal:meals) {
            if(meal==null || meal.occurrenceId()==null || !meal.occurrenceId().matches("[A-Za-z0-9_-]{1,100}") || !ids.add(meal.occurrenceId()))
                throw new IllegalArgumentException("Each subscription occurrence needs a unique stable identifier");
            BigDecimal base=LedgerMoney.parse(meal.chefFoodBase()),customer=LedgerMoney.parse(meal.customerFoodPrice());
            LedgerMoney.parse(meal.deliveryEstimate());
            if(customer.compareTo(base)<0) throw new IllegalArgumentException("Discount funding must be explicit, not hidden in the chef quote");
            weights.put(meal.occurrenceId(),base);
        }
        Map<String,BigDecimal> platform=LedgerMoney.allocate(LedgerMoney.parse(policy.platformFee()),weights);
        BigDecimal platformTaxTotal=percent(LedgerMoney.parse(policy.platformFee()),policy.platformGstPercent());
        Map<String,BigDecimal> platformTaxes=LedgerMoney.allocate(platformTaxTotal,platform);
        var results=new ArrayList<PricedMeal>();BigDecimal total=LedgerMoney.ZERO;
        for(var meal:meals) {
            var food=tax(LedgerMoney.parse(meal.customerFoodPrice()),policy.restaurantGstPercent());
            var delivery=tax(LedgerMoney.parse(meal.deliveryEstimate()),policy.deliveryGstPercent());
            var allocated=platform.get(meal.occurrenceId());
            var platformTax=new Tax(LedgerMoney.text(allocated),policy.platformGstPercent(),LedgerMoney.text(platformTaxes.get(meal.occurrenceId())));
            BigDecimal value=LedgerMoney.parse(food.base()).add(LedgerMoney.parse(food.amount()))
                .add(LedgerMoney.parse(delivery.base())).add(LedgerMoney.parse(delivery.amount()))
                .add(allocated).add(LedgerMoney.parse(platformTax.amount()));
            results.add(new PricedMeal(meal.occurrenceId(),chef(meal.chefFoodBase(),policy),food,delivery,platformTax,
                LedgerMoney.text(allocated),LedgerMoney.text(value)));
            total=total.add(value);
        }
        return new SubscriptionQuote(List.copyOf(results),LedgerMoney.text(total),true,true,true,
            "Preview only. Provider delivery estimates and chef occurrences must be validated and frozen at acceptance. Unfulfilled meals are not payable; a total-only card must retain a pre-payment breakdown.");
    }
    public static RefundDecision cancellation(CancellationContext context,CancellationCause cause,Instant now,FinancePolicy policy) {
        Objects.requireNonNull(context);Objects.requireNonNull(context.placedAt());Objects.requireNonNull(now);Objects.requireNonNull(cause);
        if(now.isBefore(context.placedAt())) return new RefundDecision(false,false,"INVALID_CLOCK");
        if(context.deliveredAt()!=null) return new RefundDecision(false,false,"FULFILLED_ORDER_REQUIRES_SUPPORT_REVIEW");
        if(cause==CancellationCause.CUSTOMER_REQUEST) {
            boolean inWindow=now.isBefore(context.placedAt().plusSeconds(policy.customerCancellationSeconds()));
            return new RefundDecision(inWindow,inWindow,inWindow?"FULL_REFUND_WITHIN_WINDOW":"SELF_SERVICE_WINDOW_CLOSED");
        }
        if(!context.trustedSystemCause() || !context.finalOrderCancelled()) return new RefundDecision(false,false,"AUTHORITATIVE_ORDER_CANCELLATION_REQUIRED");
        if(cause==CancellationCause.CHEF_ACCEPTANCE_TIMEOUT && context.acceptedAt()!=null)
            return new RefundDecision(false,false,"CHEF_ALREADY_ACCEPTED");
        return new RefundDecision(true,true,"FULL_REFUND_SYSTEM_CANCELLATION");
    }
    public static String remainingRefund(String captured,String succeeded,String pending) {
        BigDecimal available=LedgerMoney.parse(captured).subtract(LedgerMoney.parse(succeeded)).subtract(LedgerMoney.parse(pending));
        if(available.signum()<0) throw new IllegalStateException("Refund reservations already exceed captured funds");
        return LedgerMoney.text(available);
    }
}
