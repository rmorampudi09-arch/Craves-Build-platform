-- New policy registry. Nothing here activates posting or moves money.
CREATE TABLE payment_schema.finance_policy_version (
 id UUID PRIMARY KEY, payload JSONB NOT NULL, content_hash CHAR(64) NOT NULL,
 created_by UUID NOT NULL, reason VARCHAR(1000) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_schema.finance_policy_head (
 singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton), revision BIGINT NOT NULL DEFAULT 0,
 policy_id UUID REFERENCES payment_schema.finance_policy_version(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO payment_schema.finance_policy_head(singleton) VALUES(true);
CREATE TABLE payment_schema.finance_policy_activation (
 id UUID PRIMARY KEY, policy_id UUID NOT NULL REFERENCES payment_schema.finance_policy_version(id),
 revision BIGINT NOT NULL UNIQUE, actor_id UUID NOT NULL, reason VARCHAR(1000) NOT NULL,
 activated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER finance_policy_version_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_policy_version
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
CREATE TRIGGER finance_policy_activation_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON payment_schema.finance_policy_activation
FOR EACH STATEMENT EXECUTE FUNCTION payment_schema.reject_financial_history_mutation();
