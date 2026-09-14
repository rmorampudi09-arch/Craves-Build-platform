-- A stale verification remains non-dispatchable, but its polling lease must still be renewable.
CREATE OR REPLACE FUNCTION payment_schema.guard_bank_request_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Bank enrollment history cannot be deleted by the application' USING ERRCODE='55000';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'QUEUED' OR NEW.validation_id IS NOT NULL OR NEW.beneficiary_id IS NOT NULL
   OR NEW.bank_validated OR NEW.application_approved OR NEW.verified_at IS NOT NULL THEN
   RAISE EXCEPTION 'Bank enrollment must start unvalidated and queued' USING ERRCODE='23514';END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW.chef_identity_id,NEW.encrypted_details,NEW.fingerprint,NEW.last_four,NEW.ifsc,NEW.consent_version,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.chef_identity_id,OLD.encrypted_details,OLD.fingerprint,OLD.last_four,OLD.ifsc,OLD.consent_version,OLD.created_at) THEN
  RAISE EXCEPTION 'Bank details are versioned; never rewrite an existing enrollment' USING ERRCODE='55000';END IF;
 IF OLD.validation_id IS NOT NULL AND NEW.validation_id IS DISTINCT FROM OLD.validation_id THEN
  RAISE EXCEPTION 'Original provider validation reference is immutable' USING ERRCODE='55000';END IF;
 IF OLD.beneficiary_id IS NOT NULL AND NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id THEN
  RAISE EXCEPTION 'Original beneficiary version is immutable' USING ERRCODE='55000';END IF;
 IF OLD.state='SUPERSEDED' AND NEW.state<>'SUPERSEDED' THEN
  RAISE EXCEPTION 'A superseded bank request cannot become current through a late response' USING ERRCODE='55000';END IF;
 IF NEW.state='VERIFIED' AND ROW(NEW.state,NEW.verified_at,NEW.bank_validated,NEW.application_approved,NEW.validation_id,NEW.fund_account_id,NEW.contact_id,NEW.beneficiary_id)
   IS DISTINCT FROM ROW(OLD.state,OLD.verified_at,OLD.bank_validated,OLD.application_approved,OLD.validation_id,OLD.fund_account_id,OLD.contact_id,OLD.beneficiary_id) THEN
  IF NOT EXISTS(SELECT 1 FROM payment_schema.finance_bank_evidence e
    JOIN payment_schema.finance_beneficiary_version b ON b.id=NEW.beneficiary_id
    WHERE e.request_id=NEW.id AND e.validation_id=NEW.validation_id AND e.fund_account_id=NEW.fund_account_id
      AND e.contact_id=NEW.contact_id AND e.result='BANK_VALIDATED' AND e.observed_at>=now()-interval '24 hours'
      AND b.chef_identity_id=NEW.chef_identity_id AND b.fund_account_id=e.fund_account_id AND b.contact_id=e.contact_id
      AND b.verification_actor_type='RAZORPAY_VALIDATION') THEN
   RAISE EXCEPTION 'Automatic activation requires matching recent provider validation and beneficiary evidence' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END;$$;
CREATE TRIGGER finance_bank_initial_state BEFORE INSERT ON payment_schema.finance_bank_request
 FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_bank_request_history();
