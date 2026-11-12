-- M24d slice 3: the company share Finance froze for a checkout (from order-service V44) and the part the person pays.
CREATE TABLE payment_schema.company_share_checkout_funding (
 checkout_id UUID PRIMARY KEY,
 buyer_id UUID NOT NULL,
 charge_id UUID NOT NULL UNIQUE,
 company_id UUID NOT NULL,
 gross_paise BIGINT NOT NULL,
 company_share_paise BIGINT NOT NULL CHECK (company_share_paise > 0),
 person_paise BIGINT NOT NULL CHECK (person_paise > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK (gross_paise = company_share_paise + person_paise)
);
CREATE FUNCTION payment_schema.guard_company_share_checkout_funding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Company share checkout funding is immutable' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER company_share_checkout_funding_guard BEFORE UPDATE OR DELETE ON payment_schema.company_share_checkout_funding FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_company_share_checkout_funding();
CREATE TRIGGER company_share_checkout_funding_no_truncate BEFORE TRUNCATE ON payment_schema.company_share_checkout_funding FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.guard_company_share_checkout_funding();
INSERT INTO payment_schema.ledger_account(account_code,currency,account_class,description) VALUES
 ('COMPANY_SHARE_RECEIVABLE','INR','ASSET','Company share of a checkout, billed on the M10 monthly statement (M24d)');
