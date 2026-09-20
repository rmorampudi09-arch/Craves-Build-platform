-- Reviewed sandbox provenance only. No payment/refund mutation or hold release.
CREATE FUNCTION payment_schema.refund_source_context(refund_uuid UUID)
RETURNS JSONB LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
   'refund', jsonb_build_array(r.id,r.payment_order_id,r.provider,r.cashfree_order_id,
     r.provider_order_id,r.provider_payment_id,r.refund_ref,r.provider_refund_id,r.cf_refund_id,
     r.amount,r.currency,r.checkout_id,r.customer_identity_id,r.chef_sub_order_id,
     r.request_event_id,r.idempotency_key,r.dispatch_protocol),
   'payment', jsonb_build_array(p.id,p.provider,p.cashfree_order_id,p.cashfree_cf_order_id,
     p.provider_order_id,p.provider_payment_id,p.checkout_key_id,p.amount,p.currency,
     p.status,p.checkout_id,p.customer_identity_id),
   'successfulAttempts', coalesce((SELECT jsonb_agg(jsonb_build_array(
       a.cf_payment_id,a.provider_payment_id,a.payment_amount,a.payment_currency)
       ORDER BY a.id)
     FROM payment_schema.payment_attempt a WHERE a.payment_order_id=p.id
       AND a.provider='CASHFREE' AND a.payment_status='SUCCESS'), '[]'::jsonb))
 FROM payment_schema.refund r JOIN payment_schema.payment_order p ON p.id=r.payment_order_id
 WHERE r.id=refund_uuid;
$$;

CREATE TABLE payment_schema.refund_sandbox_context_review (
 id UUID PRIMARY KEY,
 refund_id UUID NOT NULL REFERENCES payment_schema.refund(id),
 source_context JSONB NOT NULL,
 source_sha256 CHAR(64) NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'
   AND source_sha256=encode(sha256(convert_to(source_context::text,'UTF8')),'hex')),
 proof_kind VARCHAR(32) NOT NULL CHECK(proof_kind IN ('SANDBOX_REFUND','SANDBOX_ORDER_REFUND_UNKNOWN')),
 verified_payment_id VARCHAR(160) NOT NULL CHECK(length(trim(verified_payment_id))>0),
 provider_origin TEXT NOT NULL CHECK(provider_origin='https://sandbox.cashfree.com'),
 credential_reference TEXT NOT NULL CHECK(credential_reference='craves-integration-cashfree-sandbox-client-id'),
 evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=32768),
 evidence_sha256 CHAR(64) NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'
   AND evidence_sha256=encode(sha256(convert_to(evidence::text,'UTF8')),'hex')),
 observed_at TIMESTAMPTZ NOT NULL,
 reviewed_by TEXT NOT NULL DEFAULT session_user,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 20 AND 1000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(refund_id,source_sha256)
);
REVOKE ALL ON payment_schema.refund_sandbox_context_review FROM PUBLIC;

CREATE FUNCTION payment_schema.validate_refund_sandbox_review()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r payment_schema.refund%ROWTYPE; p payment_schema.payment_order%ROWTYPE;
        matched INTEGER; distinct_payments INTEGER; bad_attempts INTEGER; e JSONB;
