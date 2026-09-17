-- Database defenses are installed before V2 introduces source-hash columns.
CREATE FUNCTION referral_schema.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'REFERRAL_IMMUTABLE_RECORD' USING ERRCODE='23514';
END;
$$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['policy','policy_activation','order_snapshot','first_checkout_claim','reversal','journal','budget_journal','credited_referral','recipient_assessment','audit'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON referral_schema.%I FOR EACH ROW EXECUTE FUNCTION referral_schema.immutable()',t||'_immutable',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON referral_schema.%I FOR EACH STATEMENT EXECUTE FUNCTION referral_schema.immutable()',t||'_no_truncate',t);
 END LOOP;
END;
$$;
CREATE FUNCTION referral_schema.member_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p referral_schema.member%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'REFERRAL_ATTRIBUTION_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'is_active'-'source_version') IS DISTINCT FROM (to_jsonb(OLD)-'is_active'-'source_version') OR NEW.source_version<=OLD.source_version THEN
   RAISE EXCEPTION 'REFERRAL_ATTRIBUTION_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.parent_id IS NULL THEN
  IF NEW.path IS DISTINCT FROM ARRAY[NEW.user_id] THEN RAISE EXCEPTION 'INVALID_ROOT_PATH' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT * INTO STRICT p FROM referral_schema.member WHERE user_id=NEW.parent_id FOR SHARE;
  IF NOT p.is_active OR NEW.user_id=ANY(p.path) OR p.registered_at>NEW.registered_at OR NEW.path IS DISTINCT FROM array_append(p.path,NEW.user_id) THEN
   RAISE EXCEPTION 'INVALID_REFERRAL_PARENT' USING ERRCODE='23514';
  END IF;
  IF (NEW.contact_hash IS NOT NULL AND NEW.contact_hash=p.contact_hash) OR (NEW.payment_hash IS NOT NULL AND NEW.payment_hash=p.payment_hash)
    OR (NEW.device_hash IS NOT NULL AND NEW.device_hash=p.device_hash) THEN
   RAISE EXCEPTION 'SELF_REFERRAL_SIGNAL' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER member_guard BEFORE INSERT OR UPDATE OR DELETE ON referral_schema.member FOR EACH ROW EXECUTE FUNCTION referral_schema.member_guard();
CREATE FUNCTION referral_schema.snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p uuid[]; expected uuid[];
BEGIN
 SELECT path INTO STRICT p FROM referral_schema.member WHERE user_id=NEW.seller_id;
 SELECT COALESCE(array_agg(p[i] ORDER BY i DESC),'{}'::uuid[]) INTO expected FROM generate_series(greatest(1,cardinality(p)-3),cardinality(p)-1) i;
 IF NEW.ancestor_ids IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SNAPSHOT_CHAIN_MISMATCH' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER snapshot_guard BEFORE INSERT ON referral_schema.order_snapshot FOR EACH ROW EXECUTE FUNCTION referral_schema.snapshot_guard();
CREATE FUNCTION referral_schema.reward_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s referral_schema.order_snapshot%ROWTYPE; c referral_schema.checkout%ROWTYPE; p referral_schema.policy%ROWTYPE; used numeric; parent uuid;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'REFERRAL_LEDGER_APPEND_ONLY' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'status'-'settled_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'settled_at') OR NOT
   ((OLD.status='PENDING' AND NEW.status IN ('CREDITED','CANCELLED')) OR (OLD.status='CREDITED' AND NEW.status='REVERSED')) THEN
   RAISE EXCEPTION 'REFERRAL_LEDGER_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.status<>'PENDING' THEN RAISE EXCEPTION 'REWARD_MUST_START_PENDING' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT c FROM referral_schema.checkout WHERE checkout_id=NEW.checkout_id;
 SELECT * INTO STRICT p FROM referral_schema.policy WHERE id=c.policy_id;
 IF NEW.policy_id<>p.id THEN RAISE EXCEPTION 'REWARD_POLICY_MISMATCH' USING ERRCODE='23514'; END IF;
 IF NEW.track='UPLINE' THEN
  SELECT * INTO STRICT s FROM referral_schema.order_snapshot WHERE order_id=NEW.order_id FOR UPDATE;
  IF s.checkout_id<>NEW.checkout_id OR s.ancestor_ids[NEW.level] IS DISTINCT FROM NEW.beneficiary_id
    OR NEW.rate_bps<>(CASE NEW.level WHEN 1 THEN p.l1_bps WHEN 2 THEN p.l2_bps ELSE p.l3_bps END) THEN
   RAISE EXCEPTION 'REWARD_CHAIN_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(sum(amount_paise),0) INTO used FROM referral_schema.reward WHERE order_id=NEW.order_id AND track='UPLINE';
  IF (used+NEW.amount_paise)*10000>s.food_paise::numeric*p.cap_bps THEN
   RAISE EXCEPTION 'REFERRAL_HARD_CAP_BREACH' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT parent_id INTO STRICT parent FROM referral_schema.member WHERE user_id=c.buyer_id;
  IF NEW.amount_paise<>p.customer_bonus_paise OR NEW.beneficiary_id IS DISTINCT FROM parent OR NOT c.first_qualifying_confirmed THEN
   RAISE EXCEPTION 'CUSTOMER_BONUS_MISMATCH' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER reward_guard BEFORE INSERT OR UPDATE OR DELETE ON referral_schema.reward FOR EACH ROW EXECUTE FUNCTION referral_schema.reward_guard();
