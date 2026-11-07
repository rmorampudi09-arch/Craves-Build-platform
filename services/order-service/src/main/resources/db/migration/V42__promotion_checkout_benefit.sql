-- M24a slice 2: the M08 promotion a checkout reserved (Craves-funded part-payment after tax), and its confirm/release work.
CREATE TABLE order_schema.promotion_checkout_benefit (
 checkout_id UUID PRIMARY KEY REFERENCES order_schema.checkout(id),
 customer_id UUID NOT NULL,
 redemption_id UUID NOT NULL UNIQUE,
 promotion_id UUID NOT NULL,
 discount_paise BIGINT NOT NULL CHECK (discount_paise > 0),
 gross_paise BIGINT NOT NULL CHECK (gross_paise >= discount_paise),
 state VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED','CONFIRMING','CONFIRMED','RELEASING','RELEASED','REVIEW')),
 lease_id UUID, lease_until TIMESTAMPTZ, attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((lease_id IS NULL) = (lease_until IS NULL))
);
CREATE INDEX promotion_checkout_benefit_due ON order_schema.promotion_checkout_benefit(next_attempt_at, checkout_id) WHERE state IN ('CONFIRMING','RELEASING');
CREATE INDEX promotion_checkout_benefit_person ON order_schema.promotion_checkout_benefit(customer_id, promotion_id);
CREATE FUNCTION order_schema.guard_promotion_checkout_benefit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Promotion checkout evidence is immutable' USING ERRCODE='55000'; END IF;
 IF ROW(NEW.checkout_id,NEW.customer_id,NEW.redemption_id,NEW.promotion_id,NEW.discount_paise,NEW.gross_paise,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.checkout_id,OLD.customer_id,OLD.redemption_id,OLD.promotion_id,OLD.discount_paise,OLD.gross_paise,OLD.created_at)
    OR OLD.state = 'RELEASED' THEN RAISE EXCEPTION 'Promotion checkout identity cannot change' USING ERRCODE='55000'; END IF;
 RETURN NEW; END; $$;
CREATE TRIGGER promotion_checkout_benefit_guard BEFORE UPDATE OR DELETE ON order_schema.promotion_checkout_benefit FOR EACH ROW EXECUTE FUNCTION order_schema.guard_promotion_checkout_benefit();
CREATE TRIGGER promotion_checkout_benefit_no_truncate BEFORE TRUNCATE ON order_schema.promotion_checkout_benefit FOR EACH STATEMENT EXECUTE FUNCTION order_schema.guard_promotion_checkout_benefit();
