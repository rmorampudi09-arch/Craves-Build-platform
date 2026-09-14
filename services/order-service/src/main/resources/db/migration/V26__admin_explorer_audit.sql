-- Additive audit storage only. Domain-table indexes are a separate CONCURRENTLY maintenance step.
CREATE TABLE order_schema.admin_explorer_audit (
    id UUID PRIMARY KEY,
    actor_id UUID NOT NULL,
    correlation_id UUID NOT NULL,
    operation VARCHAR(16) NOT NULL CHECK (operation IN ('SUMMARY','RECORDS')),
    filter_sha256 CHAR(64) NOT NULL,
    record_count INTEGER NOT NULL CHECK (record_count BETWEEN 0 AND 100),
    reason VARCHAR(500) NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_admin_explorer_audit_actor ON order_schema.admin_explorer_audit(actor_id,created_at DESC);
CREATE FUNCTION order_schema.reject_admin_explorer_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Admin explorer audit is append-only'; END; $$;
CREATE TRIGGER admin_explorer_audit_no_edit BEFORE UPDATE OR DELETE ON order_schema.admin_explorer_audit
FOR EACH ROW EXECUTE FUNCTION order_schema.reject_admin_explorer_audit_mutation();
CREATE TRIGGER admin_explorer_audit_no_truncate BEFORE TRUNCATE ON order_schema.admin_explorer_audit
FOR EACH STATEMENT EXECUTE FUNCTION order_schema.reject_admin_explorer_audit_mutation();
