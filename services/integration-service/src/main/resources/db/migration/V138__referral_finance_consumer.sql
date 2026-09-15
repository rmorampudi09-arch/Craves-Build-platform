CREATE TABLE payment_schema.referral_consumer_inbox(
 event_id UUID PRIMARY KEY,event_type VARCHAR(60) NOT NULL,payload JSONB NOT NULL,payload_hash CHAR(64) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','APPLIED','DEAD')),
 attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_code VARCHAR(80),
 received_at TIMESTAMPTZ NOT NULL DEFAULT now(),applied_at TIMESTAMPTZ
);
CREATE INDEX referral_consumer_due ON payment_schema.referral_consumer_inbox(next_attempt_at,event_id) WHERE status='RECEIVED';
CREATE TABLE payment_schema.referral_finance_binding(
 chef_order_id UUID PRIMARY KEY REFERENCES payment_schema.finance_issued_snapshot(chef_order_id),checkout_id UUID NOT NULL,
 source_hash CHAR(64) NOT NULL,source_version INTEGER NOT NULL DEFAULT 0,
 next_observation_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX referral_finance_due ON payment_schema.referral_finance_binding(next_observation_at,chef_order_id);
CREATE TABLE payment_schema.referral_journal_projection(
 source_journal_id BIGINT PRIMARY KEY,source_event_id UUID NOT NULL UNIQUE REFERENCES payment_schema.referral_consumer_inbox(event_id),
 user_id UUID NOT NULL,pending_delta BIGINT NOT NULL,available_delta BIGINT NOT NULL,reserved_delta BIGINT NOT NULL,
 journal_id UUID NOT NULL UNIQUE REFERENCES payment_schema.ledger_transaction(id)
);
CREATE TABLE payment_schema.referral_payout_instruction(
 attempt_id UUID PRIMARY KEY,reservation_id UUID NOT NULL UNIQUE,user_id UUID NOT NULL,payload JSONB NOT NULL,
 state VARCHAR(32) NOT NULL DEFAULT 'AWAITING_PROVIDER_REVIEW',source_event_id UUID NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO payment_schema.ledger_account(account_code,currency,account_class,description) VALUES
 ('REFERRAL_PENDING','INR','LIABILITY','Unsettled referral reward liability'),
 ('REFERRAL_AVAILABLE','INR','LIABILITY','Spendable referral wallet liability'),
 ('REFERRAL_RESERVED','INR','LIABILITY','Reserved referral wallet liability'),
 ('REFERRAL_UPLINE_EXPENSE','INR','EXPENSE','Craves-funded seller-chain acquisition expense'),
 ('REFERRAL_MARKETING_EXPENSE','INR','EXPENSE','Craves-funded customer acquisition expense'),
 ('REFERRAL_CHECKOUT_CLEARING','INR','LIABILITY','Referral wallet checkout clearing'),
 ('REFERRAL_PAYOUT_CLEARING','INR','ASSET','Evidence-backed referral payout clearing'),
 ('REFERRAL_WITHHOLDING_CLEARING','INR','LIABILITY','Referral withholding clearing');
CREATE FUNCTION payment_schema.guard_referral_consumer_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral inbox evidence is immutable' USING ERRCODE='55000';END IF;
 IF ROW(NEW.event_id,NEW.event_type,NEW.payload,NEW.payload_hash,NEW.received_at) IS DISTINCT FROM ROW(OLD.event_id,OLD.event_type,OLD.payload,OLD.payload_hash,OLD.received_at) THEN
  RAISE EXCEPTION 'Referral consumer identity cannot change' USING ERRCODE='55000';END IF;RETURN NEW;END;$$;
CREATE TRIGGER referral_consumer_history BEFORE UPDATE OR DELETE ON payment_schema.referral_consumer_inbox FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_referral_consumer_history();
CREATE TRIGGER referral_consumer_no_truncate BEFORE TRUNCATE ON payment_schema.referral_consumer_inbox FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_referral_consumer_history();
CREATE TRIGGER referral_journal_projection_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.referral_journal_projection FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
