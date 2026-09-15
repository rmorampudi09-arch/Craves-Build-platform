CREATE TABLE order_schema.referral_benefit_recovery_audit (
 id UUID PRIMARY KEY,checkout_id UUID NOT NULL REFERENCES order_schema.referral_checkout_benefit(checkout_id),
 actor_id UUID NOT NULL,reason VARCHAR(1000) NOT NULL,evidence_ref VARCHAR(180) NOT NULL,prior_attempts INTEGER NOT NULL,
 target_state VARCHAR(20) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION order_schema.reject_referral_recovery_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Referral recovery evidence is immutable' USING ERRCODE='55000';END;$$;
CREATE TRIGGER referral_benefit_recovery_guard BEFORE UPDATE OR DELETE OR TRUNCATE ON order_schema.referral_benefit_recovery_audit FOR EACH STATEMENT EXECUTE FUNCTION order_schema.reject_referral_recovery_mutation();
