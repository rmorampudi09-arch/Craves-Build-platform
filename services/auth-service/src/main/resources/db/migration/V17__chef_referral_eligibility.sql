-- Only opted-in identities are observed. This does not create consent or backfill ancestry.
CREATE TABLE referral_chef_observation(
 identity_id UUID PRIMARY KEY REFERENCES referral_enrollment(identity_id),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
 next_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX referral_chef_observation_due ON referral_chef_observation(next_at,identity_id);
CREATE FUNCTION refresh_referral_chef_observation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO referral_chef_observation(identity_id) VALUES(NEW.identity_id) ON CONFLICT DO NOTHING;
 RETURN NULL;
END;$$;
CREATE TRIGGER referral_chef_enrolled AFTER INSERT ON referral_enrollment
 FOR EACH ROW EXECUTE FUNCTION refresh_referral_chef_observation();
INSERT INTO referral_chef_observation(identity_id) SELECT identity_id FROM referral_enrollment ON CONFLICT DO NOTHING;
CREATE FUNCTION invalidate_referral_chef_observation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identity_value UUID;
BEGIN
 IF TG_TABLE_NAME='auth_identity' THEN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NULL; END IF;
  identity_value:=NEW.id;
 ELSE
  IF TG_OP='DELETE' THEN identity_value:=OLD.identity_id; ELSE identity_value:=NEW.identity_id; END IF;
 END IF;
 UPDATE referral_chef_observation SET next_at=now() WHERE identity_id=identity_value;
 RETURN NULL;
END;$$;
CREATE TRIGGER referral_chef_role_changed AFTER INSERT OR DELETE ON auth_identity_role
 FOR EACH ROW EXECUTE FUNCTION invalidate_referral_chef_observation();
CREATE TRIGGER referral_chef_account_changed AFTER UPDATE ON auth_identity
 FOR EACH ROW EXECUTE FUNCTION invalidate_referral_chef_observation();
