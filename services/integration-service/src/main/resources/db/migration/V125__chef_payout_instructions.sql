-- Payout eligibility is separate from original earnings and external transfer attempts.
CREATE TABLE payment_schema.finance_beneficiary_version (
 id UUID PRIMARY KEY,chef_identity_id UUID NOT NULL,fund_account_id VARCHAR(80) NOT NULL,
 contact_id VARCHAR(80) NOT NULL,verification_reference VARCHAR(240) NOT NULL,
 verified_by UUID NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_schema.finance_chef_payout_control (
 chef_identity_id UUID PRIMARY KEY,beneficiary_id UUID REFERENCES payment_schema.finance_beneficiary_version(id),
 on_hold BOOLEAN NOT NULL DEFAULT true,hold_reason VARCHAR(1000),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_schema.finance_payable (
 id UUID PRIMARY KEY,chef_identity_id UUID NOT NULL,chef_order_id UUID NOT NULL UNIQUE,
 journal_id UUID NOT NULL UNIQUE REFERENCES payment_schema.ledger_transaction(id),
 amount NUMERIC NOT NULL CHECK(amount>0 AND amount<100000000000000 AND amount=round(amount,2)),
 delivered_at TIMESTAMPTZ NOT NULL,automatic_due_at TIMESTAMPTZ NOT NULL,manual_available_at TIMESTAMPTZ NOT NULL,
 policy_snapshot JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(automatic_due_at>=delivered_at AND manual_available_at>=delivered_at)
);
CREATE INDEX finance_payable_due ON payment_schema.finance_payable(automatic_due_at,chef_identity_id);
CREATE TABLE payment_schema.finance_payout_instruction (
 id UUID PRIMARY KEY,chef_identity_id UUID NOT NULL,beneficiary_id UUID NOT NULL REFERENCES payment_schema.finance_beneficiary_version(id),
 request_key UUID NOT NULL,mode VARCHAR(12) NOT NULL CHECK(mode IN ('MANUAL','AUTOMATIC')),
 amount NUMERIC NOT NULL CHECK(amount>0 AND amount<100000000000000 AND amount=round(amount,2)),
 status VARCHAR(24) NOT NULL CHECK(status IN ('RESERVED','SUBMITTING','PROCESSING','UNKNOWN','PAID','FAILED','REVERSED','REVIEW_REQUIRED')),
 provider_id VARCHAR(80) UNIQUE,provider_status VARCHAR(40),transfer_reference VARCHAR(160),
 policy_revision BIGINT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
 lease_id UUID,lease_until TIMESTAMPTZ,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 settlement_journal_id UUID REFERENCES payment_schema.ledger_transaction(id),
 reversal_journal_id UUID REFERENCES payment_schema.ledger_transaction(id),
 last_error VARCHAR(160),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(chef_identity_id,request_key)
);
CREATE INDEX finance_payout_pending ON payment_schema.finance_payout_instruction(status,next_attempt_at);
CREATE TABLE payment_schema.finance_payout_allocation (
 instruction_id UUID NOT NULL REFERENCES payment_schema.finance_payout_instruction(id),
 payable_id UUID NOT NULL REFERENCES payment_schema.finance_payable(id),
 active BOOLEAN NOT NULL DEFAULT true,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(instruction_id,payable_id)
);
-- PAID retains its active allocation: a confirmed payout must never become spendable again.
CREATE UNIQUE INDEX finance_payable_single_reservation ON payment_schema.finance_payout_allocation(payable_id) WHERE active;
CREATE TABLE payment_schema.finance_manual_withdrawal_day (
 chef_identity_id UUID NOT NULL,business_date DATE NOT NULL,
 instruction_id UUID NOT NULL UNIQUE REFERENCES payment_schema.finance_payout_instruction(id),
 PRIMARY KEY(chef_identity_id,business_date)
);
CREATE TABLE payment_schema.finance_payout_audit (
 id UUID PRIMARY KEY,instruction_id UUID REFERENCES payment_schema.finance_payout_instruction(id),
 chef_identity_id UUID NOT NULL,action VARCHAR(50) NOT NULL,actor VARCHAR(120) NOT NULL,
 evidence_reference VARCHAR(500) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER finance_payable_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_payable
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER finance_beneficiary_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_beneficiary_version
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER finance_payout_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_payout_audit
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER finance_manual_day_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_manual_withdrawal_day
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.guard_finance_payout_instruction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payout history cannot be deleted' USING ERRCODE='55000'; END IF;
 IF ROW(NEW.id,NEW.chef_identity_id,NEW.beneficiary_id,NEW.request_key,NEW.mode,NEW.amount,NEW.policy_revision,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.chef_identity_id,OLD.beneficiary_id,OLD.request_key,OLD.mode,OLD.amount,OLD.policy_revision,OLD.created_at) THEN
   RAISE EXCEPTION 'Payout instruction financial context is immutable' USING ERRCODE='55000';
 END IF;
 IF OLD.provider_id IS NOT NULL AND OLD.provider_id IS DISTINCT FROM NEW.provider_id THEN
   RAISE EXCEPTION 'Provider payout identity cannot be replaced' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER finance_payout_instruction_guard BEFORE UPDATE OR DELETE ON payment_schema.finance_payout_instruction
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_finance_payout_instruction();
CREATE TRIGGER finance_payout_instruction_no_truncate BEFORE TRUNCATE ON payment_schema.finance_payout_instruction
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.guard_finance_payout_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p payment_schema.finance_payable%ROWTYPE; i payment_schema.finance_payout_instruction%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payout allocation history cannot be deleted' USING ERRCODE='55000'; END IF;
 SELECT * INTO STRICT i FROM payment_schema.finance_payout_instruction WHERE id=NEW.instruction_id;
 IF TG_OP='UPDATE' THEN
   IF ROW(NEW.instruction_id,NEW.payable_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.instruction_id,OLD.payable_id,OLD.created_at)
      OR (NOT OLD.active AND NEW.active) OR (OLD.active AND NOT NEW.active AND i.status NOT IN ('FAILED','REVERSED')) THEN
     RAISE EXCEPTION 'Only definitive payout failure or reversal releases an allocation' USING ERRCODE='55000';
   END IF;
 ELSE
   SELECT * INTO STRICT p FROM payment_schema.finance_payable WHERE id=NEW.payable_id;
   IF i.status<>'RESERVED' OR i.chef_identity_id<>p.chef_identity_id OR NOT NEW.active THEN
     RAISE EXCEPTION 'Payout allocation owner or state mismatch' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER finance_payout_allocation_guard BEFORE INSERT OR UPDATE OR DELETE ON payment_schema.finance_payout_allocation
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_finance_payout_allocation();
CREATE TRIGGER finance_payout_allocation_no_truncate BEFORE TRUNCATE ON payment_schema.finance_payout_allocation
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.guard_legacy_settlement_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM payment_schema.chef_earning_entry e JOIN payment_schema.finance_payable p ON p.chef_order_id=e.order_id WHERE e.id=NEW.earning_entry_id) THEN
   RAISE EXCEPTION 'New finance engine owns this payable; legacy settlement cannot reserve it' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER legacy_settlement_overlap_guard BEFORE INSERT ON payment_schema.chef_settlement_item
FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_legacy_settlement_overlap();
