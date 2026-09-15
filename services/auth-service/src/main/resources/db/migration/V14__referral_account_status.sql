CREATE TABLE referral_account_state(
 identity_id UUID PRIMARY KEY REFERENCES referral_enrollment(identity_id),source_version INTEGER NOT NULL DEFAULT 1
);
CREATE FUNCTION publish_referral_account_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_value INTEGER;event UUID:=gen_random_uuid();body JSONB;content TEXT;
BEGIN
 IF OLD.status IS NOT DISTINCT FROM NEW.status OR NOT EXISTS(SELECT 1 FROM referral_enrollment WHERE identity_id=NEW.id) THEN RETURN NULL;END IF;
 INSERT INTO referral_account_state(identity_id,source_version) VALUES(NEW.id,2)
  ON CONFLICT(identity_id) DO UPDATE SET source_version=referral_account_state.source_version+1 RETURNING source_version INTO version_value;
 body:=jsonb_build_object('userId',NEW.id,'version',version_value,'active',NEW.status='ACTIVE','reasonRef','auth-account-status/'||NEW.id||'/'||version_value);
 content:=jsonb_build_object('eventType','account.status','aggregateId',NEW.id,'occurredAt',NEW.updated_at,'payload',body)::text;
 INSERT INTO referral_source_outbox(event_id,event_key,aggregate_id,content_hash,envelope)
 VALUES(event,'account/'||NEW.id||'/status/'||version_value,NEW.id,encode(sha256(convert_to(content,'UTF8')),'hex'),(content::jsonb||jsonb_build_object('eventId',event))::text);
 RETURN NULL;
END;$$;
CREATE TRIGGER referral_account_status_outbox AFTER UPDATE ON auth_identity
 FOR EACH ROW EXECUTE FUNCTION publish_referral_account_status();
