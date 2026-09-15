package in.craves.integration.pricing;

import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.security.CravesPrincipal;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Side-effect-free finance preview. This never selects a live order policy or writes a payable. */
@Service
public class ChefFeePreviewService {
    public record TierInput(String upperBound, String percentage) {}
    public record Request(String version, String currency, String mode, List<TierInput> tiers,
                          String ceiling, List<String> chefOrderGrossAmounts) {}
    public record Result(String chefOrderGross, String fee, String estimatedPayableBeforeTaxAndAdjustments) {}
    public record Response(boolean simulation, boolean activated, String policyVersion, String policyHash,
                           String basis, String currency, String rounding, List<Result> results, String notice) {}

    public Response preview(CravesPrincipal principal, Request request) {
        if (principal==null || principal.identityId()==null || !principal.hasAnyRole("PLATFORM_ADMIN","PAYMENTS_ADMIN"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Payments administration role is required");
        try {
            if(request==null || request.chefOrderGrossAmounts()==null || request.chefOrderGrossAmounts().isEmpty()
                || request.chefOrderGrossAmounts().size()>100 || request.tiers()==null || request.tiers().size()>50)
                throw new IllegalArgumentException("Provide 1 to 100 gross amounts and a bounded policy");
            var tiers=request.tiers().stream().map(t->{
                if(t==null || t.percentage()==null || !t.percentage().matches("[0-9]{1,3}(\\.[0-9]{1,6})?"))
                    throw new IllegalArgumentException("A decimal percentage is required");
                return new TieredPricingPolicy.Tier(t.upperBound()==null?null:LedgerMoney.parse(t.upperBound()),new BigDecimal(t.percentage()));
            }).toList();
            var policy=new TieredPricingPolicy(request.version(),TieredPricingPolicy.Purpose.CHEF_SERVICE_FEE,
                request.currency(),TieredPricingPolicy.Mode.valueOf(request.mode()),tiers,
                request.ceiling()==null?null:LedgerMoney.parse(request.ceiling()));
            var results=request.chefOrderGrossAmounts().stream().map(value->{
                BigDecimal gross=LedgerMoney.parse(value),fee=policy.calculate(gross);
                return new Result(LedgerMoney.text(gross),LedgerMoney.text(fee),LedgerMoney.text(gross.subtract(fee)));
            }).toList();
            return new Response(true,false,policy.version(),policy.hash(),"CHEF_ORDER_GROSS","INR","HALF_UP_2DP",results,
                "Simulation only. No rate was activated and no earning was created. Estimates exclude separately applicable fee tax, withholding and approved adjustments. Accepted orders must use their binding financial snapshots.");
        } catch(IllegalArgumentException | NullPointerException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid chef fee preview policy or exact-paise amount");
        }
    }
}
