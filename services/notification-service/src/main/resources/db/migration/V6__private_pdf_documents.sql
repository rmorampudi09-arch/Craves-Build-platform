-- Additive only. No changes to order/payment/provider state or existing migrations.
CREATE TABLE notification_schema.pdf_document (
    id UUID PRIMARY KEY,
    owner_identity_id UUID NOT NULL,
    request_key VARCHAR(100) NOT NULL,
    request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    document_type VARCHAR(40) NOT NULL CHECK (document_type IN (
        'ORDER_SUMMARY','PAYMENT_RECEIPT','SUBSCRIPTION_RECEIPT',
        'CHEF_ORDER_STATEMENT','CHEF_EARNINGS_STATEMENT','CHEF_SETTLEMENT_STATEMENT')),
    source_reference VARCHAR(160) NOT NULL,
    currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    timezone VARCHAR(80) NOT NULL,
    template_version VARCHAR(60) NOT NULL,
    snapshot TEXT NOT NULL CHECK (octet_length(snapshot) <= 1048576 AND jsonb_typeof(snapshot::jsonb) = 'object'),
    snapshot_hash CHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RENDERING','READY','FAILED')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    blob_key VARCHAR(300),
    pdf_hash CHAR(64),
    byte_count BIGINT CHECK (byte_count BETWEEN 1 AND 4194304),
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ready_at TIMESTAMPTZ,
    UNIQUE (owner_identity_id, request_key),
    UNIQUE (owner_identity_id, id),
    CHECK (status <> 'READY' OR (blob_key IS NOT NULL AND pdf_hash ~ '^[0-9a-f]{64}$' AND byte_count IS NOT NULL AND ready_at IS NOT NULL)),
    CHECK ((status = 'RENDERING') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX ix_pdf_document_owner_page ON notification_schema.pdf_document(owner_identity_id, created_at DESC, id DESC);
CREATE INDEX ix_pdf_document_due ON notification_schema.pdf_document(next_attempt_at, created_at, id) WHERE status = 'QUEUED';
CREATE INDEX ix_pdf_document_stale ON notification_schema.pdf_document(lease_until, id) WHERE status = 'RENDERING';

CREATE TABLE notification_schema.pdf_document_email (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL,
    owner_identity_id UUID NOT NULL,
    request_key VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENDING','ACCEPTED','FAILED','UNKNOWN')),
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    provider_operation_id VARCHAR(200),
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, request_key),
    FOREIGN KEY(owner_identity_id, document_id) REFERENCES notification_schema.pdf_document(owner_identity_id,id),
    CHECK ((status = 'SENDING') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX ix_pdf_email_due ON notification_schema.pdf_document_email(created_at,id) WHERE status = 'QUEUED';
CREATE INDEX ix_pdf_email_owner ON notification_schema.pdf_document_email(owner_identity_id,document_id,created_at DESC,id DESC);
CREATE INDEX ix_pdf_email_stale ON notification_schema.pdf_document_email(lease_until,id) WHERE status = 'SENDING';

CREATE TABLE notification_schema.pdf_document_audit (
    id BIGSERIAL PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES notification_schema.pdf_document(id),
    actor_identity_id UUID,
    event_type VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_pdf_document_audit ON notification_schema.pdf_document_audit(document_id,created_at,id);

CREATE FUNCTION notification_schema.guard_pdf_document_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.owner_identity_id, NEW.request_key, NEW.request_hash, NEW.document_type,
        NEW.source_reference, NEW.currency, NEW.timezone, NEW.template_version,
        NEW.snapshot, NEW.snapshot_hash, NEW.created_at, NEW.id)
       IS DISTINCT FROM
       (OLD.owner_identity_id, OLD.request_key, OLD.request_hash, OLD.document_type,
        OLD.source_reference, OLD.currency, OLD.timezone, OLD.template_version,
        OLD.snapshot, OLD.snapshot_hash, OLD.created_at, OLD.id) THEN
        RAISE EXCEPTION 'PDF source snapshot is immutable';
    END IF;
    IF OLD.status = 'READY' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Issued PDF artifact is immutable';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER trg_pdf_snapshot_immutable BEFORE UPDATE ON notification_schema.pdf_document
    FOR EACH ROW EXECUTE FUNCTION notification_schema.guard_pdf_document_snapshot();

CREATE FUNCTION notification_schema.guard_pdf_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'PDF audit records are append only';
END $$;
CREATE TRIGGER trg_pdf_audit_append_only BEFORE UPDATE OR DELETE ON notification_schema.pdf_document_audit
    FOR EACH ROW EXECUTE FUNCTION notification_schema.guard_pdf_audit();
