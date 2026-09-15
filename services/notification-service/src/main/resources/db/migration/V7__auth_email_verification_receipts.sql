-- Dedicated OTP transport receipt. No clear code, email address, body or recoverable payload is persisted.
CREATE TABLE notification_schema.auth_email_verification_receipt (
    challenge_id UUID PRIMARY KEY,
    identity_id UUID NOT NULL,
    request_fingerprint CHAR(64) NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
    status VARCHAR(16) NOT NULL CHECK (status IN ('UNKNOWN','ACCEPTED','FAILED')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    CHECK ((status = 'UNKNOWN') = (completed_at IS NULL))
);
CREATE FUNCTION notification_schema.guard_auth_email_receipt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Email transport history is immutable'; END IF;
    IF NEW.challenge_id <> OLD.challenge_id OR NEW.identity_id <> OLD.identity_id OR
       NEW.request_fingerprint <> OLD.request_fingerprint OR NEW.expires_at <> OLD.expires_at OR
       NEW.created_at <> OLD.created_at OR OLD.status <> 'UNKNOWN' OR NEW.status NOT IN ('ACCEPTED','FAILED') THEN
        RAISE EXCEPTION 'Invalid email receipt transition';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER auth_email_receipt_immutable BEFORE UPDATE OR DELETE ON notification_schema.auth_email_verification_receipt
FOR EACH ROW EXECUTE FUNCTION notification_schema.guard_auth_email_receipt();
