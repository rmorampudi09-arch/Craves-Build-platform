ALTER TABLE referral_schema.member ADD COLUMN registration_hash VARCHAR(64) NOT NULL;
ALTER TABLE referral_schema.order_snapshot ADD COLUMN binding_hash VARCHAR(64) NOT NULL;
ALTER TABLE referral_schema.order_state ADD COLUMN delivery_hash VARCHAR(64);
ALTER TABLE referral_schema.order_state ADD COLUMN refund_hash VARCHAR(64);
ALTER TABLE referral_schema.order_state ADD COLUMN finance_hash VARCHAR(64);

CREATE FUNCTION referral_schema.checkout_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'first_qualifying_confirmed'-'full_refund') IS DISTINCT FROM (to_jsonb(OLD)-'first_qualifying_confirmed'-'full_refund')
    OR (OLD.full_refund AND NOT NEW.full_refund) OR (OLD.first_qualifying_confirmed AND NOT NEW.first_qualifying_confirmed) THEN
    RAISE EXCEPTION 'REFERRAL_CHECKOUT_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER checkout_guard BEFORE UPDATE OR DELETE ON referral_schema.checkout FOR EACH ROW EXECUTE FUNCTION referral_schema.checkout_guard();
CREATE FUNCTION referral_schema.inbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'attempts'-'next_attempt_at'-'applied_at'-'last_error')
    IS DISTINCT FROM (to_jsonb(OLD)-'status'-'attempts'-'next_attempt_at'-'applied_at'-'last_error') THEN
    RAISE EXCEPTION 'REFERRAL_INBOX_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inbox_guard BEFORE UPDATE OR DELETE ON referral_schema.inbox FOR EACH ROW EXECUTE FUNCTION referral_schema.inbox_guard();
CREATE FUNCTION referral_schema.discount_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at')
    OR NOT (OLD.status='RESERVED' AND NEW.status IN ('CONSUMED','RELEASED')) THEN
    RAISE EXCEPTION 'INVALID_DISCOUNT_TRANSITION' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER discount_guard BEFORE UPDATE OR DELETE ON referral_schema.discount_reservation FOR EACH ROW EXECUTE FUNCTION referral_schema.discount_guard();
CREATE FUNCTION referral_schema.activation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE maker uuid; refs jsonb;
BEGIN
  SELECT created_by,approvals INTO STRICT maker,refs FROM referral_schema.policy WHERE id=NEW.policy_id;
  IF maker IS NULL OR maker=NEW.approved_by OR NEW.effective_at<NEW.activated_at
    OR NOT (refs ?& ARRAY['legalReviewRef','termsVersion','taxReviewRef','privacyReviewRef','fundingReviewRef','multiChefDecisionRef','payoutReviewRef']) THEN
    RAISE EXCEPTION 'POLICY_APPROVAL_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER activation_guard BEFORE INSERT ON referral_schema.policy_activation FOR EACH ROW EXECUTE FUNCTION referral_schema.activation_guard();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA referral_schema FROM PUBLIC;
