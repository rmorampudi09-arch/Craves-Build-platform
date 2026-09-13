-- Immutable source evidence; no historical orders are inferred or paid by this migration.
CREATE TABLE payment_schema.finance_chef_tax_version(
 id UUID PRIMARY KEY,chef_identity_id UUID NOT NULL,payload JSONB NOT NULL,
 approved_by UUID NOT NULL,reason VARCHAR(1000) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_schema.finance_chef_tax_head(chef_identity_id UUID PRIMARY KEY,version_id UUID NOT NULL REFERENCES payment_schema.finance_chef_tax_version(id));
CREATE TABLE payment_schema.finance_issued_snapshot(
 id UUID PRIMARY KEY,checkout_id UUID NOT NULL,chef_order_id UUID NOT NULL UNIQUE,chef_identity_id UUID NOT NULL,
 snapshot_hash CHAR(64) NOT NULL,payload JSONB NOT NULL,issued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_finance_snapshot_checkout ON payment_schema.finance_issued_snapshot(checkout_id);
CREATE TABLE payment_schema.finance_checkout_quote(
 checkout_id UUID PRIMARY KEY,customer_identity_id UUID NOT NULL,request_hash CHAR(64) NOT NULL,response JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_schema.finance_order_binding(
 chef_order_id UUID PRIMARY KEY,snapshot_id UUID NOT NULL UNIQUE REFERENCES payment_schema.finance_issued_snapshot(id),
 state VARCHAR(30) NOT NULL CHECK(state IN ('BOUND','DELIVERED','CANCELLED','REVIEW_REQUIRED')),
 source_version BIGINT NOT NULL,delivery_job_id UUID,delivered_at TIMESTAMPTZ,
 earning_journal_id UUID REFERENCES payment_schema.ledger_transaction(id),
 last_result VARCHAR(160),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_schema.finance_source_event(
 event_id UUID PRIMARY KEY,chef_order_id UUID NOT NULL,kind VARCHAR(30) NOT NULL,source_version BIGINT NOT NULL,
 payload_hash CHAR(64) NOT NULL,payload JSONB NOT NULL,received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(chef_order_id,source_version)
);
CREATE TABLE payment_schema.finance_capture(
 checkout_id UUID PRIMARY KEY,payment_order_id UUID NOT NULL UNIQUE REFERENCES payment_schema.payment_order(id),
 provider_payment_id VARCHAR(160) NOT NULL,captured_amount NUMERIC NOT NULL,currency CHAR(3) NOT NULL,
 journal_id UUID NOT NULL UNIQUE REFERENCES payment_schema.ledger_transaction(id),recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_schema.finance_earning_projection(
 chef_order_id UUID PRIMARY KEY,checkout_id UUID NOT NULL,chef_identity_id UUID NOT NULL,snapshot_id UUID NOT NULL UNIQUE,
 gross NUMERIC NOT NULL,service_fee NUMERIC NOT NULL,fee_gst NUMERIC NOT NULL,withholding NUMERIC NOT NULL,
 payable NUMERIC NOT NULL,delivered_at TIMESTAMPTZ NOT NULL,journal_id UUID NOT NULL UNIQUE REFERENCES payment_schema.ledger_transaction(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),CHECK(payable=gross-service_fee-fee_gst-withholding AND payable>=0)
);
CREATE INDEX ix_finance_earning_chef ON payment_schema.finance_earning_projection(chef_identity_id,created_at,chef_order_id);
CREATE TABLE payment_schema.finance_source_exception(
 id UUID PRIMARY KEY,event_id UUID,chef_order_id UUID NOT NULL,reason VARCHAR(160) NOT NULL,attempted_hash CHAR(64),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(event_id,attempted_hash,reason)
);
DO $$ DECLARE name TEXT; BEGIN
 FOREACH name IN ARRAY ARRAY['finance_chef_tax_version','finance_issued_snapshot','finance_checkout_quote','finance_source_event','finance_capture','finance_earning_projection','finance_source_exception'] LOOP
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.%I FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation()',name||'_immutable',name);
 END LOOP;
END $$;
INSERT INTO payment_schema.ledger_account(account_code,currency,account_class,description) VALUES
 ('RESTAURANT_GST_PAYABLE','INR','LIABILITY','Customer food GST owed by the ECO under section 9(5)'),
 ('DELIVERY_GST_PAYABLE','INR','LIABILITY','GST on separately classified customer delivery charges'),
 ('PLATFORM_GST_PAYABLE','INR','LIABILITY','GST on the customer platform service'),
 ('CHEF_FEE_GST_PAYABLE','INR','LIABILITY','GST invoiced on the Craves service fee; not chef food GST');
CREATE FUNCTION payment_schema.guard_legacy_source_earning() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM payment_schema.finance_issued_snapshot s JOIN payment_schema.finance_order_binding b ON b.snapshot_id=s.id WHERE s.chef_order_id=NEW.order_id) THEN
  RAISE EXCEPTION 'Order financial source owns this earning; manual legacy allocation cannot duplicate it' USING ERRCODE='23514';
 END IF;RETURN NEW;
END;$$;
CREATE TRIGGER legacy_source_earning_guard BEFORE INSERT ON payment_schema.chef_earning_entry FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_legacy_source_earning();
