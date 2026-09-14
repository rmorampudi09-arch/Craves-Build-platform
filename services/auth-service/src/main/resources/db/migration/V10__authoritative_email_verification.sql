ALTER TABLE auth_identity ADD COLUMN email_revision BIGINT NOT NULL DEFAULT 0 CHECK (email_revision >= 0);
ALTER TABLE auth_identity ADD COLUMN email_verified_at TIMESTAMPTZ;

CREATE TABLE auth_email_challenge (
    id UUID PRIMARY KEY,
    identity_id UUID NOT NULL REFERENCES auth_identity(id),
    request_id UUID NOT NULL,
    parent_challenge_id UUID REFERENCES auth_email_challenge(id),
    pending_email VARCHAR(254) NOT NULL,
    recipient_key CHAR(64) NOT NULL,
    code_mac CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','VERIFIED','SUPERSEDED','EXHAUSTED','EXPIRED')),
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING','ACCEPTED','UNKNOWN','UNAVAILABLE')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    resend_available_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    UNIQUE(identity_id, request_id),
    CHECK (expires_at > created_at AND resend_available_at > created_at)
);
CREATE UNIQUE INDEX auth_email_one_pending ON auth_email_challenge(identity_id) WHERE status='PENDING';
CREATE INDEX auth_email_identity_issued ON auth_email_challenge(identity_id, created_at DESC);
CREATE INDEX auth_email_recipient_issued ON auth_email_challenge(recipient_key, created_at DESC);

CREATE TABLE auth_email_projection_outbox (
    event_id UUID PRIMARY KEY,
    identity_id UUID NOT NULL REFERENCES auth_identity(id),
    email VARCHAR(254) NOT NULL,
    email_revision BIGINT NOT NULL CHECK (email_revision > 0),
    verified_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    delivered_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL,
    lease_id UUID,
    lease_expires_at TIMESTAMPTZ,
    last_error_code VARCHAR(64),
    UNIQUE(identity_id, email_revision)
);
CREATE INDEX auth_email_outbox_pending ON auth_email_projection_outbox(next_attempt_at) WHERE delivered_at IS NULL;

CREATE TABLE auth_email_audit (
    id UUID PRIMARY KEY,
    identity_id UUID NOT NULL,
    challenge_id UUID,
    action VARCHAR(40) NOT NULL,
    email_revision BIGINT,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX auth_email_audit_identity ON auth_email_audit(identity_id, created_at DESC);
CREATE FUNCTION auth_email_immutable_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Email verification audit is immutable'; END;
$$;
CREATE TRIGGER auth_email_audit_immutable BEFORE UPDATE OR DELETE ON auth_email_audit
FOR EACH ROW EXECUTE FUNCTION auth_email_immutable_audit();
CREATE FUNCTION auth_email_outbox_payload_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Email projection history is immutable'; END IF;
  IF (NEW.event_id,NEW.identity_id,NEW.email,NEW.email_revision,NEW.verified_at,NEW.created_at)
     IS DISTINCT FROM (OLD.event_id,OLD.identity_id,OLD.email,OLD.email_revision,OLD.verified_at,OLD.created_at)
     THEN RAISE EXCEPTION 'Email projection payload is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER auth_email_outbox_immutable BEFORE UPDATE OR DELETE ON auth_email_projection_outbox
FOR EACH ROW EXECUTE FUNCTION auth_email_outbox_payload_immutable();