CREATE FUNCTION referral_schema.apply_journal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=referral_schema,pg_temp AS $$
BEGIN
 UPDATE referral_schema.wallet SET pending_paise=pending_paise+NEW.pending_delta,available_paise=available_paise+NEW.available_delta,
  reserved_paise=reserved_paise+NEW.reserved_delta,updated_at=now() WHERE user_id=NEW.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_ENROLLED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER journal_balance AFTER INSERT ON referral_schema.journal FOR EACH ROW EXECUTE FUNCTION referral_schema.apply_journal();
CREATE FUNCTION referral_schema.apply_budget() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=referral_schema,pg_temp AS $$
BEGIN
 UPDATE referral_schema.budget SET available_paise=available_paise+NEW.amount_paise WHERE track=NEW.track;
 RETURN NEW;
END;
$$;
CREATE TRIGGER budget_balance AFTER INSERT ON referral_schema.budget_journal FOR EACH ROW EXECUTE FUNCTION referral_schema.apply_budget();
CREATE FUNCTION referral_schema.reversal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original bigint; reversed numeric;
BEGIN
 SELECT amount_paise INTO STRICT original FROM referral_schema.reward WHERE id=NEW.reward_id FOR UPDATE;
 SELECT COALESCE(sum(amount_paise),0) INTO reversed FROM referral_schema.reversal WHERE reward_id=NEW.reward_id;
 IF reversed+NEW.amount_paise>original THEN RAISE EXCEPTION 'REFERRAL_OVER_REVERSAL' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER reversal_guard BEFORE INSERT ON referral_schema.reversal FOR EACH ROW EXECUTE FUNCTION referral_schema.reversal_guard();
CREATE FUNCTION referral_schema.source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE basis bigint;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'REFERRAL_SOURCE_DELETE_FORBIDDEN' USING ERRCODE='23514'; END IF;
 SELECT food_paise INTO STRICT basis FROM referral_schema.order_snapshot WHERE order_id=NEW.order_id;
 IF NEW.order_id<>OLD.order_id OR NEW.refunded_food_paise<OLD.refunded_food_paise OR NEW.refunded_food_paise>basis
  OR NEW.confirmed_refund_paise>basis OR NEW.delivery_version<OLD.delivery_version OR NEW.refund_version<OLD.refund_version
  OR NEW.finance_version<OLD.finance_version OR (OLD.awarded AND NOT NEW.awarded)
  OR (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS DISTINCT FROM OLD.delivered_at) THEN
  RAISE EXCEPTION 'INVALID_REFERRAL_SOURCE_TRANSITION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER source_guard BEFORE UPDATE OR DELETE ON referral_schema.order_state FOR EACH ROW EXECUTE FUNCTION referral_schema.source_guard();
CREATE FUNCTION referral_schema.reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RESERVATION_HISTORY_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.kind<>OLD.kind OR NEW.amount_paise<>OLD.amount_paise
  OR NEW.checkout_id IS DISTINCT FROM OLD.checkout_id OR NEW.assessment_id IS DISTINCT FROM OLD.assessment_id OR NEW.requested_at<>OLD.requested_at
  OR (OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id)
  OR (OLD.approved_by IS NOT NULL AND (NEW.approved_by,NEW.net_paise,NEW.withholding_paise,NEW.approval_ref)
    IS DISTINCT FROM (OLD.approved_by,OLD.net_paise,OLD.withholding_paise,OLD.approval_ref))
  OR NOT ((OLD.status='RESERVED' AND NEW.status IN ('APPROVED','SPENT','RELEASED')) OR (OLD.status='APPROVED' AND NEW.status IN ('SUBMITTED','RELEASED'))
    OR (OLD.status='SUBMITTED' AND NEW.status IN ('PAID','RELEASED','UNKNOWN')) OR (OLD.status='UNKNOWN' AND NEW.status IN ('PAID','RELEASED'))) THEN
  RAISE EXCEPTION 'INVALID_RESERVATION_TRANSITION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER reservation_guard BEFORE UPDATE OR DELETE ON referral_schema.reservation FOR EACH ROW EXECUTE FUNCTION referral_schema.reservation_guard();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA referral_schema FROM PUBLIC;
