-- Additive: existing applications and document decisions are left intact.
ALTER TABLE chef_kyc_document DROP CONSTRAINT ck_chef_kyc_document_type;
ALTER TABLE chef_kyc_document ADD CONSTRAINT ck_chef_kyc_document_type CHECK (
    document_type IN ('APPLICANT_PHOTO','GOVERNMENT_ID_FRONT','GOVERNMENT_ID_BACK','TAX_ID_CARD',
                     'AADHAAR_CARD','PAN_CARD','KITCHEN_PHOTO_1','KITCHEN_PHOTO_2','FSSAI_LICENSE')
);
CREATE TABLE chef_onboarding_draft (
    identity_id UUID PRIMARY KEY,
    application_id UUID UNIQUE REFERENCES chef_application(id),
    details JSONB NOT NULL,
    submitted BOOLEAN NOT NULL DEFAULT false,
    version BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE chef_onboarding_help (
    id UUID PRIMARY KEY,
    identity_id UUID NOT NULL REFERENCES chef_onboarding_draft(identity_id),
    request_key UUID NOT NULL,
    support_case_id UUID NOT NULL REFERENCES support_case(id),
    case_number VARCHAR(80) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    details JSONB NOT NULL,
    message VARCHAR(2000) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONTACTED','RESOLVED')),
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(identity_id, request_key)
);
CREATE UNIQUE INDEX ux_chef_onboarding_open_help ON chef_onboarding_help(identity_id) WHERE status <> 'RESOLVED';
CREATE TABLE chef_onboarding_help_audit (
    id UUID PRIMARY KEY,
    help_id UUID NOT NULL REFERENCES chef_onboarding_help(id),
    actor_id UUID NOT NULL,
    old_status VARCHAR(20) NOT NULL,
    new_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE chef_onboarding_content (
    id UUID PRIMARY KEY,
    language VARCHAR(8) NOT NULL,
    title VARCHAR(160) NOT NULL,
    kind VARCHAR(10) NOT NULL CHECK(kind IN ('ARTICLE','VIDEO')),
    body TEXT,
    blob_name VARCHAR(700),
    content_type VARCHAR(100),
    file_size_bytes BIGINT,
    published BOOLEAN NOT NULL DEFAULT false,
    ready BOOLEAN NOT NULL DEFAULT false,
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    upload_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (NOT published OR ready),
    CHECK (kind <> 'VIDEO' OR (blob_name IS NOT NULL AND file_size_bytes BETWEEN 1 AND 104857600)),
    CHECK (kind <> 'ARTICLE' OR body IS NOT NULL)
);
CREATE INDEX ix_chef_onboarding_content_language ON chef_onboarding_content(language, published, created_at DESC);
CREATE TABLE chef_onboarding_content_audit (
    id UUID PRIMARY KEY,
    content_id UUID NOT NULL REFERENCES chef_onboarding_content(id),
    actor_id UUID NOT NULL,
    action VARCHAR(30) NOT NULL,
    version BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_chef_onboarding_help_paging ON chef_onboarding_help(created_at DESC,id DESC);
