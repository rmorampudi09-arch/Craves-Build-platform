-- Additive referral-only schema. This file is not automatically executed by application startup.
-- Evidence records are not bank transfers or approval of any payment.
ALTER TABLE referral_schema.reservation ADD COLUMN paid_at TIMESTAMPTZ;
CREATE TABLE referral_schema.payout_outcome (
 event_id UUID PRIMARY KEY, reservation_id UUID NOT NULL REFERENCES referral_schema.reservation(id), attempt_id UUID NOT NULL,
 outcome VARCHAR(20) NOT NULL CHECK(outcome IN ('PAID','UNKNOWN','PROVEN_FAILED')),
 source_hash VARCHAR(64) NOT NULL, evidence_ref VARCHAR(180) NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payout_outcome_attempt ON referral_schema.payout_outcome(attempt_id,recorded_at);
CREATE TABLE referral_schema.spend_refund (
 reservation_id UUID PRIMARY KEY REFERENCES referral_schema.reservation(id), refunded_paise BIGINT NOT NULL DEFAULT 0 CHECK(refunded_paise>=0),
 source_version INTEGER NOT NULL DEFAULT 0, source_hash VARCHAR(64)
);
CREATE TABLE referral_schema.operation_receipt (
 source VARCHAR(12) NOT NULL, operation_id UUID NOT NULL, operation_type VARCHAR(40) NOT NULL, payload_hash VARCHAR(64) NOT NULL,
 result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(source,operation_id)
);
CREATE TRIGGER payout_outcome_immutable BEFORE UPDATE OR DELETE ON referral_schema.payout_outcome FOR EACH ROW EXECUTE FUNCTION referral_schema.immutable();
CREATE TRIGGER payout_outcome_no_truncate BEFORE TRUNCATE ON referral_schema.payout_outcome FOR EACH STATEMENT EXECUTE FUNCTION referral_schema.immutable();
CREATE TRIGGER operation_receipt_immutable BEFORE UPDATE OR DELETE ON referral_schema.operation_receipt FOR EACH ROW EXECUTE FUNCTION referral_schema.immutable();
CREATE TRIGGER operation_receipt_no_truncate BEFORE TRUNCATE ON referral_schema.operation_receipt FOR EACH STATEMENT EXECUTE FUNCTION referral_schema.immutable();
CREATE FUNCTION referral_schema.spend_refund_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original bigint;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SPEND_REFUND_HISTORY_REQUIRED' USING ERRCODE='23514'; END IF;
 SELECT amount_paise INTO STRICT original FROM referral_schema.reservation WHERE id=NEW.reservation_id AND kind='SPEND' AND status='SPENT';
 IF NEW.reservation_id<>OLD.reservation_id OR NEW.refunded_paise<OLD.refunded_paise OR NEW.refunded_paise>original OR NEW.source_version<=OLD.source_version THEN
  RAISE EXCEPTION 'INVALID_SPEND_REFUND' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER spend_refund_guard BEFORE UPDATE OR DELETE ON referral_schema.spend_refund FOR EACH ROW EXECUTE FUNCTION referral_schema.spend_refund_guard();
REVOKE ALL ON ALL TABLES IN SCHEMA referral_schema FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA referral_schema FROM PUBLIC;
