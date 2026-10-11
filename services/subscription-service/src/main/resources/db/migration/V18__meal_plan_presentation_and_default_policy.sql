-- Fail fast instead of queueing plan reads behind a long transaction; the deploy can simply be retried.
SET LOCAL lock_timeout = '5s';
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

-- Turn customer self-service on for plans still carrying the untouched platform default and audit each change. The
-- match is exactly the one row ensureActiveDefault ever wrote (version 1, old note, four flags off, all four cutoffs
-- and all three policy references NULL), so an admin-saved all-off policy that kept the pre-filled note (a later
-- version, a cutoff or a reference set) is never overwritten.
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
      AND version = 1
      AND pause_cutoff_minutes IS NULL
      AND resume_lead_minutes IS NULL
      AND cancel_cutoff_minutes IS NULL
      AND skip_cutoff_minutes IS NULL
      AND holiday_policy_reference IS NULL
      AND unused_meal_policy_reference IS NULL
      AND refund_policy_reference IS NULL
    RETURNING id, plan_id, version, created_by_identity_id
)
INSERT INTO subscription_schema.subscription_plan_policy_audit (
    id, plan_id, policy_id, actor_identity_id, action, policy_version, reason, created_at
)
SELECT gen_random_uuid(), plan_id, id, created_by_identity_id, 'PLATFORM_DEFAULT_UPDATE', version,
       'Craves platform default: customer self-service pause, resume, cancel and skip are enabled. Pause and cancel apply to meals not yet sent to the kitchen; skip and resume need 24 hours notice.',
       now()
FROM updated;
