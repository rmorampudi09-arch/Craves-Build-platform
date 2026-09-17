-- Additive, isolated referral controls. Existing chef payout instructions are never reused.
CREATE TABLE payment_schema.referral_finance_review (
 id UUID PRIMARY KEY,kind VARCHAR(16) NOT NULL CHECK(kind IN ('RECIPIENT','FUNDING')),
 payload JSONB NOT NULL,provider_binding JSONB NOT NULL,content_hash CHAR(64) NOT NULL,
 evidence_ref VARCHAR(180) NOT NULL,created_by UUID NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 approved_by UUID,approved_at TIMESTAMPTZ,
 CHECK ((approved_by IS NULL)=(approved_at IS NULL)),CHECK(approved_by IS NULL OR approved_by<>created_by)
);
CREATE UNIQUE INDEX referral_review_recipient_id ON payment_schema.referral_finance_review ((payload->>'assessmentId')) WHERE kind='RECIPIENT';
CREATE UNIQUE INDEX referral_review_funding_id ON payment_schema.referral_finance_review ((payload->>'fundingId')) WHERE kind='FUNDING';
CREATE TABLE payment_schema.referral_payout_execution (
 attempt_id UUID PRIMARY KEY REFERENCES payment_schema.referral_payout_instruction(attempt_id),
 review_id UUID NOT NULL REFERENCES payment_schema.referral_finance_review(id),
 fund_account_id VARCHAR(80) NOT NULL,contact_id VARCHAR(80) NOT NULL,
 net_paise BIGINT NOT NULL CHECK(net_paise>0),withholding_paise BIGINT NOT NULL CHECK(withholding_paise>=0),
 state VARCHAR(20) NOT NULL CHECK(state IN ('READY','SENDING','UNKNOWN','RECONCILING','PAID','FAILED','REVIEW')),
 provider_id VARCHAR(80) UNIQUE,transfer_reference VARCHAR(160),
 lease_id UUID,lease_until TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),observed_at TIMESTAMPTZ,
 CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE INDEX referral_payout_due ON payment_schema.referral_payout_execution(next_attempt_at,attempt_id) WHERE state IN ('READY','UNKNOWN','SENDING','RECONCILING');
CREATE TABLE payment_schema.referral_payout_evidence (
 id UUID PRIMARY KEY,attempt_id UUID NOT NULL REFERENCES payment_schema.referral_payout_execution(attempt_id),
 outcome VARCHAR(20) NOT NULL,provider_id VARCHAR(80),transfer_reference VARCHAR(160),observed_at TIMESTAMPTZ NOT NULL,
 actor_id VARCHAR(120) NOT NULL,evidence_ref VARCHAR(180) NOT NULL,
 UNIQUE(attempt_id,outcome)
);
CREATE FUNCTION payment_schema.guard_referral_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral review is immutable' USING ERRCODE='55000'; END IF;
 IF ROW(NEW.id,NEW.kind,NEW.payload,NEW.provider_binding,NEW.content_hash,NEW.evidence_ref,NEW.created_by,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.kind,OLD.payload,OLD.provider_binding,OLD.content_hash,OLD.evidence_ref,OLD.created_by,OLD.created_at)
 OR OLD.approved_by IS NOT NULL THEN RAISE EXCEPTION 'Reviewed evidence cannot change' USING ERRCODE='55000'; END IF;
 RETURN NEW;END;$$;
CREATE TRIGGER referral_review_guard BEFORE UPDATE OR DELETE ON payment_schema.referral_finance_review FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_referral_review();
CREATE TRIGGER referral_review_no_truncate BEFORE TRUNCATE ON payment_schema.referral_finance_review FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_referral_review();
CREATE FUNCTION payment_schema.guard_referral_execution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral execution is immutable' USING ERRCODE='55000'; END IF;
 IF ROW(NEW.attempt_id,NEW.review_id,NEW.fund_account_id,NEW.contact_id,NEW.net_paise,NEW.withholding_paise,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.attempt_id,OLD.review_id,OLD.fund_account_id,OLD.contact_id,OLD.net_paise,OLD.withholding_paise,OLD.created_at)
 OR (OLD.provider_id IS NOT NULL AND NEW.provider_id IS DISTINCT FROM OLD.provider_id)
 OR OLD.state IN ('PAID','FAILED') THEN RAISE EXCEPTION 'Payout identity or terminal result cannot change' USING ERRCODE='55000'; END IF;
 RETURN NEW;END;$$;
CREATE TRIGGER referral_execution_guard BEFORE UPDATE OR DELETE ON payment_schema.referral_payout_execution FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_referral_execution();
CREATE TRIGGER referral_execution_no_truncate BEFORE TRUNCATE ON payment_schema.referral_payout_execution FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_referral_execution();
CREATE TRIGGER referral_payout_evidence_guard BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.referral_payout_evidence FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
