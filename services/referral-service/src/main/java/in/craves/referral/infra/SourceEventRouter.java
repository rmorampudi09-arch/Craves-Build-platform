package in.craves.referral.infra;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.referral.domain.OrderBindingService;
import in.craves.referral.domain.OrderLifecycleService;
import in.craves.referral.domain.PayoutEvidenceService;
import in.craves.referral.domain.ProgramService;
import in.craves.referral.domain.RecipientService;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import static in.craves.referral.ReferralProblem.require;

@Component
public class SourceEventRouter {
    public record Route(String source,String aggregateField) { }
    private static final Map<String,Route> ROUTES=Map.ofEntries(
        Map.entry("account.registered",new Route("auth","userId")),
        Map.entry("account.status",new Route("auth","userId")),
        Map.entry("order.bound",new Route("order","chefOrderId")),
        Map.entry("order.delivered",new Route("order","chefOrderId")),
        Map.entry("order.refunded",new Route("order","chefOrderId")),
        Map.entry("checkout.first_qualifying_delivered",new Route("order","checkoutId")),
        Map.entry("order.finance_confirmed",new Route("finance","chefOrderId")),
        Map.entry("recipient.assessed",new Route("finance","userId")),
        Map.entry("budget.funded",new Route("finance","fundingId")),
        Map.entry("payout.outcome",new Route("finance","reservationId")));
    private final ProgramService program;
    private final OrderBindingService binding;
    private final OrderLifecycleService lifecycle;
    private final RecipientService recipients;
    private final PayoutEvidenceService payouts;
    public SourceEventRouter(ProgramService program,OrderBindingService binding,OrderLifecycleService lifecycle,RecipientService recipients,PayoutEvidenceService payouts) {
        this.program=program; this.binding=binding; this.lifecycle=lifecycle; this.recipients=recipients; this.payouts=payouts;
    }
    public static void validate(String source,String type,UUID aggregate,JsonNode payload) {
        Route route=ROUTES.get(type);
        require(route!=null && route.source().equals(source),403,"SOURCE_EVENT_FORBIDDEN");
        require(aggregate.equals(Json.uuid(payload,route.aggregateField())),422,"EVENT_AGGREGATE_MISMATCH");
    }
    public void apply(String source,String type,UUID aggregate,JsonNode payload) {
        validate(source,type,aggregate,payload);
        switch(type) {
            case "account.registered" -> program.register(payload);
            case "account.status" -> program.status(payload);
            case "order.bound" -> binding.bind(payload);
            case "order.delivered" -> lifecycle.delivered(payload);
            case "order.refunded" -> lifecycle.refunded(payload);
            case "checkout.first_qualifying_delivered" -> binding.firstCheckout(payload);
            case "order.finance_confirmed" -> lifecycle.financeConfirmed(payload);
            case "recipient.assessed" -> recipients.assess(payload);
            case "budget.funded" -> recipients.fund(payload);
            case "payout.outcome" -> payouts.record(payload);
            default -> throw new IllegalStateException("Unknown validated source event");
        }
    }
}
