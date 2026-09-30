package in.craves.integration.finance;

import in.craves.integration.ledger.LedgerMoney;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Objects;

/** Complete versioned commercial settings. A saved policy is not provider or tax certification. */
public record FinancePolicy(LocalDate ledgerStartDate, boolean ledgerEnabled,
    boolean automaticPayoutsEnabled, boolean manualWithdrawalsEnabled,
    int automaticPayoutDelayHours, int manualAvailabilityDelayHours,
    int customerCancellationSeconds, String chefFeePercent,
    String restaurantGstPercent, String deliveryGstPercent, String platformGstPercent,
    String chefFeeGstPercent, FeeTaxTreatment chefFeeTaxTreatment,
    String platformFee, boolean subscriptionQuotesEnabled, String taxApprovalReference,
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) DeliveryTariff deliveryTariff) {
    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");
    public enum FeeTaxTreatment { UNCONFIRMED, INCLUSIVE, EXCLUSIVE }

    /** Historical policies and callers keep their original flat-delivery semantics. */
    public FinancePolicy(LocalDate ledgerStartDate, boolean ledgerEnabled, boolean automaticPayoutsEnabled,
        boolean manualWithdrawalsEnabled, int automaticPayoutDelayHours, int manualAvailabilityDelayHours,
        int customerCancellationSeconds, String chefFeePercent, String restaurantGstPercent,
        String deliveryGstPercent, String platformGstPercent, String chefFeeGstPercent,
        FeeTaxTreatment chefFeeTaxTreatment, String platformFee, boolean subscriptionQuotesEnabled, String taxApprovalReference) {
        this(ledgerStartDate, ledgerEnabled, automaticPayoutsEnabled, manualWithdrawalsEnabled,
            automaticPayoutDelayHours, manualAvailabilityDelayHours, customerCancellationSeconds, chefFeePercent,
            restaurantGstPercent, deliveryGstPercent, platformGstPercent, chefFeeGstPercent, chefFeeTaxTreatment,
            platformFee, subscriptionQuotesEnabled, taxApprovalReference, null);
    }

    public FinancePolicy {
        Objects.requireNonNull(ledgerStartDate,"ledger start date is required");
        Objects.requireNonNull(chefFeeTaxTreatment,"chef fee tax treatment is required");
        if (automaticPayoutDelayHours < 1 || automaticPayoutDelayHours > 720)
            throw new IllegalArgumentException("automatic payout delay must be 1 to 720 hours");
        if (manualAvailabilityDelayHours < 0 || manualAvailabilityDelayHours > automaticPayoutDelayHours)
            throw new IllegalArgumentException("manual availability must be between zero and automatic delay");
        if (customerCancellationSeconds < 1 || customerCancellationSeconds > 3600)
            throw new IllegalArgumentException("cancellation window must be 1 to 3600 seconds");
        chefFeePercent=rate(chefFeePercent); restaurantGstPercent=rate(restaurantGstPercent);
        deliveryGstPercent=rate(deliveryGstPercent); platformGstPercent=rate(platformGstPercent);
        chefFeeGstPercent=rate(chefFeeGstPercent); platformFee=LedgerMoney.text(LedgerMoney.parse(platformFee));
        if (taxApprovalReference!=null) {
            taxApprovalReference=taxApprovalReference.trim();
            if(taxApprovalReference.isEmpty() || taxApprovalReference.length()>240)
                throw new IllegalArgumentException("invalid tax approval reference");
        }
        if ((automaticPayoutsEnabled || manualWithdrawalsEnabled) && !ledgerEnabled)
            throw new IllegalArgumentException("payouts require the ledger");
        if (ledgerEnabled && (taxApprovalReference==null || chefFeeTaxTreatment==FeeTaxTreatment.UNCONFIRMED))
            throw new IllegalArgumentException("tax classification and commission treatment must be approved before posting");
    }
    public static FinancePolicy launchDraft() {
        return new FinancePolicy(LocalDate.of(2026,9,14),false,false,false,48,0,60,
            "7","5","18","18","18",FeeTaxTreatment.UNCONFIRMED,"0.00",false,null);
    }
    public Instant startInstant() {return ledgerStartDate.atStartOfDay(ZONE).toInstant();}
    public boolean inScope(Instant acceptedAt) {return !acceptedAt.isBefore(startInstant());}
    public Instant automaticDueAt(Instant deliveredAt) {return deliveredAt.plusSeconds(automaticPayoutDelayHours*3600L);}
    public Instant manualAvailableAt(Instant deliveredAt) {return deliveredAt.plusSeconds(manualAvailabilityDelayHours*3600L);}
    public static String rate(String value) {
        if(value==null || !value.matches("[0-9]{1,3}(\\.[0-9]{1,6})?"))
            throw new IllegalArgumentException("rate must be a decimal string");
        var n=new BigDecimal(value);
        if(n.compareTo(new BigDecimal("100"))>0) throw new IllegalArgumentException("rate cannot exceed 100 percent");
        return n.stripTrailingZeros().toPlainString();
    }
}
