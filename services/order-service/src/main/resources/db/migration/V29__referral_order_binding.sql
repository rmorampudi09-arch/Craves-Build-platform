CREATE TABLE order_schema.referral_order_binding(
 chef_order_id UUID PRIMARY KEY REFERENCES order_schema.order_financial_snapshot(chef_order_id),
 checkout_id UUID NOT NULL,buyer_id UUID NOT NULL,event_id UUID NOT NULL UNIQUE REFERENCES order_schema.referral_source_outbox(event_id),
 snapshot_hash CHAR(64) NOT NULL,policy_revision BIGINT NOT NULL CHECK(policy_revision>0),bound_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX referral_binding_checkout ON order_schema.referral_order_binding(checkout_id);
CREATE TABLE order_schema.referral_source_exception(
 chef_order_id UUID NOT NULL,source_event_id UUID NOT NULL,reason VARCHAR(100) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(chef_order_id,source_event_id,reason)
);
CREATE TABLE order_schema.referral_lifecycle_projection(
 chef_order_id UUID PRIMARY KEY REFERENCES order_schema.referral_order_binding(chef_order_id),
 delivery_event_id UUID UNIQUE,refund_version INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE order_schema.referral_first_checkout(
 buyer_id UUID PRIMARY KEY,checkout_id UUID NOT NULL UNIQUE,evidence_ref VARCHAR(180) NOT NULL,event_id UUID NOT NULL UNIQUE,
 confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION order_schema.reject_referral_binding_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Referral source binding is immutable' USING ERRCODE='55000';END;$$;
CREATE TRIGGER referral_binding_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON order_schema.referral_order_binding
 FOR EACH STATEMENT EXECUTE FUNCTION order_schema.reject_referral_binding_mutation();
CREATE TRIGGER referral_first_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON order_schema.referral_first_checkout
 FOR EACH STATEMENT EXECUTE FUNCTION order_schema.reject_referral_binding_mutation();
