-- V7 is reserved for the reviewed, not-yet-deployed Academy migration.
CREATE TABLE admin_session_family (
    id UUID PRIMARY KEY,
    identity_id UUID NOT NULL REFERENCES auth_identity(id) ON DELETE CASCADE,
    authenticated_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    token_version BIGINT NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoke_reason VARCHAR(160),
    UNIQUE (identity_id, authenticated_at),
    CHECK (expires_at = authenticated_at + INTERVAL '8 hours')
);
CREATE INDEX ix_admin_session_family_identity ON admin_session_family(identity_id);
ALTER TABLE refresh_session ADD COLUMN admin_family_id UUID REFERENCES admin_session_family(id);
ALTER TABLE refresh_session ADD COLUMN rotation_request_id UUID;
CREATE INDEX ix_refresh_session_admin_family ON refresh_session(admin_family_id) WHERE admin_family_id IS NOT NULL;
COMMENT ON TABLE admin_session_family IS 'Admin-only absolute session deadline from verified Firebase auth_time; rotations never extend it.';
