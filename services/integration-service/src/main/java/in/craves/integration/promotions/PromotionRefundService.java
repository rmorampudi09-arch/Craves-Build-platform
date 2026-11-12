package in.craves.integration.promotions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.refund.RefundModels.RefundRequestedData;
import in.craves.integration.refund.RefundRequestService.RefundNonRetryableException;
import in.craves.integration.refund.RefundStatusEventFactory.SerializedRefundStatusEvent;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * M24a slice 3b: a refund of a promotion checkout returns only the cash the customer paid for that chef order.
 * The frozen discount is shared across the checkout's chef orders pro rata to their quoted customer totals
 * (integer paise, ordered by chef-order id, remainder on the last); a refund of r out of a chef order's gross g
 * returns floor(r * net / g) to the provider, so the cash refunded for a checkout never exceeds what was collected.
 * Order-service still sees the amount it asked for in every status event. Always on for frozen checkouts, whatever the switch says.
 */
@Service
public class PromotionRefundService {
    private final JdbcTemplate db;
    private final ObjectMapper json;

    public PromotionRefundService(JdbcTemplate db, ObjectMapper json) { this.db = db; this.json = json; }

    /** Provider refund amount for a requested chef-order refund; the requested amount when the checkout has no frozen promotion. */
    public BigDecimal allocate(RefundRequestedData data, BigDecimal requested) {
        var rows = db.queryForList("SELECT buyer_id,gross_paise,discount_paise FROM payment_schema.promotion_checkout_funding WHERE checkout_id=?", data.checkoutId());
        if (rows.isEmpty()) return requested;
        var f = rows.getFirst();
        if (!data.customerIdentityId().equals(f.get("buyer_id"))) throw new RefundNonRetryableException("Refund customer does not match the promotion checkout");
        long gross = ((Number) f.get("gross_paise")).longValue(), discount = ((Number) f.get("discount_paise")).longValue();
        var lines = new LinkedHashMap<UUID, Long>();
        long total = 0;
        for (var s : db.queryForList("SELECT s->>'chefOrderId' AS id,s->>'customerTotal' AS total FROM payment_schema.finance_checkout_quote q CROSS JOIN LATERAL jsonb_array_elements(q.response->'snapshots') s WHERE q.checkout_id=?", data.checkoutId())) {
            long paise = LedgerMoney.parse(String.valueOf(s.get("total"))).movePointRight(2).longValueExact();
            if (paise <= 0 || lines.put(UUID.fromString(String.valueOf(s.get("id"))), paise) != null) throw new RefundNonRetryableException("Promotion checkout quote is invalid");
            total = Math.addExact(total, paise);
        }
        if (total != gross || !lines.containsKey(data.chefSubOrderId())) throw new RefundNonRetryableException("Promotion checkout quote does not match the frozen funding");
        long line = lines.get(data.chefSubOrderId());
        long share = shares(discount, lines).get(data.chefSubOrderId());
        long asked = requested.movePointRight(2).longValueExact();
        if (asked <= 0 || asked > line) throw new RefundNonRetryableException("Refund exceeds the chef order's original total");
        long cash = BigInteger.valueOf(asked).multiply(BigInteger.valueOf(line - share)).divide(BigInteger.valueOf(line)).longValueExact();
        if (cash <= 0) throw new RefundNonRetryableException("The promotion share leaves nothing to refund to the customer");
        return BigDecimal.valueOf(cash, 2);
    }

    /** Status events keep the amount order-service requested (it refuses any other); the provider amount stays on the refund row. */
    public SerializedRefundStatusEvent customerEvent(SerializedRefundStatusEvent event) {
        var asked = db.queryForList("SELECT r.request_event_payload->'data'->>'refundAmount' AS asked FROM payment_schema.refund r JOIN payment_schema.promotion_checkout_funding f ON f.checkout_id=r.checkout_id WHERE r.chef_sub_order_id=?", event.subject());
        if (asked.isEmpty() || asked.getFirst().get("asked") == null) return event;
        try {
            var payload = (ObjectNode) json.readTree(event.payloadJson());
            ((ObjectNode) payload.path("data")).put("refundAmount", new BigDecimal(asked.getFirst().get("asked").toString()).setScale(2, java.math.RoundingMode.HALF_UP));
            return new SerializedRefundStatusEvent(event.eventId(), event.eventType(), event.eventVersion(), event.occurredAt(), event.correlationId(), event.causationId(), event.subject(), payload.toString(), event.eventKey());
        } catch (Exception e) {
            throw new IllegalStateException("Invalid refund status event", e);
        }
    }

    static Map<UUID, Long> shares(long amount, Map<UUID, Long> weights) {
        var ids = new ArrayList<>(weights.keySet());
        ids.sort(Comparator.comparing(UUID::toString));
        long total = 0;
        for (long w : weights.values()) total = Math.addExact(total, w);
        var result = new LinkedHashMap<UUID, Long>();
        long cumulative = 0, prior = 0;
        for (var id : ids) {
            cumulative = Math.addExact(cumulative, weights.get(id));
            long next = BigInteger.valueOf(amount).multiply(BigInteger.valueOf(cumulative)).divide(BigInteger.valueOf(total)).longValueExact();
            result.put(id, next - prior);
            prior = next;
        }
        return result;
    }
}
