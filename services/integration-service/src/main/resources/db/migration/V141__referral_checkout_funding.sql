CREATE TABLE payment_schema.referral_checkout_funding (
 checkout_id UUID PRIMARY KEY REFERENCES payment_schema.finance_checkout_quote(checkout_id),buyer_id UUID NOT NULL,
 funding JSONB NOT NULL,funding_hash CHAR(64) NOT NULL,allocation JSONB NOT NULL,
 gross_paise BIGINT NOT NULL CHECK(gross_paise>0),wallet_paise BIGINT NOT NULL CHECK(wallet_paise>=0),discount_paise BIGINT NOT NULL CHECK(discount_paise>=0),gateway_paise BIGINT NOT NULL CHECK(gateway_paise>=0),
 payment_order_id UUID NOT NULL UNIQUE,state VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK(state IN ('RESERVED','CONSUMED','RELEASED','REVIEW')),
 create_state VARCHAR(20) NOT NULL DEFAULT 'READY' CHECK(create_state IN ('READY','SENDING','CREATED','UNKNOWN','NO_GATEWAY')),
 provider_response JSONB,lease_id UUID,lease_until TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 last_code VARCHAR(80),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),consumed_at TIMESTAMPTZ,
 CHECK(gross_paise=wallet_paise+discount_paise+gateway_paise),CHECK(wallet_paise+discount_paise>0),CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE TABLE payment_schema.referral_funding_capture (
 checkout_id UUID PRIMARY KEY REFERENCES payment_schema.referral_checkout_funding(checkout_id),payment_order_id UUID NOT NULL UNIQUE REFERENCES payment_schema.payment_order(id),
 gross_paise BIGINT NOT NULL,wallet_paise BIGINT NOT NULL,discount_paise BIGINT NOT NULL,gateway_paise BIGINT NOT NULL,
 provider_payment_id VARCHAR(120),journal_id UUID NOT NULL UNIQUE REFERENCES payment_schema.ledger_transaction(id),observed_at TIMESTAMPTZ NOT NULL,
 CHECK(gross_paise=wallet_paise+discount_paise+gateway_paise)
);
CREATE FUNCTION payment_schema.guard_referral_funding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral funding evidence is immutable' USING ERRCODE='55000';END IF;
 IF ROW(NEW.checkout_id,NEW.buyer_id,NEW.funding,NEW.funding_hash,NEW.allocation,NEW.gross_paise,NEW.wallet_paise,NEW.discount_paise,NEW.gateway_paise,NEW.payment_order_id,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.checkout_id,OLD.buyer_id,OLD.funding,OLD.funding_hash,OLD.allocation,OLD.gross_paise,OLD.wallet_paise,OLD.discount_paise,OLD.gateway_paise,OLD.payment_order_id,OLD.created_at)
 OR (OLD.provider_response IS NOT NULL AND NEW.provider_response IS DISTINCT FROM OLD.provider_response)
 OR OLD.state IN ('CONSUMED','RELEASED') THEN RAISE EXCEPTION 'Referral funding identity cannot change' USING ERRCODE='55000';END IF;RETURN NEW;END;$$;
CREATE TRIGGER referral_funding_guard BEFORE UPDATE OR DELETE ON payment_schema.referral_checkout_funding FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_referral_funding();
CREATE TRIGGER referral_funding_no_truncate BEFORE TRUNCATE ON payment_schema.referral_checkout_funding FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_referral_funding();
CREATE TRIGGER referral_funding_capture_guard BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.referral_funding_capture FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
-- Explicit internal tender: zero external collection, never a fabricated Razorpay payment.
ALTER TABLE payment_schema.payment_order DROP CONSTRAINT ck_payment_order_provider;
ALTER TABLE payment_schema.payment_order ADD CONSTRAINT ck_payment_order_provider CHECK(provider IN ('CASHFREE','RAZORPAY','REFERRAL_WALLET')) NOT VALID;
ALTER TABLE payment_schema.payment_order ADD CONSTRAINT ck_referral_wallet_payment CHECK(provider<>'REFERRAL_WALLET' OR (amount=0 AND provider_order_id IS NULL AND provider_payment_id IS NULL)) NOT VALID;
