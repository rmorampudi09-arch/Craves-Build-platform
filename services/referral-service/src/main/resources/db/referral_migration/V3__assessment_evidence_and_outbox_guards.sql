ALTER TABLE referral_schema.recipient_assessment ADD COLUMN source_hash VARCHAR(64) NOT NULL;
ALTER TABLE referral_schema.recipient_assessment ADD COLUMN annual_threshold_review_ref VARCHAR(180);
CREATE UNIQUE INDEX assessment_version_time ON referral_schema.recipient_assessment(user_id,assessed_at);
CREATE FUNCTION referral_schema.outbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'lease_id'-'lease_until'-'attempts'-'acknowledged_at') IS DISTINCT FROM
      (to_jsonb(OLD)-'status'-'lease_id'-'lease_until'-'attempts'-'acknowledged_at')
    OR (OLD.status='ACKED' AND NEW.status<>'ACKED') THEN
    RAISE EXCEPTION 'REFERRAL_OUTBOX_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbox_guard BEFORE UPDATE OR DELETE ON referral_schema.outbox FOR EACH ROW EXECUTE FUNCTION referral_schema.outbox_guard();
CREATE FUNCTION referral_schema.fraud_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'resolved_at'-'resolved_by') IS DISTINCT FROM
      (to_jsonb(OLD)-'status'-'resolved_at'-'resolved_by') OR OLD.status<>'OPEN' OR NEW.status NOT IN ('CLEARED','CONFIRMED') THEN
    RAISE EXCEPTION 'FRAUD_REVIEW_HISTORY_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fraud_guard BEFORE UPDATE OR DELETE ON referral_schema.fraud_case FOR EACH ROW EXECUTE FUNCTION referral_schema.fraud_guard();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA referral_schema FROM PUBLIC;
