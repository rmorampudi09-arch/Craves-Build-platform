-- M24a slice 3: the Craves-funded promotion Finance froze for a checkout (from order-service V42) and the net amount it collects.
CREATE TABLE payment_schema.promotion_checkout_funding (
 checkout_id UUID PRIMARY KEY,
 buyer_id UUID NOT NULL,
 redemption_id UUID NOT NULL UNIQUE,
 promotion_id UUID NOT NULL,
 gross_paise BIGINT NOT NULL,
 discount_paise BIGINT NOT NULL CHECK (discount_paise > 0),
 net_paise BIGINT NOT NULL CHECK (net_paise > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (gross_paise = discount_paise + net_paise)
);
CREATE FUNCTION payment_schema.guard_promotion_checkout_funding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Promotion checkout funding is immutable' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER promotion_checkout_funding_guard BEFORE UPDATE OR DELETE ON payment_schema.promotion_checkout_funding FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_promotion_checkout_funding();
CREATE TRIGGER promotion_checkout_funding_no_truncate BEFORE TRUNCATE ON payment_schema.promotion_checkout_funding FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_promotion_checkout_funding();
INSERT INTO payment_schema.ledger_account(account_code,currency,account_class,description) VALUES
 ('PROMOTION_MARKETING_EXPENSE','INR','EXPENSE','Craves-funded promotion code discount (M24a)');
