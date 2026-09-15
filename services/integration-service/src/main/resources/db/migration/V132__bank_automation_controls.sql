CREATE TABLE payment_schema.finance_bank_automation_control (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton), revision BIGINT NOT NULL DEFAULT 0,
 submissions_enabled BOOLEAN NOT NULL DEFAULT false, validation_enabled BOOLEAN NOT NULL DEFAULT false,
 maximum_requests_per_day INTEGER NOT NULL DEFAULT 3 CHECK(maximum_requests_per_day BETWEEN 1 AND 10),
 updated_by UUID, reason VARCHAR(1000), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO payment_schema.finance_bank_automation_control(singleton) VALUES(true);
CREATE TABLE payment_schema.finance_bank_control_audit (
 id UUID PRIMARY KEY, revision BIGINT NOT NULL UNIQUE, submissions_enabled BOOLEAN NOT NULL,
 validation_enabled BOOLEAN NOT NULL, maximum_requests_per_day INTEGER NOT NULL,
 actor_id UUID NOT NULL,reason VARCHAR(1000) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER finance_bank_control_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_bank_control_audit
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();

CREATE FUNCTION payment_schema.guard_bank_head_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM payment_schema.finance_bank_request WHERE id=NEW.request_id AND chef_identity_id=NEW.chef_identity_id) THEN
  RAISE EXCEPTION 'Bank enrollment owner mismatch' USING ERRCODE='23514';END IF;
 IF TG_OP='UPDATE' AND NEW.chef_identity_id<>OLD.chef_identity_id THEN
  RAISE EXCEPTION 'Bank head ownership is immutable' USING ERRCODE='55000';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER finance_bank_head_owner BEFORE INSERT OR UPDATE ON payment_schema.finance_bank_head
 FOR EACH ROW EXECUTE FUNCTION payment_schema.guard_bank_head_owner();
CREATE TRIGGER finance_bank_head_no_delete BEFORE DELETE OR TRUNCATE ON payment_schema.finance_bank_head
 FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
