CREATE TABLE referral_enrollment(
 identity_id UUID PRIMARY KEY REFERENCES auth_identity(id),
 event_id UUID NOT NULL UNIQUE REFERENCES referral_source_outbox(event_id),
 parent_code VARCHAR(16),terms_version VARCHAR(100) NOT NULL,contact_hash CHAR(64) NOT NULL,
 registered_at TIMESTAMPTZ NOT NULL,accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION reject_referral_enrollment_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Referral attribution and consent are immutable' USING ERRCODE='55000';END;$$;
CREATE TRIGGER referral_enrollment_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON referral_enrollment
 FOR EACH STATEMENT EXECUTE FUNCTION reject_referral_enrollment_mutation();
