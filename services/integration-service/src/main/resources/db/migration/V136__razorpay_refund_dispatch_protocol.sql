-- Additive recovery/dispatch metadata. Historical outcomes and events are retained.
ALTER TABLE payment_schema.refund
 ADD COLUMN dispatch_protocol VARCHAR(64),
 ADD COLUMN dispatch_request_body TEXT,
 ADD COLUMN dispatch_request_sha256 CHAR(64),
 ADD COLUMN dispatch_started_at TIMESTAMPTZ,
 ADD COLUMN reconciliation_attempt_count INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN consecutive_reconciliation_failures INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN next_reconciliation_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 ADD COLUMN recovery_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE payment_schema.refund ADD CONSTRAINT ck_refund_dispatch_protocol
 CHECK ((dispatch_protocol IS NULL AND dispatch_request_body IS NULL AND dispatch_request_sha256 IS NULL AND dispatch_started_at IS NULL)
 OR (provider='RAZORPAY' AND dispatch_protocol IS NOT NULL AND dispatch_protocol='RAZORPAY_REFUND_IDEMPOTENCY_V1'
 AND dispatch_request_body IS NOT NULL AND octet_length(dispatch_request_body)<=4096
 AND dispatch_request_sha256 IS NOT NULL AND dispatch_request_sha256 ~ '^[a-f0-9]{64}$' AND dispatch_started_at IS NOT NULL
 AND dispatch_request_sha256=encode(sha256(convert_to(dispatch_request_body,'UTF8')),'hex')));
ALTER TABLE payment_schema.refund ADD CONSTRAINT ck_refund_reconciliation_attempts
 CHECK (reconciliation_attempt_count>=0 AND consecutive_reconciliation_failures>=0);

CREATE TABLE payment_schema.refund_recovery_observation (
 id UUID PRIMARY KEY,
 refund_id UUID NOT NULL REFERENCES payment_schema.refund(id),
 claim_token UUID NOT NULL,
 observation_kind VARCHAR(48) NOT NULL,
 prior_status VARCHAR(40) NOT NULL,
 prior_attempt_count INTEGER NOT NULL,
 prior_provider_refund_id VARCHAR(160),
 prior_error_sha256 CHAR(64),
 verified_provider_refund_id VARCHAR(160),
 verified_provider_status VARCHAR(40),
 evidence_sha256 CHAR(64) NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
 observed_at TIMESTAMPTZ NOT NULL,
 UNIQUE (refund_id,claim_token),
 CHECK (observation_kind IN ('VERIFIED_RESULT','UNKNOWN_OUTCOME','LOOKUP_NO_MATCH','LOOKUP_AMBIGUOUS',
 'INVALID_PROVIDER_EVIDENCE','RECONCILIATION_LIMIT','CREATE_REJECTED','CONFIGURATION_BLOCKED','DISPATCH_DEFERRED'))
);
CREATE INDEX ix_refund_recovery_observation ON payment_schema.refund_recovery_observation(refund_id,observed_at);

CREATE FUNCTION payment_schema.guard_refund_dispatch_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.dispatch_protocol IS NOT NULL OR EXISTS(SELECT 1 FROM payment_schema.refund_recovery_observation WHERE refund_id=OLD.id) THEN
   RAISE EXCEPTION 'Refund dispatch/recovery history cannot be deleted' USING ERRCODE='55000';
  END IF;
  RETURN OLD;
 END IF;
 IF OLD.dispatch_protocol IS NOT NULL THEN
  IF (NEW.dispatch_protocol,NEW.dispatch_request_body,NEW.dispatch_request_sha256,NEW.dispatch_started_at,
      NEW.payment_order_id,NEW.provider,NEW.provider_order_id,NEW.provider_payment_id,NEW.amount,NEW.currency,
      NEW.refund_ref,NEW.idempotency_key,NEW.request_event_id,NEW.checkout_id,NEW.chef_sub_order_id,NEW.customer_identity_id)
     IS DISTINCT FROM
     (OLD.dispatch_protocol,OLD.dispatch_request_body,OLD.dispatch_request_sha256,OLD.dispatch_started_at,
      OLD.payment_order_id,OLD.provider,OLD.provider_order_id,OLD.provider_payment_id,OLD.amount,OLD.currency,
      OLD.refund_ref,OLD.idempotency_key,OLD.request_event_id,OLD.checkout_id,OLD.chef_sub_order_id,OLD.customer_identity_id) THEN
   RAISE EXCEPTION 'Persisted refund dispatch must remain identical' USING ERRCODE='55000';
  END IF;
 ELSIF NEW.dispatch_protocol IS NOT NULL AND NOT
   (OLD.status='PROCESSING' AND OLD.attempt_count=0 AND NEW.attempt_count=1
    AND OLD.provider_refund_id IS NULL AND OLD.lock_token IS NOT NULL) THEN
  RAISE EXCEPTION 'Historical attempted refund cannot acquire a new dispatch protocol' USING ERRCODE='55000';
 END IF;
 IF OLD.provider_refund_id IS NOT NULL AND NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id THEN
  RAISE EXCEPTION 'Bound refund identity cannot be replaced' USING ERRCODE='55000';
 END IF;
 IF NEW.reconciliation_attempt_count<OLD.reconciliation_attempt_count THEN
  RAISE EXCEPTION 'Refund reconciliation attempt history cannot be reset' USING ERRCODE='55000';
 END IF;
 IF NEW.attempt_count<OLD.attempt_count THEN
  RAISE EXCEPTION 'Refund dispatch attempt history cannot be reset' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER refund_dispatch_history_guard BEFORE UPDATE OR DELETE ON payment_schema.refund
 FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_refund_dispatch_history();
CREATE TRIGGER refund_recovery_observation_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.refund_recovery_observation
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER refund_dispatch_no_truncate BEFORE TRUNCATE ON payment_schema.refund
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

COMMENT ON COLUMN payment_schema.refund.dispatch_protocol IS
 'Only durably prepared new requests may use Razorpay refund idempotency. NULL on all historical requests.';
COMMENT ON COLUMN payment_schema.refund.recovery_required IS
 'An unknown or conflicting outcome retains its reservation and financial hold; never proof of provider failure.';
COMMENT ON TABLE payment_schema.refund_recovery_observation IS
 'Append-only evidence of GET reconciliation or unknown dispatch. Existing outbox/inbox records are never rewritten.';
