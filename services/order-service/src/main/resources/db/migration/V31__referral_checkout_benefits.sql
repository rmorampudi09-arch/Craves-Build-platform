CREATE TABLE order_schema.referral_checkout_benefit (
 checkout_id UUID PRIMARY KEY REFERENCES order_schema.checkout(id),buyer_id UUID NOT NULL,
 reserve_envelope JSONB NOT NULL,state VARCHAR(20) NOT NULL DEFAULT 'RESERVING' CHECK(state IN ('RESERVING','RESERVED','CONSUMING','CONSUMED','RELEASING','RELEASED','REVIEW')),
 result JSONB,finish_envelope JSONB,lease_id UUID,lease_until TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_code VARCHAR(80),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE INDEX referral_checkout_benefit_due ON order_schema.referral_checkout_benefit(next_attempt_at,checkout_id) WHERE state IN ('RESERVING','CONSUMING','RELEASING');
CREATE FUNCTION order_schema.guard_referral_checkout_benefit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral checkout evidence is immutable' USING ERRCODE='55000';END IF;
 IF ROW(NEW.checkout_id,NEW.buyer_id,NEW.reserve_envelope,NEW.created_at) IS DISTINCT FROM ROW(OLD.checkout_id,OLD.buyer_id,OLD.reserve_envelope,OLD.created_at)
 OR (OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result)
 OR (OLD.finish_envelope IS NOT NULL AND NEW.finish_envelope IS DISTINCT FROM OLD.finish_envelope)
 OR OLD.state IN ('CONSUMED','RELEASED') THEN RAISE EXCEPTION 'Referral checkout identity cannot change' USING ERRCODE='55000';END IF;
 RETURN NEW;END;$$;
CREATE TRIGGER referral_checkout_benefit_guard BEFORE UPDATE OR DELETE ON order_schema.referral_checkout_benefit FOR EACH ROW EXECUTE FUNCTION order_schema.guard_referral_checkout_benefit();
CREATE TRIGGER referral_checkout_benefit_no_truncate BEFORE TRUNCATE ON order_schema.referral_checkout_benefit FOR EACH STATEMENT EXECUTE FUNCTION order_schema.guard_referral_checkout_benefit();
