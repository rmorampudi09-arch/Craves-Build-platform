-- Additive review and consent evidence. Historical documents and decisions remain intact.
ALTER TABLE chef_onboarding_draft ADD COLUMN review_status VARCHAR(40) NOT NULL DEFAULT 'DRAFT'
    CHECK (review_status IN ('DRAFT','PENDING','UNDER_REVIEW','MORE_INFORMATION_REQUIRED'));
UPDATE chef_onboarding_draft SET review_status='PENDING' WHERE submitted;
ALTER TABLE chef_onboarding_draft ADD COLUMN correction_reason VARCHAR(2000);
ALTER TABLE chef_onboarding_draft ADD COLUMN terms_version VARCHAR(100);
ALTER TABLE chef_onboarding_draft ADD COLUMN terms_accepted_at TIMESTAMPTZ;
ALTER TABLE chef_onboarding_draft ADD COLUMN bank_enrollment_id UUID;
ALTER TABLE chef_onboarding_draft ADD COLUMN fssai_reviewed_number VARCHAR(14);
ALTER TABLE chef_onboarding_draft ADD COLUMN fssai_reviewed_by UUID;
ALTER TABLE chef_onboarding_draft ADD COLUMN fssai_reviewed_at TIMESTAMPTZ;
ALTER TABLE chef_onboarding_draft ADD COLUMN fssai_review_evidence VARCHAR(2000);
CREATE TABLE chef_onboarding_action_audit (
    id UUID PRIMARY KEY, identity_id UUID NOT NULL REFERENCES chef_onboarding_draft(identity_id),
    actor_id UUID NOT NULL, action VARCHAR(40) NOT NULL, version BIGINT NOT NULL,
    reason VARCHAR(2000), snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE chef_onboarding_document_history (
    id UUID PRIMARY KEY, document_id UUID NOT NULL, identity_id UUID NOT NULL,
    action VARCHAR(40) NOT NULL, snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chef_kyc_document ADD COLUMN removed_at TIMESTAMPTZ;
