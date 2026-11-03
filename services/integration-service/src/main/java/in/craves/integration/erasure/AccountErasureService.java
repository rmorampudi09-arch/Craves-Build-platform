package in.craves.integration.erasure;

import in.craves.integration.erasure.AccountErasureDtos.Blocker;
import in.craves.integration.erasure.AccountErasureDtos.ErasureResponse;
import in.craves.integration.erasure.AccountErasureDtos.Scope;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Account deletion. The ledger, payables, payout instructions and the encrypted bank details are legal records behind
 * immutability triggers and are never touched. CHEF erase therefore does nothing; only its blockers matter: staff
 * approve a chef deletion once nothing is payable, unfinished or on hold. CUSTOMER erase replaces the name, phone and
 * email Craves sent to the payment provider (kept in payment_order.request_payload); a payment order has no
 * immutability trigger, and its amounts, ids and owner stay as they are.
 */
@Service
public class AccountErasureService {
    static final String ERASED_NAME = "[deleted]";
    /** Never a partly visible number: digits that can not belong to anyone. */
    static final String ERASED_PHONE = "0000000000";
    static final String ERASED_EMAIL = "deleted@craves.invalid";
    private static final Logger LOGGER = LoggerFactory.getLogger(AccountErasureService.class);
    private static final String PAY = "payment_schema.";
    private static final String REFUND_OPEN = "'REQUESTED', 'PROCESSING', 'RETRY', 'PENDING', 'ONHOLD'";
    // PAID, FAILED, CANCELLED (a manual reservation never sent) and REVERSED (money back, so the payable is unpaid again) are final.
    private static final String PAYOUT_FINISHED = "'PAID', 'FAILED', 'REVERSED', 'CANCELLED'";
    /**
     * Cashfree keeps the person under customer_details, Razorpay under notes. A key is changed only when it is already
     * there (create_missing=false) and the section is an object, so an odd payload is left alone instead of failing the
     * whole erase. The update only touches rows that would change, so a second run counts zero.
     */
    private static final String SCRUB_PAYMENT_REQUESTS = """
        WITH details AS (
          SELECT id, CASE WHEN jsonb_typeof(request_payload -> 'customer_details') = 'object' THEN
            jsonb_set(jsonb_set(jsonb_set(request_payload,
              '{customer_details,customer_name}', to_jsonb(?::text), false),
              '{customer_details,customer_phone}', to_jsonb(?::text), false),
              '{customer_details,customer_email}', to_jsonb(?::text), false)
            ELSE request_payload END AS payload
          FROM payment_schema.payment_order
          WHERE customer_identity_id = ? AND jsonb_typeof(request_payload) = 'object'),
        scrubbed AS (
          SELECT id, CASE WHEN jsonb_typeof(payload -> 'notes') = 'object' THEN
            jsonb_set(payload, '{notes,customer_name}', to_jsonb(?::text), false) ELSE payload END AS payload
          FROM details)
        UPDATE payment_schema.payment_order p SET request_payload = s.payload
        FROM scrubbed s WHERE p.id = s.id AND p.request_payload IS DISTINCT FROM s.payload""";

    private final JdbcTemplate jdbc;

    public AccountErasureService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Blocker> blockers(UUID identityId, Scope scope) {
        List<Blocker> found = new ArrayList<>();
        if (scope != Scope.CHEF) {
            add(found, "REFUND_IN_FLIGHT", "%d refund(s) are still being paid back to the customer", count(
                "SELECT count(*) FROM " + PAY + "refund r WHERE r.status IN (" + REFUND_OPEN + ") AND (r.customer_identity_id = ? "
                    + "OR r.payment_order_id IN (SELECT id FROM " + PAY + "payment_order WHERE customer_identity_id = ?))",
                identityId, identityId));
        }
        if (scope != Scope.CUSTOMER) {
            add(found, "PAYABLE_UNPAID", "%d chef earning(s) are not paid out yet", count(
                "SELECT count(*) FROM " + PAY + "finance_payable p WHERE p.chef_identity_id = ? AND NOT EXISTS ("
                    + "SELECT 1 FROM " + PAY + "finance_payout_allocation a JOIN " + PAY + "finance_payout_instruction i ON i.id = a.instruction_id "
                    + "WHERE a.payable_id = p.id AND a.active AND i.status = 'PAID')", identityId));
            add(found, "PAYOUT_NOT_FINISHED", "%d payout(s) have not finished", count(
                "SELECT count(*) FROM " + PAY + "finance_payout_instruction WHERE chef_identity_id = ? AND status NOT IN (" + PAYOUT_FINISHED + ")",
                identityId));
            add(found, "PAYOUT_ON_HOLD", "Payouts are on hold for this chef", count(
                "SELECT count(*) FROM " + PAY + "finance_chef_payout_control WHERE chef_identity_id = ? AND on_hold", identityId));
            add(found, "SETTLEMENT_PENDING", "%d earning(s) are waiting for settlement", count(
                "SELECT count(*) FROM " + PAY + "chef_earning_entry WHERE chef_identity_id = ? AND status = 'SETTLEMENT_PENDING'", identityId));
            add(found, "REFERRAL_EARNING_UNPAID", "%d referral earning(s) are not paid out yet", count(
                "SELECT count(*) FROM " + PAY + "finance_referral_available WHERE chef_identity_id = ? AND amount > 0", identityId));
        }
        return found;
    }

    /** One transaction, blockers read first: either everything below happens or nothing does. */
    @Transactional
    public ErasureResponse erase(UUID identityId, Scope scope, UUID requestId) {
        List<Blocker> blockers = blockers(identityId, scope);
        if (!blockers.isEmpty()) {
            return ErasureResponse.blocked(blockers);
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        if (scope != Scope.CHEF) {
            counts.put("payment_order", jdbc.update(SCRUB_PAYMENT_REQUESTS, ERASED_NAME, ERASED_PHONE, ERASED_EMAIL, identityId, ERASED_NAME));
        }
        LOGGER.info("account erasure service=integration requestId={} scope={} counts={}", requestId, scope, counts);
        return ErasureResponse.done(counts);
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    private static void add(List<Blocker> found, String code, String detail, int count) {
        if (count > 0) {
            found.add(new Blocker(code, detail.contains("%d") ? detail.formatted(count) : detail));
        }
    }
}
