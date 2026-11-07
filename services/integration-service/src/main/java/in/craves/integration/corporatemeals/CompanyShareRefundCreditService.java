package in.craves.integration.corporatemeals;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.integration.config.WorkerSchedulingConfiguration;
import in.craves.integration.ledger.LedgerMoney;
import in.craves.integration.promotions.PromotionRefundService;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * M24d slice 3b-2: after a successful refund of a chef order of a company-share checkout, the company gets back its part of
 * that refund on its M10 statement. The part is floor(line share * refunded / line), where the line share is the frozen
 * company share split across the checkout's chef orders exactly as PromotionRefundService splits it, and "refunded" is the
 * amount order-service asked for. The row is written in the same transaction that records the refund's SUCCESS; a worker on
 * its own pool then calls M10's internal credit route with the Craves refund id as the idempotency key. Retries with backoff;
 * a 4xx other than 401/403/408/429 goes to REVIEW (staff), a 200 with amountPaise 0 means M10 holds nothing to credit
 * (the charge was released or voided for this checkout). Always on for frozen checkouts, whatever the switch says.
 */
@Service
public class CompanyShareRefundCreditService {
    private static final Logger log = LoggerFactory.getLogger(CompanyShareRefundCreditService.class);
    private static final Set<Integer> RETRYABLE_4XX = Set.of(401, 403, 408, 429);
    private static final long MAX_BACKOFF_SECONDS = 6 * 3600;
    private static final int MAX_NOT_CONFIRMED_ATTEMPTS = 10; // about 8.5 hours of backoff
    private static final int ALERT_AFTER_ATTEMPTS = 8;
    private final JdbcTemplate db;
    private final RestClient advanced;
    private final String secret;
    private final TransactionTemplate savepoint;

    @Autowired
    public CompanyShareRefundCreditService(JdbcTemplate db, PlatformTransactionManager transactions, RestClient.Builder builder,
                                           @Value("${CRAVES_ADVANCED_INTERNAL_BASE_URL:}") String baseUrl,
                                           @Value("${CRAVES_ADVANCED_INTERNAL_SECRET:}") String secret) {
        this.db = db;
        // NESTED = a savepoint inside the refund's transaction: a database error here rolls back only this row, never the refund's SUCCESS.
        this.savepoint = new TransactionTemplate(transactions);
        this.savepoint.setPropagationBehavior(TransactionDefinition.PROPAGATION_NESTED);
        this.secret = secret == null ? "" : secret;
        if (baseUrl == null || baseUrl.isBlank()) {
            this.advanced = null;
        } else {
            var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
            factory.setReadTimeout(Duration.ofSeconds(5));
            this.advanced = builder.clone().baseUrl(baseUrl).requestFactory(factory).build();
        }
    }

    /** Records the company's part of a successful refund. Bad data goes to REVIEW instead of throwing, so the refund's SUCCESS is still recorded. */
    public void enqueue(UUID refundId) {
        try {
            savepoint.executeWithoutResult(s -> record(refundId));
        } catch (RuntimeException e) {
            log.error("CRAVES_ALERT alert=COMPANY_SHARE_CREDIT_NOT_RECORDED refundId={}", refundId, e);
        }
    }

