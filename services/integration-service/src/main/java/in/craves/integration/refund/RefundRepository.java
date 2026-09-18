package in.craves.integration.refund;

import in.craves.integration.refund.RefundModels.ProviderRefundResult;
import in.craves.integration.refund.RefundModels.RefundWorkItem;
import in.craves.integration.refund.RefundStatusEventFactory.SerializedRefundStatusEvent;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class RefundRepository {
    private final JdbcTemplate jdbcTemplate;
    private final RefundStatusEventFactory statusEventFactory;
    private in.craves.integration.referrals.checkout.ReferralRefundService referralRefunds;
    @org.springframework.beans.factory.annotation.Autowired(required=false)
    public void setReferralRefunds(in.craves.integration.referrals.checkout.ReferralRefundService service){this.referralRefunds=service;}

    public RefundRepository(JdbcTemplate jdbcTemplate, RefundStatusEventFactory statusEventFactory) {
        this.jdbcTemplate = jdbcTemplate;
        this.statusEventFactory = statusEventFactory;
    }

    @Transactional
    public List<RefundWorkItem> claimBatch(boolean createEnabled, boolean reconciliationEnabled,
        int batchSize, int maxAttempts, int staleLockSeconds, UUID lockToken,
        String provider, String environment) {
        // A claim carries its action. Reconciliation never infers a create from a missing ID.
        var parameters=new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
            .addValue("create",createEnabled).addValue("reconcile",reconciliationEnabled)
            .addValue("batch",Math.min(batchSize,20)).addValue("attempts",maxAttempts)
            .addValue("stale",staleLockSeconds).addValue("token",lockToken)
            .addValue("provider",provider).addValue("environment",environment);
        return new org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate(jdbcTemplate).query("""
            WITH candidates AS (
              SELECT r.id,r.status AS prior_status,
                encode(sha256(convert_to(coalesce(r.last_error,''),'UTF8')),'hex') AS prior_error_sha256,
                CASE WHEN NULLIF(btrim(r.provider_refund_id),'') IS NOT NULL THEN 'GET'
                     WHEN :create AND p.status='PAID' AND NOT r.recovery_required AND r.attempt_count<:attempts
                       AND r.next_attempt_at<=now() AND
                       ((r.status IN ('REQUESTED','PROCESSING') AND r.attempt_count=0 AND r.dispatch_protocol IS NULL)
                         OR (r.dispatch_protocol='RAZORPAY_REFUND_IDEMPOTENCY_V1' AND r.status IN ('RETRY','PROCESSING'))) THEN 'CREATE'
                     ELSE 'LOOKUP' END AS work_kind
              FROM payment_schema.refund r
              JOIN payment_schema.payment_order p ON p.id=r.payment_order_id
              WHERE r.provider=:provider AND r.provider='RAZORPAY' AND p.provider=r.provider
                AND p.provider_order_id=r.provider_order_id AND p.provider_payment_id=r.provider_payment_id
                AND p.checkout_id=r.checkout_id AND p.customer_identity_id=r.customer_identity_id
                AND p.currency=r.currency AND r.currency='INR' AND r.amount<=p.amount AND r.amount>0
                AND r.chef_sub_order_id IS NOT NULL AND r.request_event_id IS NOT NULL AND r.idempotency_key IS NOT NULL
                AND ((:environment='PRODUCTION' AND left(p.checkout_key_id,9)='rzp_live_')
                  OR (:environment='SANDBOX' AND left(p.checkout_key_id,9)='rzp_test_'))
                AND (r.status<>'PROCESSING' OR r.locked_at<now()-(:stale*interval '1 second'))
                AND (
                  (:create AND p.status='PAID' AND NOT r.recovery_required AND r.provider_refund_id IS NULL
                    AND r.attempt_count<:attempts AND r.next_attempt_at<=now()
                    AND ((r.status IN ('REQUESTED','PROCESSING') AND r.attempt_count=0 AND r.dispatch_protocol IS NULL)
                      OR (r.dispatch_protocol='RAZORPAY_REFUND_IDEMPOTENCY_V1' AND r.status IN ('RETRY','PROCESSING'))))
                  OR (:reconcile AND r.consecutive_reconciliation_failures<:attempts AND r.next_reconciliation_at<=now()
                    AND r.status IN ('PENDING','ONHOLD','RETRY','PROCESSING','DEAD_LETTER')
                    AND (NULLIF(btrim(r.provider_refund_id),'') IS NOT NULL OR r.attempt_count>0))
                )
              ORDER BY r.next_reconciliation_at,r.created_at FOR UPDATE OF r SKIP LOCKED LIMIT :batch
            )
            UPDATE payment_schema.refund r SET status='PROCESSING',
              reconciliation_attempt_count=r.reconciliation_attempt_count+CASE WHEN c.work_kind<>'CREATE' THEN 1 ELSE 0 END,
              lock_token=:token,locked_at=now(),updated_at=now()
            FROM candidates c WHERE r.id=c.id RETURNING r.*,c.work_kind,c.prior_status,c.prior_error_sha256
            """,parameters,this::mapWorkItem);
    }

    public boolean hasUnknownHistoricalExposure(String environment) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM payment_schema.refund r LEFT JOIN payment_schema.payment_order p ON p.id=r.payment_order_id
              WHERE ((r.attempt_count>0 AND NULLIF(btrim(r.provider_refund_id),'') IS NULL AND r.dispatch_protocol IS NULL)
                OR r.recovery_required OR r.status='DEAD_LETTER'
                OR (r.status NOT IN ('SUCCESS','FAILED','CANCELLED') AND
                  (r.provider<>'RAZORPAY' OR p.id IS NULL OR p.provider IS DISTINCT FROM r.provider
                   OR p.provider_payment_id IS DISTINCT FROM r.provider_payment_id
                   OR p.provider_order_id IS DISTINCT FROM r.provider_order_id
                   OR p.checkout_id IS DISTINCT FROM r.checkout_id OR p.customer_identity_id IS DISTINCT FROM r.customer_identity_id
                   OR p.currency IS DISTINCT FROM r.currency OR r.amount>p.amount
                   OR coalesce(left(p.checkout_key_id,9),'')<>CASE WHEN ?='PRODUCTION' THEN 'rzp_live_' ELSE 'rzp_test_' END)))
              AND NOT (?='PRODUCTION' AND r.provider='RAZORPAY' AND p.provider=r.provider
                AND coalesce(left(p.checkout_key_id,9),'')='rzp_test_')
              AND NOT (?='PRODUCTION' AND payment_schema.refund_verified_cashfree_sandbox(r.id)) %s)
            """.formatted(referralRefunds==null?"":"AND NOT (r.provider='REFERRAL_WALLET' AND r.amount=0 AND EXISTS(SELECT 1 FROM payment_schema.referral_refund_allocation a JOIN payment_schema.referral_funding_capture f ON f.checkout_id=a.checkout_id WHERE a.chef_order_id=r.chef_sub_order_id AND a.checkout_id=r.checkout_id AND a.gateway_paise=0 AND f.payment_order_id=r.payment_order_id AND f.gateway_paise=0))"),Boolean.class,environment,environment,environment));
    }

    @Transactional
    public PreparedDispatch prepareDispatch(RefundWorkItem item,String body) {
        String digest=RazorpayRefundClient.hash(body);
        if (!"CREATE".equals(item.workKind()))
            throw new RazorpayRefundClient.RefundEvidenceException("DURABLE_DISPATCH_REQUIRED");
        if (RazorpayRefundClient.PROTOCOL.equals(item.dispatchProtocol())) {
            if (!body.equals(item.dispatchRequestBody()) || !digest.equals(item.dispatchRequestSha256()))
                throw new RazorpayRefundClient.RefundEvidenceException("INVALID_PROVIDER_EVIDENCE");
            int renewed=jdbcTemplate.update("""
                UPDATE payment_schema.refund SET locked_at=now(),attempt_count=attempt_count+1,updated_at=now()
                WHERE id=? AND status='PROCESSING' AND lock_token=? AND provider_refund_id IS NULL
                  AND NOT recovery_required AND attempt_count=? AND dispatch_protocol=?
                  AND dispatch_request_body=? AND dispatch_request_sha256=?
                """,item.refundId(),item.lockToken(),item.attemptCount(),RazorpayRefundClient.PROTOCOL,body,digest);
            if(renewed!=1)throw new RazorpayRefundClient.RefundEvidenceException("STALE_REFUND_CLAIM");
            return new PreparedDispatch(item.dispatchRequestBody(),item.dispatchRequestSha256());
        }
        if (!java.util.Set.of("REQUESTED","PROCESSING").contains(item.priorStatus()) || item.attemptCount()!=0)
            throw new RazorpayRefundClient.RefundEvidenceException("DURABLE_DISPATCH_REQUIRED");
        int changed=jdbcTemplate.update("""
            UPDATE payment_schema.refund SET dispatch_protocol=?,dispatch_request_body=?,
              dispatch_request_sha256=?,dispatch_started_at=now(),attempt_count=1,locked_at=now(),updated_at=now()
            WHERE id=? AND status='PROCESSING' AND lock_token=? AND attempt_count=0
              AND NOT recovery_required AND provider_refund_id IS NULL AND dispatch_protocol IS NULL
            """,RazorpayRefundClient.PROTOCOL,body,digest,item.refundId(),item.lockToken());
        if(changed!=1)throw new RazorpayRefundClient.RefundEvidenceException("STALE_REFUND_CLAIM");
        return new PreparedDispatch(body,digest);
    }

    public record PreparedDispatch(String body,String sha256) {}

    /** A batch reservation is not a provider attempt. Defer without resetting dispatch history. */
    @Transactional
    public boolean deferUnsentClaim(RefundWorkItem item,Instant nextAttemptAt,Instant now) {
        if(!"CREATE".equals(item.workKind()))return false;
        int updated=jdbcTemplate.update("""
            UPDATE payment_schema.refund SET status=CASE WHEN dispatch_protocol IS NULL THEN 'REQUESTED' ELSE 'RETRY' END,
              next_attempt_at=?,lock_token=NULL,locked_at=NULL,updated_at=now()
            WHERE id=? AND status='PROCESSING' AND lock_token=? AND attempt_count=? AND provider_refund_id IS NULL
              AND ((dispatch_protocol IS NULL AND attempt_count=0) OR dispatch_protocol=?)
            """,Timestamp.from(nextAttemptAt),item.refundId(),item.lockToken(),item.attemptCount(),RazorpayRefundClient.PROTOCOL);
        if(updated!=1)return false;
        recordObservation(item,"DISPATCH_DEFERRED",null,null,RazorpayRefundClient.hash("DISPATCH_DEFERRED"),now);
        return true;
    }

    @Transactional
    public boolean applyProviderResult(
        RefundWorkItem workItem,
        ProviderRefundResult providerResult,
        String databaseStatus,
        String normalizedStatus,
        Instant nextAttemptAt,
        Instant occurredAt
    ) {
        int updated = jdbcTemplate.update(
            """
                UPDATE payment_schema.refund
                SET status = ?,
                    provider_status = ?,
                    cf_refund_id = COALESCE(?, cf_refund_id),
                    provider_refund_id = COALESCE(?, provider_refund_id),
                    provider_payload = CAST(? AS jsonb),
                    recovery_required = false,
                    consecutive_reconciliation_failures = 0,
                    next_attempt_at = ?,
                    next_reconciliation_at = ?,
                    processed_at = CASE WHEN ? IN ('SUCCESS', 'FAILED', 'CANCELLED') THEN ? ELSE processed_at END,
                    lock_token = NULL,
                    locked_at = NULL,
                    last_error = CASE WHEN ?='DEAD_LETTER' THEN last_error ELSE NULL END,
                    updated_at = now()
                WHERE id = ?
                  AND status = 'PROCESSING'
                  AND lock_token = ?
                """,
            databaseStatus,
            providerResult.providerStatus(),
            providerResult.cfRefundId(),
            providerResult.cfRefundId(),
            providerResult.providerPayload(),
            Timestamp.from(nextAttemptAt),
            Timestamp.from(nextAttemptAt),
            databaseStatus,
            Timestamp.from(occurredAt),
            workItem.priorStatus(),
            workItem.refundId(),
            workItem.lockToken()
        );
        if (updated != 1) {
            return false;
        }

        recordObservation(workItem,"VERIFIED_RESULT",providerResult.cfRefundId(),providerResult.providerStatus(),
            RazorpayRefundClient.hash(providerResult.providerPayload()),occurredAt);
        var event=statusEventFactory.create(workItem,normalizedStatus,providerResult,occurredAt);
        // A verified recovery can correct an earlier published failure without rewriting it.
        insertStatusOutbox(new SerializedRefundStatusEvent(event.eventId(),event.eventType(),event.eventVersion(),
            event.occurredAt(),event.correlationId(),event.causationId(),event.subject(),event.payloadJson(),
            event.eventKey()+":"+RazorpayRefundClient.hash(providerResult.providerPayload()).substring(0,24)));
        return true;
    }

    @Transactional
    public boolean markUnknown(RefundWorkItem item,Instant nextAttemptAt,String kind,
        boolean safeIdempotentRetry,Instant now) {
        String status=safeIdempotentRetry?"RETRY":("DEAD_LETTER".equals(item.priorStatus())?"DEAD_LETTER":"ONHOLD");
        int updated=jdbcTemplate.update("""
            UPDATE payment_schema.refund SET status=?,recovery_required=?,next_attempt_at=?,next_reconciliation_at=?,
              consecutive_reconciliation_failures=consecutive_reconciliation_failures+CASE WHEN ?='CREATE' THEN 0 ELSE 1 END,
              lock_token=NULL,locked_at=NULL,last_error=CASE WHEN ?='DEAD_LETTER' THEN last_error ELSE ? END,updated_at=now()
            WHERE id=? AND status='PROCESSING' AND lock_token=?
            """,status,!safeIdempotentRetry,Timestamp.from(nextAttemptAt),Timestamp.from(nextAttemptAt),
            item.workKind(),item.priorStatus(),kind,item.refundId(),item.lockToken());
        if(updated!=1)return false;
        recordObservation(item,kind,null,null,RazorpayRefundClient.hash(kind),now);
        // An unknown outcome is not a provider failure. No false terminal event is emitted.
        return true;
    }

    private void recordObservation(RefundWorkItem item,String kind,String providerRefundId,String providerStatus,
        String evidenceSha256,Instant now) {
        jdbcTemplate.update("""
            INSERT INTO payment_schema.refund_recovery_observation
              (id,refund_id,claim_token,observation_kind,prior_status,prior_attempt_count,prior_provider_refund_id,prior_error_sha256,
               verified_provider_refund_id,verified_provider_status,evidence_sha256,observed_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(refund_id,claim_token) DO NOTHING
            """,UUID.randomUUID(),item.refundId(),item.lockToken(),kind,item.priorStatus(),
            item.attemptCount(),
            item.providerRefundId(),item.priorErrorSha256(),providerRefundId,providerStatus,evidenceSha256,Timestamp.from(now));
    }

    private void insertStatusOutbox(SerializedRefundStatusEvent event) {
        if(referralRefunds!=null){event=referralRefunds.customerEvent(event);if(event==null)return;}
        jdbcTemplate.update(
            """
                INSERT INTO payment_schema.refund_status_outbox (
                    id, event_key, aggregate_id, event_type, event_version,
                    correlation_id, causation_id, subject, payload,
                    status, attempt_count, next_attempt_at, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, CAST(? AS jsonb),
                    'PENDING', 0, now(), now(), now()
                )
                ON CONFLICT (event_key) DO NOTHING
                """,
            event.eventId(),
            event.eventKey(),
            event.subject(),
            event.eventType(),
            event.eventVersion(),
            event.correlationId(),
            event.causationId(),
            event.subject(),
            event.payloadJson()
        );
    }

    @Transactional
    public List<RefundStatusOutboxRecord> claimStatusOutbox(
        int batchSize,
        int maxAttempts,
        int staleLockSeconds,
        UUID lockToken
    ) {
        return jdbcTemplate.query(
            """
                WITH candidates AS (
                    SELECT id
                    FROM payment_schema.refund_status_outbox
                    WHERE attempt_count < ?
                      AND (
                          (status IN ('PENDING', 'FAILED') AND next_attempt_at <= now())
                          OR (status = 'PROCESSING' AND locked_at < now() - (? * INTERVAL '1 second'))
                      )
                    ORDER BY created_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT ?
                )
                UPDATE payment_schema.refund_status_outbox outbox
                SET status = 'PROCESSING',
                    attempt_count = outbox.attempt_count + 1,
                    lock_token = ?,
                    locked_at = now(),
                    updated_at = now()
                FROM candidates
                WHERE outbox.id = candidates.id
                RETURNING outbox.*
                """,
            this::mapOutbox,
            maxAttempts,
            staleLockSeconds,
            batchSize,
            lockToken
        );
    }

    public boolean markStatusPublished(UUID id, UUID lockToken, String brokerMessageId) {
        return jdbcTemplate.update(
            """
                UPDATE payment_schema.refund_status_outbox
                SET status = 'PUBLISHED', broker_message_id = ?, published_at = now(),
                    lock_token = NULL, locked_at = NULL, last_error = NULL, updated_at = now()
                WHERE id = ? AND status = 'PROCESSING' AND lock_token = ?
                """,
            brokerMessageId,
            id,
            lockToken
        ) == 1;
    }

    public boolean markStatusPublishFailed(
        RefundStatusOutboxRecord record,
        UUID lockToken,
        int maxAttempts,
        Instant nextAttemptAt,
        String error
    ) {
        String status = record.attemptCount() >= maxAttempts ? "DEAD_LETTER" : "FAILED";
        return jdbcTemplate.update(
            """
                UPDATE payment_schema.refund_status_outbox
                SET status = ?, next_attempt_at = ?, lock_token = NULL,
                    locked_at = NULL, last_error = ?, updated_at = now()
                WHERE id = ? AND status = 'PROCESSING' AND lock_token = ?
                """,
            status,
            Timestamp.from(nextAttemptAt),
            safeError(error),
            record.id(),
            lockToken
        ) == 1;
    }

    private RefundWorkItem mapWorkItem(ResultSet resultSet, int rowNumber) throws SQLException {
        return new RefundWorkItem(
            resultSet.getObject("id", UUID.class),
            resultSet.getObject("payment_order_id", UUID.class),
            resultSet.getObject("checkout_id", UUID.class),
            resultSet.getObject("chef_sub_order_id", UUID.class),
            resultSet.getObject("customer_identity_id", UUID.class),
            resultSet.getObject("request_event_id", UUID.class),
            resultSet.getString("cashfree_order_id"),
            resultSet.getString("refund_ref"),
            resultSet.getObject("idempotency_key", UUID.class),
            resultSet.getBigDecimal("amount"),
            resultSet.getString("currency"),
            resultSet.getString("reason"),
            resultSet.getString("status"),
            resultSet.getString("provider_status"),
            resultSet.getString("cf_refund_id"),
            resultSet.getInt("attempt_count"),
            resultSet.getObject("lock_token", UUID.class),
            resultSet.getString("provider"),
            resultSet.getString("provider_order_id"),
            resultSet.getString("provider_payment_id"),
            resultSet.getString("provider_refund_id"),
            resultSet.getString("work_kind"), resultSet.getString("prior_status"),
            resultSet.getString("dispatch_protocol"),resultSet.getString("dispatch_request_body"),
            resultSet.getString("dispatch_request_sha256"),resultSet.getInt("reconciliation_attempt_count"),
            resultSet.getInt("consecutive_reconciliation_failures"),
            resultSet.getString("prior_error_sha256")
        );
    }

    private RefundStatusOutboxRecord mapOutbox(ResultSet resultSet, int rowNumber) throws SQLException {
        return new RefundStatusOutboxRecord(
            resultSet.getObject("id", UUID.class),
            resultSet.getString("event_type"),
            resultSet.getString("event_version"),
            resultSet.getObject("correlation_id", UUID.class),
            resultSet.getObject("subject", UUID.class),
            resultSet.getString("payload"),
            resultSet.getInt("attempt_count")
        );
    }

    private static String safeError(String error) {
        if (error == null || error.isBlank()) {
            return "Unknown refund failure";
        }
        String normalized = error.replace('\n', ' ').replace('\r', ' ').trim();
        return normalized.length() > 2000 ? normalized.substring(0, 2000) : normalized;
    }

    public record RefundStatusOutboxRecord(
        UUID id,
        String eventType,
        String eventVersion,
        UUID correlationId,
        UUID subject,
        String payloadJson,
        int attemptCount
    ) {
    }
}