-- Additive. Which chef sign-up emails Waitlist@craves.in already got; people already in the flow are muted.
CREATE TABLE chef_signup_alert (
    identity_id UUID PRIMARY KEY,
    last_rank SMALLINT NOT NULL,
    last_rank_at TIMESTAMPTZ NOT NULL,
    help_alerted_id UUID,
    stall_alerted BOOLEAN NOT NULL DEFAULT false,
    muted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO chef_signup_alert(identity_id, last_rank, last_rank_at, muted)
SELECT identity_id, 0, now(), true FROM chef_onboarding_visit
UNION
SELECT identity_id, 0, now(), true FROM chef_onboarding_draft
ON CONFLICT (identity_id) DO NOTHING;
