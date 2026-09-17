CREATE TABLE payment_schema.referral_refund_allocation (
 chef_order_id UUID PRIMARY KEY REFERENCES payment_schema.finance_issued_snapshot(chef_order_id),checkout_id UUID NOT NULL REFERENCES payment_schema.referral_checkout_funding(checkout_id),
 request_event_id UUID NOT NULL UNIQUE,source_payload JSONB NOT NULL,source_hash CHAR(64) NOT NULL,
 gross_paise BIGINT NOT NULL CHECK(gross_paise>0),wallet_paise BIGINT NOT NULL CHECK(wallet_paise>=0),discount_paise BIGINT NOT NULL CHECK(discount_paise>=0),gateway_paise BIGINT NOT NULL CHECK(gateway_paise>=0),
 state VARCHAR(20) NOT NULL DEFAULT 'WAITING' CHECK(state IN ('WAITING','COMPLETE','REVIEW')),
 operation_envelope JSONB,lease_id UUID,lease_until TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),completed_at TIMESTAMPTZ,
 CHECK(gross_paise=wallet_paise+discount_paise+gateway_paise),CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE TABLE payment_schema.referral_refund_sequence (
 checkout_id UUID PRIMARY KEY REFERENCES payment_schema.referral_checkout_funding(checkout_id),version INTEGER NOT NULL DEFAULT 0,
 wallet_refunded_paise BIGINT NOT NULL DEFAULT 0,discount_refunded_paise BIGINT NOT NULL DEFAULT 0
);
CREATE FUNCTION payment_schema.guard_referral_refund() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral refund evidence is immutable' USING ERRCODE='55000';END IF;
 IF ROW(NEW.chef_order_id,NEW.checkout_id,NEW.request_event_id,NEW.source_payload,NEW.source_hash,NEW.gross_paise,NEW.wallet_paise,NEW.discount_paise,NEW.gateway_paise,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.chef_order_id,OLD.checkout_id,OLD.request_event_id,OLD.source_payload,OLD.source_hash,OLD.gross_paise,OLD.wallet_paise,OLD.discount_paise,OLD.gateway_paise,OLD.created_at)
 OR (OLD.operation_envelope IS NOT NULL AND NEW.operation_envelope IS DISTINCT FROM OLD.operation_envelope) OR OLD.state='COMPLETE' THEN RAISE EXCEPTION 'Referral refund identity cannot change' USING ERRCODE='55000';END IF;RETURN NEW;END;$$;
CREATE TRIGGER referral_refund_guard BEFORE UPDATE OR DELETE ON payment_schema.referral_refund_allocation FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_referral_refund();
CREATE TRIGGER referral_refund_no_truncate BEFORE TRUNCATE ON payment_schema.referral_refund_allocation FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_referral_refund();
ALTER TABLE payment_schema.refund DROP CONSTRAINT ck_refund_provider;
ALTER TABLE payment_schema.refund ADD CONSTRAINT ck_refund_provider CHECK(provider IN ('CASHFREE','RAZORPAY','REFERRAL_WALLET')) NOT VALID;
ALTER TABLE payment_schema.refund ADD CONSTRAINT ck_referral_wallet_refund CHECK(provider<>'REFERRAL_WALLET' OR (amount=0 AND provider_order_id IS NULL AND provider_payment_id IS NULL AND provider_refund_id IS NULL)) NOT VALID;
