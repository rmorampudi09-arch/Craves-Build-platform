-- Additive only. Short applicant-facing application reference and structured correction sections.
CREATE SEQUENCE chef_application_reference_seq START WITH 10001;
-- The volatile default gives every existing application its own reference while the column is added.
ALTER TABLE chef_application ADD COLUMN reference_code VARCHAR(16) NOT NULL
    DEFAULT ('CRV-' || nextval('chef_application_reference_seq'));
ALTER TABLE chef_application ADD CONSTRAINT chef_application_reference_code_key UNIQUE (reference_code);

ALTER TABLE chef_onboarding_draft ADD COLUMN correction_sections VARCHAR(100)
    CHECK (correction_sections ~ '^(personal|kitchen|fssai|documents|bank)(,(personal|kitchen|fssai|documents|bank))*$');
