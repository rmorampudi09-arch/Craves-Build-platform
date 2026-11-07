-- M24d slice 2: the M10 company share a checkout reserved (the person pays the rest), and its confirm/release work.
CREATE TABLE order_schema.company_share_checkout_benefit (
 checkout_id UUID PRIMARY KEY REFERENCES order_schema.checkout(id),
 customer_id UUID NOT NULL,
 charge_id UUID NOT NULL UNIQUE,
 company_id UUID NOT NULL,
 share_paise BIGINT NOT NULL CHECK (share_paise > 0),
 gross_paise BIGINT NOT NULL CHECK (gross_paise >= share_paise),
 state VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED','CONFIRMING','CONFIRMED','RELEASING','RELEASED','REVIEW')),
 lease_id UUID, lease_until TIMESTAMPTZ, attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((lease_id IS NULL) = (lease_until IS NULL))
);
CREATE INDEX company_share_checkout_benefit_due ON order_schema.company_share_checkout_benefit(next_attempt_at, checkout_id) WHERE state IN ('CONFIRMING','RELEASING');
CREATE INDEX company_share_checkout_benefit_person ON order_schema.company_share_checkout_benefit(customer_id);
CREATE FUNCTION order_schema.guard_company_share_checkout_benefit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Company share checkout evidence is immutable' USING ERRCODE='55000'; END IF;
 IF ROW(NEW.checkout_id,NEW.customer_id,NEW.charge_id,NEW.company_id,NEW.share_paise,NEW.gross_paise,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.checkout_id,OLD.customer_id,OLD.charge_id,OLD.company_id,OLD.share_paise,OLD.gross_paise,OLD.created_at)
    OR OLD.state = 'RELEASED' THEN RAISE EXCEPTION 'Company share checkout identity cannot change' USING ERRCODE='55000'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER company_share_checkout_benefit_guard BEFORE UPDATE OR DELETE ON order_schema.company_share_checkout_benefit FOR EACH ROW EXECUTE FUNCTION order_schema.guard_company_share_checkout_benefit();
CREATE TRIGGER company_share_checkout_benefit_no_truncate BEFORE TRUNCATE ON order_schema.company_share_checkout_benefit FOR EACH STATEMENT EXECUTE FUNCTION order_schema.guard_company_share_checkout_benefit();
