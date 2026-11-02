-- Additive: everyone who opened the Chef application after their phone OTP sign-in, with that phone,
-- so admins can reach people who never saved the form.
CREATE TABLE chef_onboarding_visit (
    identity_id UUID PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
