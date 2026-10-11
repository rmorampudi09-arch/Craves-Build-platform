ALTER TABLE subscription_schema.subscription_plan
    ADD COLUMN accepting_subscribers BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE subscription_schema.subscription_plan_image (
    plan_id UUID PRIMARY KEY REFERENCES subscription_schema.subscription_plan(id) ON DELETE CASCADE,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    image_bytes BYTEA NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
    updated_by_identity_id UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Turn customer self-service on for plans still carrying the untouched platform default (identified by its exact
-- note and all four flags off, so a policy an admin customised is never overwritten) and audit each change.
WITH updated AS (
    UPDATE subscription_schema.subscription_plan_policy
    SET customer_pause_enabled = TRUE,
        customer_resume_enabled = TRUE,
        customer_cancel_enabled = TRUE,
        customer_skip_enabled = TRUE,
        pause_cutoff_minutes = 0,
        cancel_cutoff_minutes = 0,
        resume_lead_minutes = 1440,
        skip_cutoff_minutes = 1440,
        notes = 'Craves platform default: customer self-service pause, resume, cancel and skip are enabled. Pause and cancel apply to meals not yet sent to the kitchen; skip and resume need 24 hours notice.',
        updated_at = now()
    WHERE status = 'ACTIVE'
      AND notes = 'Craves platform default: customer self-service pause, resume, cancel and skip are disabled until explicitly configured.'
      AND customer_pause_enabled = FALSE
      AND customer_resume_enabled = FALSE
      AND customer_cancel_enabled = FALSE
      AND customer_skip_enabled = FALSE
    RETURNING id, plan_id, version, created_by_identity_id
)
INSERT INTO subscription_schema.subscription_plan_policy_audit (
    id, plan_id, policy_id, actor_identity_id, action, policy_version, reason, created_at
)
SELECT gen_random_uuid(), plan_id, id, created_by_identity_id, 'PLATFORM_DEFAULT_UPDATE', version,
       'Craves platform default: customer self-service pause, resume, cancel and skip are enabled. Pause and cancel apply to meals not yet sent to the kitchen; skip and resume need 24 hours notice.',
       now()
FROM updated;