BEGIN
 SELECT * INTO STRICT r FROM payment_schema.refund WHERE id=NEW.refund_id FOR UPDATE;
 SELECT * INTO STRICT p FROM payment_schema.payment_order WHERE id=r.payment_order_id FOR SHARE;
 IF r.provider<>'CASHFREE' OR p.provider<>'CASHFREE' OR p.status<>'PAID'
    OR nullif(trim(p.checkout_key_id),'') IS NOT NULL OR r.dispatch_protocol IS NOT NULL
    OR r.status='PROCESSING' OR r.lock_token IS NOT NULL
    OR r.checkout_id IS DISTINCT FROM p.checkout_id
    OR r.customer_identity_id IS DISTINCT FROM p.customer_identity_id
    OR r.cashfree_order_id IS DISTINCT FROM p.cashfree_order_id
    OR r.provider_order_id IS DISTINCT FROM p.cashfree_order_id
    OR p.provider_order_id IS DISTINCT FROM p.cashfree_order_id
    OR r.currency IS DISTINCT FROM p.currency OR r.amount<=0 OR r.amount>p.amount
    OR (p.provider_payment_id IS DISTINCT FROM p.cashfree_cf_order_id
        AND p.provider_payment_id IS DISTINCT FROM NEW.verified_payment_id)
    OR (r.provider_payment_id IS NOT NULL AND r.provider_payment_id IS DISTINCT FROM p.cashfree_cf_order_id
        AND r.provider_payment_id IS DISTINCT FROM NEW.verified_payment_id)
    OR NEW.source_context IS DISTINCT FROM payment_schema.refund_source_context(r.id)
    OR NEW.observed_at<greatest(r.created_at,p.created_at)
    OR NEW.observed_at>now()+interval '5 minutes' THEN
   RAISE EXCEPTION 'Sandbox review does not match original Cashfree context' USING ERRCODE='23514';
 END IF;
 SELECT count(DISTINCT a.cf_payment_id), count(*) FILTER(WHERE a.cf_payment_id=NEW.verified_payment_id),
   count(*) FILTER(WHERE a.payment_amount IS DISTINCT FROM p.amount
     OR a.payment_currency IS DISTINCT FROM p.currency OR nullif(trim(a.cf_payment_id),'') IS NULL
     OR (a.provider_payment_id IS NOT NULL AND a.provider_payment_id IS DISTINCT FROM a.cf_payment_id))
 INTO distinct_payments,matched,bad_attempts FROM payment_schema.payment_attempt a
 WHERE a.payment_order_id=p.id AND a.provider='CASHFREE' AND a.payment_status='SUCCESS';
 IF distinct_payments<>1 OR matched<1 OR bad_attempts>0 THEN
   RAISE EXCEPTION 'One matching original successful payment is required' USING ERRCODE='23514';
 END IF;
 e:=NEW.evidence;
 IF NEW.proof_kind='SANDBOX_REFUND' THEN
   IF (e->>'entity'='refund'
       AND e->>'order_id'=r.cashfree_order_id AND e->>'refund_id'=r.refund_ref
       AND e->>'cf_payment_id'=NEW.verified_payment_id
       AND e->>'cf_refund_id'=r.provider_refund_id
       AND (e->>'refund_amount')::numeric=r.amount AND e->>'refund_currency'=r.currency
       AND e->>'refund_status' IN ('SUCCESS','FAILED','PENDING','ONHOLD','PROCESSING','CANCELLED')) IS NOT TRUE THEN
     RAISE EXCEPTION 'Sandbox refund evidence differs' USING ERRCODE='23514';
   END IF;
 ELSE
   IF (nullif(trim(r.provider_refund_id),'') IS NULL
       AND e->>'order_id'=r.cashfree_order_id AND e->>'cf_order_id'=p.cashfree_cf_order_id
       AND (e->>'order_amount')::numeric=p.amount AND e->>'order_currency'=p.currency
       AND e->>'order_status'='PAID') IS NOT TRUE THEN
     RAISE EXCEPTION 'Sandbox order evidence differs; refund outcome remains unknown' USING ERRCODE='23514';
   END IF;
 END IF;
 NEW.reviewed_by:=session_user;
 RETURN NEW;
END;$$;
CREATE TRIGGER refund_sandbox_review_validate BEFORE INSERT ON payment_schema.refund_sandbox_context_review
 FOR EACH ROW EXECUTE FUNCTION payment_schema.validate_refund_sandbox_review();
CREATE TRIGGER refund_sandbox_review_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.refund_sandbox_context_review
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.refund_verified_cashfree_sandbox(refund_uuid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM payment_schema.refund_sandbox_context_review v
   WHERE v.refund_id=refund_uuid
     AND v.source_context=payment_schema.refund_source_context(refund_uuid));
$$;
COMMENT ON TABLE payment_schema.refund_sandbox_context_review IS
 'Append-only operator-reviewed sandbox provenance. Context drift invalidates classification. Not a refund result, paid credit, hold release or permission to recreate a request. No rows are automatically classified.';
