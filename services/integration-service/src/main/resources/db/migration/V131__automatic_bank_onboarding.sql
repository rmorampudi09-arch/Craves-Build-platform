-- Bank validation is independent of commercial approval and existing payout/refund holds.
-- No bank details, live credentials, provider API calls or activation defaults are inserted here.
ALTER TABLE payment_schema.finance_beneficiary_version ALTER COLUMN verified_by DROP NOT NULL;
ALTER TABLE payment_schema.finance_beneficiary_version ADD COLUMN verification_actor_type VARCHAR(32) NOT NULL DEFAULT 'HUMAN';
ALTER TABLE payment_schema.finance_beneficiary_version ADD CONSTRAINT beneficiary_verification_actor CHECK (
 (verification_actor_type='HUMAN' AND verified_by IS NOT NULL)
 OR (verification_actor_type='RAZORPAY_VALIDATION' AND verified_by IS NULL)
);
CREATE TABLE payment_schema.finance_bank_request (
 id UUID PRIMARY KEY, chef_identity_id UUID NOT NULL, encrypted_details TEXT NOT NULL,
 fingerprint VARCHAR(110) NOT NULL, last_four CHAR(4) NOT NULL CHECK(last_four~'^[0-9]{4}$'),
 ifsc VARCHAR(11) NOT NULL CHECK(ifsc~'^[A-Z]{4}0[A-Z0-9]{6}$'), consent_version VARCHAR(80) NOT NULL,
 state VARCHAR(32) NOT NULL CHECK(state IN ('QUEUED','SUBMITTING','VALIDATING','UNKNOWN','WAITING_APPROVAL',
   'VERIFIED','VALIDATION_FAILED','NAME_MISMATCH','APPLICANT_ACTION_REQUIRED','SUPERSEDED')),
 validation_id VARCHAR(80) UNIQUE, fund_account_id VARCHAR(80), contact_id VARCHAR(80),
 beneficiary_id UUID REFERENCES payment_schema.finance_beneficiary_version(id),
 bank_validated BOOLEAN NOT NULL DEFAULT false, application_approved BOOLEAN NOT NULL DEFAULT false,
 verified_at TIMESTAMPTZ, lease_id UUID, lease_until TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0), next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_error VARCHAR(120), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(state<>'VERIFIED' OR (bank_validated AND application_approved AND beneficiary_id IS NOT NULL
   AND validation_id IS NOT NULL AND fund_account_id IS NOT NULL AND contact_id IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX finance_bank_due ON payment_schema.finance_bank_request(next_attempt_at,id)
 WHERE state IN ('QUEUED','SUBMITTING','VALIDATING','UNKNOWN','WAITING_APPROVAL','VERIFIED');
CREATE TABLE payment_schema.finance_bank_head (
 chef_identity_id UUID PRIMARY KEY, request_id UUID NOT NULL UNIQUE REFERENCES payment_schema.finance_bank_request(id)
);
CREATE TABLE payment_schema.finance_bank_submission_receipt (
 chef_identity_id UUID NOT NULL, request_key UUID NOT NULL,
 request_id UUID NOT NULL REFERENCES payment_schema.finance_bank_request(id),expected_current_id UUID,
 PRIMARY KEY(chef_identity_id,request_key)
);
CREATE TABLE payment_schema.finance_bank_evidence (
 id UUID PRIMARY KEY,request_id UUID NOT NULL REFERENCES payment_schema.finance_bank_request(id),
 validation_id VARCHAR(80) NOT NULL,fund_account_id VARCHAR(80) NOT NULL,contact_id VARCHAR(80) NOT NULL,
 result VARCHAR(32) NOT NULL,payload_hash CHAR(64) NOT NULL,observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX finance_bank_evidence_request ON payment_schema.finance_bank_evidence(request_id,observed_at DESC);
CREATE TABLE payment_schema.finance_bank_audit (
 id UUID PRIMARY KEY,request_id UUID NOT NULL REFERENCES payment_schema.finance_bank_request(id),
 chef_identity_id UUID NOT NULL,action VARCHAR(50) NOT NULL,actor_type VARCHAR(32) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER finance_bank_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_bank_submission_receipt
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER finance_bank_evidence_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_bank_evidence
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER finance_bank_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_bank_audit
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.guard_bank_request_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Bank enrollment history cannot be deleted by the application' USING ERRCODE='55000';END IF;
 IF ROW(NEW.id,NEW.chef_identity_id,NEW.encrypted_details,NEW.fingerprint,NEW.last_four,NEW.ifsc,NEW.consent_version,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.chef_identity_id,OLD.encrypted_details,OLD.fingerprint,OLD.last_four,OLD.ifsc,OLD.consent_version,OLD.created_at) THEN
  RAISE EXCEPTION 'Bank details are versioned; never rewrite an existing enrollment' USING ERRCODE='55000';END IF;
 IF OLD.validation_id IS NOT NULL AND NEW.validation_id IS DISTINCT FROM OLD.validation_id THEN
  RAISE EXCEPTION 'Original provider validation reference is immutable' USING ERRCODE='55000';END IF;
 IF OLD.beneficiary_id IS NOT NULL AND NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id THEN
  RAISE EXCEPTION 'Original beneficiary version is immutable' USING ERRCODE='55000';END IF;
 IF OLD.state='SUPERSEDED' AND NEW.state<>'SUPERSEDED' THEN
  RAISE EXCEPTION 'A superseded bank request cannot become current through a late response' USING ERRCODE='55000';END IF;
 IF NEW.state='VERIFIED' THEN
  IF NOT EXISTS(SELECT 1 FROM payment_schema.finance_bank_evidence e
    WHERE e.request_id=NEW.id AND e.validation_id=NEW.validation_id AND e.fund_account_id=NEW.fund_account_id
      AND e.contact_id=NEW.contact_id AND e.result='BANK_VALIDATED' AND e.observed_at>=now()-interval '24 hours') THEN
   RAISE EXCEPTION 'Automatic activation requires matching recent provider validation evidence' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END;$$;
CREATE TRIGGER finance_bank_history_guard BEFORE UPDATE OR DELETE ON payment_schema.finance_bank_request
 FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_bank_request_history();
CREATE TRIGGER finance_bank_no_truncate BEFORE TRUNCATE ON payment_schema.finance_bank_request
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.finance_bank_ready(chef UUID,beneficiary UUID) RETURNS BOOLEAN
 LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM payment_schema.finance_bank_head h WHERE h.chef_identity_id=chef)
 OR EXISTS(SELECT 1 FROM payment_schema.finance_bank_head h JOIN payment_schema.finance_bank_request r ON r.id=h.request_id
   WHERE h.chef_identity_id=chef AND r.chef_identity_id=chef AND r.state='VERIFIED'
     AND r.bank_validated AND r.application_approved AND r.beneficiary_id=beneficiary
     AND r.verified_at>now()-interval '24 hours');
$$;
CREATE FUNCTION payment_schema.guard_bank_payout_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.status='RESERVED') OR (TG_OP='UPDATE' AND OLD.status='RESERVED' AND NEW.status='SUBMITTING') THEN
  PERFORM 1 FROM payment_schema.finance_bank_head WHERE chef_identity_id=NEW.chef_identity_id FOR SHARE;
  IF NOT payment_schema.finance_bank_ready(NEW.chef_identity_id,NEW.beneficiary_id) THEN
   RAISE EXCEPTION 'Current bank enrollment is not provider-validated and eligible; do not override this hold' USING ERRCODE='23514';
  END IF;
 END IF;RETURN NEW;
END;$$;
CREATE TRIGGER finance_bank_dispatch_guard BEFORE INSERT OR UPDATE ON payment_schema.finance_payout_instruction
 FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_bank_payout_dispatch();