    private void record(UUID refundId) {
        {
            var refunds = db.queryForList("SELECT checkout_id,chef_sub_order_id,customer_identity_id,request_event_payload->'data'->>'refundAmount' AS asked FROM payment_schema.refund WHERE id=?", refundId);
            if (refunds.isEmpty() || refunds.getFirst().get("checkout_id") == null) return;
            var refund = refunds.getFirst();
            UUID checkout = (UUID) refund.get("checkout_id");
            var frozen = db.queryForList("SELECT buyer_id,charge_id,gross_paise,company_share_paise FROM payment_schema.company_share_checkout_funding WHERE checkout_id=?", checkout);
            if (frozen.isEmpty()) return;
            var f = frozen.getFirst();
            long credit;
            String problem = null;
            try {
                credit = companyPart(checkout, (UUID) refund.get("chef_sub_order_id"), ((Number) f.get("gross_paise")).longValue(),
                    ((Number) f.get("company_share_paise")).longValue(), String.valueOf(refund.get("asked")));
                if (!f.get("buyer_id").equals(refund.get("customer_identity_id"))) throw new IllegalStateException("Refund customer does not match the company-share checkout");
            } catch (RuntimeException e) {
                credit = 0;
                problem = text(e.getMessage());
            }
            if (problem == null && credit == 0) return; // a tiny refund whose company part rounds down to nothing
            db.update("INSERT INTO payment_schema.company_share_refund_credit(refund_id,checkout_id,charge_id,buyer_id,amount_paise,state,last_error) VALUES (?,?,?,?,?,?,?) ON CONFLICT (refund_id) DO NOTHING",
                refundId, checkout, f.get("charge_id"), f.get("buyer_id"), credit, problem == null ? "PENDING" : "REVIEW", problem);
            if (problem != null) log.warn("CRAVES_ALERT alert=COMPANY_SHARE_CREDIT_REVIEW refundId={} reason={}", refundId, problem);
        }
    }

    long companyPart(UUID checkout, UUID chefOrder, long gross, long share, String asked) {
        var lines = new LinkedHashMap<UUID, Long>();
        long total = 0;
        for (var s : db.queryForList("SELECT s->>'chefOrderId' AS id,s->>'customerTotal' AS total FROM payment_schema.finance_checkout_quote q CROSS JOIN LATERAL jsonb_array_elements(q.response->'snapshots') s WHERE q.checkout_id=?", checkout)) {
            long paise = LedgerMoney.parse(String.valueOf(s.get("total"))).movePointRight(2).longValueExact();
            if (paise <= 0 || lines.put(UUID.fromString(String.valueOf(s.get("id"))), paise) != null) throw new IllegalStateException("Company-share checkout quote is invalid");
            total = Math.addExact(total, paise);
        }
        if (total != gross || chefOrder == null || !lines.containsKey(chefOrder)) throw new IllegalStateException("Company-share checkout quote does not match the frozen funding");
        long line = lines.get(chefOrder);
        long lineShare = PromotionRefundService.shares(share, lines).get(chefOrder);
        long refunded = new BigDecimal(asked).setScale(2, java.math.RoundingMode.HALF_UP).movePointRight(2).longValueExact(); // as RefundRequestService rounds it
        if (refunded <= 0 || refunded > line) throw new IllegalStateException("Refund exceeds the chef order's original total");
        return BigInteger.valueOf(lineShare).multiply(BigInteger.valueOf(refunded)).divide(BigInteger.valueOf(line)).longValueExact();
    }

    @Scheduled(scheduler = WorkerSchedulingConfiguration.COMPANY_SHARE_SCHEDULER, fixedDelayString = "${CRAVES_COMPANY_SHARE_CREDIT_POLL_MS:30000}")
    public void tick() {
        for (int i = 0; i < 20; i++) {
            try {
                if (!runOne()) return;
            } catch (RuntimeException e) {
                log.warn("Company share credit worker stopped this pass", e);
                return;
            }
        }
    }

