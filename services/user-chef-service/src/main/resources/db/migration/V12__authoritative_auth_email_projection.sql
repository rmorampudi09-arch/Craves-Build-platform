-- Auth is the only verification authority. Never backfill verification from existing profile email values.
CREATE TABLE auth_email_projection (
    identity_id UUID PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    email_revision BIGINT NOT NULL CHECK (email_revision > 0),
    verified_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE auth_email_projection_receipt (
    event_id UUID PRIMARY KEY,
    identity_id UUID NOT NULL,
    request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    event_revision BIGINT NOT NULL CHECK (event_revision > 0),
    result_revision BIGINT NOT NULL CHECK (result_revision >= event_revision),
    result VARCHAR(16) NOT NULL CHECK (result IN ('APPLIED','DUPLICATE','STALE')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_email_projection_receipt_identity ON auth_email_projection_receipt(identity_id, received_at);
CREATE FUNCTION guard_auth_email_projection() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Auth email projection history cannot be deleted'; END IF;
    IF NEW.identity_id <> OLD.identity_id OR NEW.created_at <> OLD.created_at OR NEW.email_revision <= OLD.email_revision THEN
        RAISE EXCEPTION 'Auth email revisions must advance';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER auth_email_projection_monotonic BEFORE UPDATE OR DELETE ON auth_email_projection
FOR EACH ROW EXECUTE FUNCTION guard_auth_email_projection();
CREATE FUNCTION immutable_auth_email_receipt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Auth email projection receipts are immutable'; END $$;
CREATE TRIGGER auth_email_projection_receipt_immutable BEFORE UPDATE OR DELETE ON auth_email_projection_receipt
FOR EACH ROW EXECUTE FUNCTION immutable_auth_email_receipt();
