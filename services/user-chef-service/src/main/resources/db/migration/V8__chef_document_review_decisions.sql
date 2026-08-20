ALTER TABLE chef_kyc_document
    DROP CONSTRAINT IF EXISTS ck_chef_kyc_document_status;

ALTER TABLE chef_kyc_document
    ADD COLUMN IF NOT EXISTS review_reason VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS reviewed_by_identity_id UUID,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE chef_kyc_document
    ADD CONSTRAINT ck_chef_kyc_document_status
    CHECK (status IN ('UPLOADED', 'APPROVED', 'REJECTED'));

CREATE INDEX IF NOT EXISTS ix_chef_kyc_document_application_status
    ON chef_kyc_document (application_id, status, document_type);

CREATE TABLE IF NOT EXISTS admin_chef_document_decision_audit (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL REFERENCES chef_application(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES chef_kyc_document(id) ON DELETE CASCADE,
    admin_identity_id UUID NOT NULL,
    decision VARCHAR(20) NOT NULL,
    reason VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_admin_chef_document_decision CHECK (decision IN ('APPROVED', 'REJECTED')),
    CONSTRAINT ck_admin_chef_document_rejection_reason CHECK (
        decision <> 'REJECTED' OR char_length(trim(reason)) BETWEEN 3 AND 1000
    )
);

CREATE INDEX IF NOT EXISTS ix_admin_chef_document_decision_document
    ON admin_chef_document_decision_audit (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_admin_chef_document_decision_application
    ON admin_chef_document_decision_audit (application_id, created_at DESC);

COMMENT ON TABLE admin_chef_document_decision_audit IS
    'Append-only audit of administrator decisions for individual Chef KYC documents.';
