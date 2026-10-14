-- Additive only. First-touch marketing link (utm_*) that brought a chef applicant (14 Oct 2026).
-- The draft records it on its first save, before any application row exists; the application copies it once created.
ALTER TABLE chef_onboarding_draft
    ADD COLUMN utm_source VARCHAR(64),
    ADD COLUMN utm_medium VARCHAR(64),
    ADD COLUMN utm_campaign VARCHAR(64),
    ADD COLUMN utm_content VARCHAR(64);

ALTER TABLE chef_application
    ADD COLUMN utm_source VARCHAR(64),
    ADD COLUMN utm_medium VARCHAR(64),
    ADD COLUMN utm_campaign VARCHAR(64),
    ADD COLUMN utm_content VARCHAR(64);
