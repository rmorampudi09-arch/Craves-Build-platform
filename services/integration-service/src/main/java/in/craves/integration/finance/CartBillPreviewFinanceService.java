package in.craves.integration.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.ledger.LedgerMoney;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Customer amounts only. No issued snapshots, orders, ledger postings or payment writes. */
@Service
public class CartBillPreviewFinanceService {
    public record Request(String foodSubtotal, String deliveryBeforeTax, String pickupStateCode,
        String dropoffStateCode, BigDecimal pickupLatitude, BigDecimal pickupLongitude,
        BigDecimal dropoffLatitude, BigDecimal dropoffLongitude) {}
    public record Response(UUID policyId, long policyRevision, String currency, String foodSubtotal,
        String platformFee, String deliveryFee, String taxAmount, String grandTotal) {}
    private record Policy(UUID id, long revision, FinancePolicy settings) {}
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public CartBillPreviewFinanceService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public Response preview(Request request) {
        Policy policy = jdbc.query("""
            SELECT h.policy_id,h.revision,v.payload::text FROM payment_schema.finance_policy_head h
            JOIN payment_schema.finance_policy_version v ON v.id=h.policy_id WHERE h.singleton=true
            """, (rs, n) -> new Policy(rs.getObject(1, UUID.class), rs.getLong(2), decode(rs.getString(3))))
            .stream().findFirst().orElseThrow(() -> new IllegalStateException("An active finance policy is required"));
        return calculate(request, policy.id(), policy.revision(), policy.settings(), Instant.now());
    }

    static Response calculate(Request request, UUID policyId, long revision, FinancePolicy policy, Instant now) {
        if (request == null || !"36".equals(request.pickupStateCode()) || !"36".equals(request.dropoffStateCode()))
            throw new IllegalArgumentException("Only the reviewed same-state Telangana jurisdiction is enabled");
        if (policyId == null || !policy.ledgerEnabled() || !policy.inScope(now))
            throw new IllegalStateException("An active in-scope finance policy is required");
        BigDecimal food = LedgerMoney.parse(request.foodSubtotal());
        BigDecimal delivery = LedgerMoney.parse(request.deliveryBeforeTax());
        if (policy.deliveryTariff() != null) {
            var quote = policy.deliveryTariff().between(request.pickupLatitude(), request.pickupLongitude(),
                request.dropoffLatitude(), request.dropoffLongitude(), policy.deliveryGstPercent());
            delivery = LedgerMoney.parse(quote.beforeTax());
        }
        BigDecimal platform = LedgerMoney.parse(policy.platformFee());
        BigDecimal tax = FinanceCalculations.percent(food, policy.restaurantGstPercent())
            .add(FinanceCalculations.percent(delivery, policy.deliveryGstPercent()))
            .add(FinanceCalculations.percent(platform, policy.platformGstPercent()));
        return new Response(policyId, revision, "INR", LedgerMoney.text(food), LedgerMoney.text(platform),
            LedgerMoney.text(delivery), LedgerMoney.text(tax), LedgerMoney.text(food.add(platform).add(delivery).add(tax)));
    }

    private FinancePolicy decode(String payload) {
        try { return json.readValue(payload, FinancePolicy.class); }
        catch (Exception ex) { throw new IllegalStateException("Active finance policy is invalid", ex); }
    }
}
