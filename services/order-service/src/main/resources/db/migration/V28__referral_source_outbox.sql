-- Additive source-owned referral transport. No existing data is enrolled or repriced.
CREATE TABLE order_schema.referral_source_outbox(
 event_id UUID PRIMARY KEY,event_key VARCHAR(200) NOT NULL UNIQUE,aggregate_id UUID NOT NULL,
 content_hash CHAR(64) NOT NULL,envelope TEXT NOT NULL CHECK(octet_length(envelope)<=131072),
 status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','RECEIVED','DEAD')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 lease_id UUID,lease_until TIMESTAMPTZ,last_code VARCHAR(80),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((status='SENDING')=(lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX referral_source_due ON order_schema.referral_source_outbox(next_attempt_at,event_id) WHERE status IN ('PENDING','SENDING');
CREATE FUNCTION order_schema.guard_referral_source_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Referral source history is immutable' USING ERRCODE='55000';END IF;
 IF ROW(NEW.event_id,NEW.event_key,NEW.aggregate_id,NEW.content_hash,NEW.envelope,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.event_id,OLD.event_key,OLD.aggregate_id,OLD.content_hash,OLD.envelope,OLD.created_at) THEN
 RAISE EXCEPTION 'Referral retries must preserve original identity and content' USING ERRCODE='55000';END IF;
 RETURN NEW;END;$$;
CREATE TRIGGER referral_source_history BEFORE UPDATE OR DELETE ON order_schema.referral_source_outbox FOR EACH ROW EXECUTE FUNCTION order_schema.guard_referral_source_history();
CREATE TRIGGER referral_source_no_truncate BEFORE TRUNCATE ON order_schema.referral_source_outbox FOR EACH STATEMENT EXECUTE FUNCTION order_schema.guard_referral_source_history();