    /** Sends one due credit; false when nothing is due or the advanced service is not configured. */
    boolean runOne() {
        if (advanced == null || secret.isBlank()) {
            if (Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM payment_schema.company_share_refund_credit WHERE state='PENDING' AND created_at<now()-interval '1 hour')", Boolean.class)))
                log.warn("CRAVES_ALERT alert=COMPANY_SHARE_CREDIT_STUCK reason=advanced service not configured (CRAVES_ADVANCED_INTERNAL_BASE_URL / CRAVES_ADVANCED_INTERNAL_SECRET)");
            return false;
        }
        // Lease the row for 5 minutes in one statement, so two replicas never send the same credit at once.
        var due = db.queryForList("""
            UPDATE payment_schema.company_share_refund_credit SET attempt_count=attempt_count+1,next_attempt_at=now()+interval '5 minutes',updated_at=now()
            WHERE refund_id=(SELECT refund_id FROM payment_schema.company_share_refund_credit WHERE state='PENDING' AND next_attempt_at<=now()
                             ORDER BY next_attempt_at,refund_id LIMIT 1 FOR UPDATE SKIP LOCKED)
            RETURNING refund_id,checkout_id,charge_id,buyer_id,amount_paise,attempt_count""");
        if (due.isEmpty()) return false;
        var row = due.getFirst();
        UUID refund = (UUID) row.get("refund_id");
        int attempt = ((Number) row.get("attempt_count")).intValue();
        long amount = ((Number) row.get("amount_paise")).longValue();
        try {
            JsonNode answer = advanced.post().uri("/internal/v1/corporate-meals/charges/{id}/credit", row.get("charge_id"))
                .header("X-Craves-Internal-Secret", secret)
                .body(Map.of("personId", row.get("buyer_id"), "orderId", row.get("checkout_id"), "refundId", refund, "amountPaise", amount))
                .retrieve().body(JsonNode.class);
            if (answer == null || !answer.path("amountPaise").canConvertToLong()) {
                retry(refund, attempt, "Invalid answer from the advanced service");
                return true;
            }
            long credited = answer.path("amountPaise").asLong();
            if (credited != 0 && credited != amount) {
                finish(refund, attempt, "REVIEW", credited, "Advanced service credited " + credited + " instead of " + amount);
                return true;
            }
            finish(refund, attempt, credited == 0 ? "NOTHING_OWED" : "CREDITED", credited, null);
        } catch (HttpStatusCodeException e) {
            int status = e.getStatusCode().value();
            // M10 answers 409 CHARGE_NOT_CONFIRMED while order-service's confirm is still on its way: retry for a while before staff look.
            boolean notConfirmedYet = status == 409 && e.getResponseBodyAsString().contains("CHARGE_NOT_CONFIRMED") && attempt < MAX_NOT_CONFIRMED_ATTEMPTS;
            if (status >= 400 && status < 500 && !RETRYABLE_4XX.contains(status) && !notConfirmedYet) {
                finish(refund, attempt, "REVIEW", null, "HTTP " + status + " " + e.getResponseBodyAsString());
            } else {
                retry(refund, attempt, "HTTP " + status);
            }
        } catch (RestClientException e) {
            retry(refund, attempt, e.getClass().getSimpleName());
        }
        return true;
    }

    private void finish(UUID refund, int attempt, String state, Long credited, String error) {
        db.update("UPDATE payment_schema.company_share_refund_credit SET state=?,credited_paise=?,last_error=?,updated_at=now() WHERE refund_id=? AND state='PENDING' AND attempt_count=?",
            state, credited, text(error), refund, attempt);
        if ("REVIEW".equals(state)) log.warn("CRAVES_ALERT alert=COMPANY_SHARE_CREDIT_REVIEW refundId={} reason={}", refund, text(error));
    }

    private void retry(UUID refund, int attempt, String error) {
        long delay = Math.min(MAX_BACKOFF_SECONDS, 30L << Math.min(attempt, 20));
        db.update("UPDATE payment_schema.company_share_refund_credit SET next_attempt_at=now()+make_interval(secs => ?),last_error=?,updated_at=now() WHERE refund_id=? AND state='PENDING' AND attempt_count=?",
            (double) delay, text(error), refund, attempt);
        if (attempt >= ALERT_AFTER_ATTEMPTS) log.warn("CRAVES_ALERT alert=COMPANY_SHARE_CREDIT_STUCK refundId={} attempts={} reason={}", refund, attempt, text(error));
    }

    private static String text(String value) {
        if (value == null) return null;
        String clean = value.replaceAll("[\\p{Cntrl}]", " ");
        return clean.length() > 300 ? clean.substring(0, 300) : clean;
    }
}
