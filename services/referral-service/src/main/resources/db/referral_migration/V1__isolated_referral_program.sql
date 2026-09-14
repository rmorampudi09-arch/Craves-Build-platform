-- This is NOT in any existing service's Flyway location. Run only with the referral migration role.
CREATE SCHEMA IF NOT EXISTS referral_schema;

CREATE TABLE referral_schema.policy (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  l1_bps INTEGER NOT NULL CHECK (l1_bps >= 0),
  l2_bps INTEGER NOT NULL CHECK (l2_bps >= 0),
  l3_bps INTEGER NOT NULL CHECK (l3_bps >= 0),
  cap_bps INTEGER NOT NULL CHECK (cap_bps BETWEEN 1 AND 400),
  hold_days INTEGER NOT NULL CHECK (hold_days BETWEEN 1 AND 365),
  minimum_paise BIGINT NOT NULL CHECK (minimum_paise BETWEEN 1 AND 1000000000000),
  customer_bonus_paise BIGINT NOT NULL CHECK (customer_bonus_paise BETWEEN 0 AND 1000000000000),
  invitee_discount_paise BIGINT NOT NULL CHECK (invitee_discount_paise BETWEEN 0 AND 1000000000000),
  approvals JSONB NOT NULL DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (l1_bps + l2_bps + l3_bps <= cap_bps)
);
INSERT INTO referral_schema.policy(l1_bps,l2_bps,l3_bps,cap_bps,hold_days,minimum_paise,customer_bonus_paise,invitee_discount_paise)
VALUES (200,120,80,400,14,80000,40000,25000);
CREATE TABLE referral_schema.policy_activation (
  policy_id BIGINT PRIMARY KEY REFERENCES referral_schema.policy(id),
  effective_at TIMESTAMPTZ NOT NULL UNIQUE,
  approved_by UUID NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE referral_schema.member (
  user_id UUID PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE CHECK (code ~ '^[2-9A-HJ-NP-Z]{16}$'),
  parent_id UUID REFERENCES referral_schema.member(user_id),
  path UUID[] NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_version INTEGER NOT NULL DEFAULT 1 CHECK (source_version > 0),
  contact_hash VARCHAR(64),
  device_hash VARCHAR(64),
  payment_hash VARCHAR(64),
  fingerprint_consent BOOLEAN NOT NULL DEFAULT false,
  terms_version VARCHAR(100) NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> user_id),
  CHECK (cardinality(path) BETWEEN 1 AND 10000 AND path[cardinality(path)] = user_id),
  CHECK (device_hash IS NULL OR fingerprint_consent),
  CHECK (contact_hash IS NULL OR contact_hash ~ '^[0-9a-f]{64}$'),
  CHECK (device_hash IS NULL OR device_hash ~ '^[0-9a-f]{64}$'),
  CHECK (payment_hash IS NULL OR payment_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX member_parent ON referral_schema.member(parent_id,user_id);
CREATE INDEX member_path ON referral_schema.member USING gin(path);
CREATE INDEX member_contact ON referral_schema.member(contact_hash) WHERE contact_hash IS NOT NULL;
CREATE INDEX member_device ON referral_schema.member(device_hash) WHERE device_hash IS NOT NULL;
CREATE INDEX member_payment ON referral_schema.member(payment_hash) WHERE payment_hash IS NOT NULL;

CREATE TABLE referral_schema.checkout (
  checkout_id UUID PRIMARY KEY,
  buyer_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
  food_paise BIGINT NOT NULL CHECK (food_paise BETWEEN 0 AND 1000000000000),
  payable_paise BIGINT NOT NULL CHECK (payable_paise BETWEEN 0 AND 1000000000000),
  chef_order_count INTEGER NOT NULL CHECK (chef_order_count BETWEEN 1 AND 100),
  policy_id BIGINT NOT NULL REFERENCES referral_schema.policy(id),
  created_at TIMESTAMPTZ NOT NULL,
  first_qualifying_confirmed BOOLEAN NOT NULL DEFAULT false,
  full_refund BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE referral_schema.order_snapshot (
  order_id UUID PRIMARY KEY,
  checkout_id UUID NOT NULL REFERENCES referral_schema.checkout(checkout_id),
  seller_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
  food_paise BIGINT NOT NULL CHECK (food_paise BETWEEN 0 AND 1000000000000),
  ancestor_ids UUID[] NOT NULL CHECK (cardinality(ancestor_ids) <= 3),
  source_hash VARCHAR(64) NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX order_snapshot_checkout ON referral_schema.order_snapshot(checkout_id,order_id);
CREATE TABLE referral_schema.order_state (
  order_id UUID PRIMARY KEY REFERENCES referral_schema.order_snapshot(order_id),
  delivered_at TIMESTAMPTZ,
  delivery_version INTEGER NOT NULL DEFAULT 0,
  refunded_food_paise BIGINT NOT NULL DEFAULT 0 CHECK (refunded_food_paise >= 0),
  refund_version INTEGER NOT NULL DEFAULT 0,
  finance_version INTEGER NOT NULL DEFAULT 0,
  verified_capture BOOLEAN NOT NULL DEFAULT false,
  finance_observed_at TIMESTAMPTZ,
  commission_budget_paise BIGINT NOT NULL DEFAULT 0 CHECK (commission_budget_paise >= 0),
  confirmed_refund_paise BIGINT NOT NULL DEFAULT 0 CHECK (confirmed_refund_paise >= 0),
  awarded BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX order_pending_award ON referral_schema.order_state(order_id) WHERE NOT awarded AND delivered_at IS NOT NULL;
CREATE TABLE referral_schema.first_checkout_claim (
  buyer_id UUID PRIMARY KEY REFERENCES referral_schema.member(user_id),
  checkout_id UUID NOT NULL UNIQUE REFERENCES referral_schema.checkout(checkout_id),
  source_hash VARCHAR(64) NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE referral_schema.reward (
  id UUID PRIMARY KEY,
  business_key VARCHAR(180) NOT NULL UNIQUE,
  order_id UUID REFERENCES referral_schema.order_snapshot(order_id),
  checkout_id UUID NOT NULL REFERENCES referral_schema.checkout(checkout_id),
  beneficiary_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
  track VARCHAR(20) NOT NULL CHECK (track IN ('UPLINE','CUSTOMER')),
  level SMALLINT NOT NULL,
  rate_bps INTEGER NOT NULL CHECK (rate_bps BETWEEN 0 AND 400),
  amount_paise BIGINT NOT NULL CHECK (amount_paise BETWEEN 1 AND 1000000000000),
  policy_id BIGINT NOT NULL REFERENCES referral_schema.policy(id),
  hold_until TIMESTAMPTZ NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CREDITED','CANCELLED','REVERSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  CHECK ((track='UPLINE' AND order_id IS NOT NULL AND level BETWEEN 1 AND 3)
    OR (track='CUSTOMER' AND order_id IS NULL AND level=0 AND rate_bps=0))
);
CREATE UNIQUE INDEX reward_upline_level ON referral_schema.reward(order_id,level) WHERE track='UPLINE';
CREATE UNIQUE INDEX reward_customer_checkout ON referral_schema.reward(checkout_id) WHERE track='CUSTOMER';
CREATE INDEX reward_owner ON referral_schema.reward(beneficiary_id,created_at DESC,id);
CREATE INDEX reward_due ON referral_schema.reward(hold_until,id) WHERE status='PENDING';
CREATE TABLE referral_schema.reversal (
  id UUID PRIMARY KEY,
  reward_id UUID NOT NULL REFERENCES referral_schema.reward(id),
  reason_key VARCHAR(180) NOT NULL UNIQUE,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  reason_code VARCHAR(80) NOT NULL,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reversal_reward ON referral_schema.reversal(reward_id);
CREATE TABLE referral_schema.wallet (
  user_id UUID PRIMARY KEY REFERENCES referral_schema.member(user_id),
  pending_paise BIGINT NOT NULL DEFAULT 0 CHECK (pending_paise >= 0),
  available_paise BIGINT NOT NULL DEFAULT 0,
  reserved_paise BIGINT NOT NULL DEFAULT 0 CHECK (reserved_paise >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE referral_schema.journal (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key VARCHAR(180) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES referral_schema.wallet(user_id),
  pending_delta BIGINT NOT NULL DEFAULT 0,
  available_delta BIGINT NOT NULL DEFAULT 0,
  reserved_delta BIGINT NOT NULL DEFAULT 0,
  counterparty_delta BIGINT NOT NULL DEFAULT 0,
  counterparty VARCHAR(32) NOT NULL CHECK (counterparty IN ('UPLINE_EXPENSE','MARKETING_EXPENSE','INTERNAL_TRANSFER','PAYOUT_CLEARING','WITHHOLDING_CLEARING','CHECKOUT_CLEARING')),
  reward_id UUID REFERENCES referral_schema.reward(id),
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (pending_delta::numeric + available_delta + reserved_delta + counterparty_delta = 0)
);
CREATE INDEX journal_owner ON referral_schema.journal(user_id,id DESC);
CREATE TABLE referral_schema.budget (
  track VARCHAR(12) PRIMARY KEY CHECK (track IN ('CUSTOMER','DISCOUNT')),
  available_paise BIGINT NOT NULL DEFAULT 0 CHECK (available_paise >= 0)
);
INSERT INTO referral_schema.budget(track) VALUES ('CUSTOMER'),('DISCOUNT');
CREATE TABLE referral_schema.budget_journal (
  event_key VARCHAR(180) PRIMARY KEY,
  track VARCHAR(12) NOT NULL REFERENCES referral_schema.budget(track),
  amount_paise BIGINT NOT NULL CHECK (amount_paise <> 0),
  evidence_ref VARCHAR(180) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE referral_schema.fraud_case (
  id UUID PRIMARY KEY,
  case_key VARCHAR(180) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
  reason_code VARCHAR(80) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLEARED','CONFIRMED')),
  evidence_ref VARCHAR(180) NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);
CREATE INDEX fraud_open ON referral_schema.fraud_case(user_id) WHERE status IN ('OPEN','CONFIRMED');
CREATE TABLE referral_schema.credited_referral (
  beneficiary_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
  referred_user_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
  first_credited_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (beneficiary_id,referred_user_id)
);
CREATE INDEX credited_week ON referral_schema.credited_referral(beneficiary_id,first_credited_at);
CREATE TABLE referral_schema.recipient_assessment (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
  financial_year VARCHAR(9) NOT NULL,
  kyc_verified BOOLEAN NOT NULL,
  kyc_expires_at TIMESTAMPTZ NOT NULL,
  destination_ref VARCHAR(180) NOT NULL,
  tax_assessment_ref VARCHAR(180) NOT NULL,
  tax_handling VARCHAR(30) NOT NULL CHECK (tax_handling IN ('REVIEWED_AT_REWARD_CREDIT','REVIEWED_AT_CASHOUT')),
  cashout_allowed BOOLEAN NOT NULL,
  annual_limit_paise BIGINT NOT NULL CHECK (annual_limit_paise > 0),
  assessed_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX assessment_owner ON referral_schema.recipient_assessment(user_id,assessed_at DESC);
CREATE TABLE referral_schema.reservation (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('CASHOUT','SPEND')),
  checkout_id UUID,
  amount_paise BIGINT NOT NULL CHECK (amount_paise BETWEEN 1 AND 1000000000000),
  status VARCHAR(12) NOT NULL CHECK (status IN ('RESERVED','APPROVED','SUBMITTED','PAID','SPENT','RELEASED','UNKNOWN')),
  assessment_id UUID REFERENCES referral_schema.recipient_assessment(id),
  net_paise BIGINT,
  withholding_paise BIGINT,
  approved_by UUID,
  approval_ref VARCHAR(180),
  attempt_id UUID UNIQUE,
  provider_ref VARCHAR(180),
  requested_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK ((kind='CASHOUT' AND checkout_id IS NULL AND assessment_id IS NOT NULL)
    OR (kind='SPEND' AND checkout_id IS NOT NULL AND assessment_id IS NULL)),
  CHECK (net_paise IS NULL OR (net_paise >= 0 AND withholding_paise >= 0 AND net_paise + withholding_paise = amount_paise))
);
CREATE UNIQUE INDEX spend_once ON referral_schema.reservation(user_id,checkout_id) WHERE kind='SPEND' AND status<>'RELEASED';
CREATE INDEX reservation_owner ON referral_schema.reservation(user_id,requested_at DESC);
CREATE INDEX reservation_batch ON referral_schema.reservation(requested_at,id) WHERE kind='CASHOUT' AND status='APPROVED';
CREATE TABLE referral_schema.discount_reservation (
  id UUID PRIMARY KEY,
  buyer_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
  checkout_id UUID NOT NULL,
  policy_id BIGINT NOT NULL REFERENCES referral_schema.policy(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  status VARCHAR(12) NOT NULL CHECK (status IN ('RESERVED','CONSUMED','RELEASED')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX discount_buyer_once ON referral_schema.discount_reservation(buyer_id) WHERE status<>'RELEASED';
CREATE UNIQUE INDEX discount_checkout_once ON referral_schema.discount_reservation(checkout_id) WHERE status<>'RELEASED';

CREATE TABLE referral_schema.inbox (
  source VARCHAR(12) NOT NULL CHECK (source IN ('auth','order','finance')),
  event_id UUID NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','APPLIED','DEAD')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  last_error VARCHAR(80),
  PRIMARY KEY (source,event_id)
);
CREATE INDEX inbox_due ON referral_schema.inbox(next_attempt_at,received_at) WHERE status='RECEIVED';
CREATE INDEX inbox_aggregate ON referral_schema.inbox(aggregate_id,status);
CREATE TABLE referral_schema.outbox (
  id UUID PRIMARY KEY,
  event_key VARCHAR(180) NOT NULL UNIQUE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LEASED','ACKED','DEAD')),
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ
);
CREATE INDEX outbox_due ON referral_schema.outbox(created_at,id) WHERE status IN ('PENDING','LEASED');
CREATE TABLE referral_schema.audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor VARCHAR(100) NOT NULL,
  action VARCHAR(80) NOT NULL,
  target VARCHAR(180) NOT NULL,
  detail JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_date ON referral_schema.audit(created_at,id);

CREATE FUNCTION referral_schema.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'REFERRAL_IMMUTABLE_RECORD' USING ERRCODE='23514'; END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['policy','policy_activation','order_snapshot','first_checkout_claim','reversal','journal','budget_journal','credited_referral','recipient_assessment','audit'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON referral_schema.%I FOR EACH ROW EXECUTE FUNCTION referral_schema.immutable()',t||'_immutable',t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON referral_schema.%I FOR EACH STATEMENT EXECUTE FUNCTION referral_schema.immutable()',t||'_no_truncate',t);
  END LOOP;
END $$;

CREATE FUNCTION referral_schema.member_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p referral_schema.member%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'REFERRAL_ATTRIBUTION_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-'is_active'-'source_version') IS DISTINCT FROM (to_jsonb(OLD)-'is_active'-'source_version')
      OR NEW.source_version <= OLD.source_version THEN
      RAISE EXCEPTION 'REFERRAL_ATTRIBUTION_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.parent_id IS NULL THEN
    IF NEW.path IS DISTINCT FROM ARRAY[NEW.user_id] THEN RAISE EXCEPTION 'INVALID_ROOT_PATH' USING ERRCODE='23514'; END IF;
  ELSE
    SELECT * INTO STRICT p FROM referral_schema.member WHERE user_id=NEW.parent_id FOR SHARE;
    IF NOT p.is_active OR NEW.user_id=ANY(p.path) OR p.registered_at>NEW.registered_at
      OR NEW.path IS DISTINCT FROM array_append(p.path,NEW.user_id) THEN
      RAISE EXCEPTION 'INVALID_REFERRAL_PARENT' USING ERRCODE='23514';
    END IF;
    IF (NEW.contact_hash IS NOT NULL AND NEW.contact_hash=p.contact_hash)
      OR (NEW.payment_hash IS NOT NULL AND NEW.payment_hash=p.payment_hash)
      OR (NEW.device_hash IS NOT NULL AND NEW.device_hash=p.device_hash) THEN
      RAISE EXCEPTION 'SELF_REFERRAL_SIGNAL' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER member_guard BEFORE INSERT OR UPDATE OR DELETE ON referral_schema.member FOR EACH ROW EXECUTE FUNCTION referral_schema.member_guard();

CREATE FUNCTION referral_schema.reward_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s referral_schema.order_snapshot%ROWTYPE; c referral_schema.checkout%ROWTYPE; p referral_schema.policy%ROWTYPE; used numeric;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'REFERRAL_LEDGER_APPEND_ONLY' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-'status'-'settled_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'settled_at')
      OR NOT ((OLD.status='PENDING' AND NEW.status IN ('CREDITED','CANCELLED')) OR (OLD.status='CREDITED' AND NEW.status='REVERSED')) THEN
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
      OR NEW.rate_bps<>CASE NEW.level WHEN 1 THEN p.l1_bps WHEN 2 THEN p.l2_bps ELSE p.l3_bps END THEN
      RAISE EXCEPTION 'REWARD_CHAIN_MISMATCH' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(amount_paise),0) INTO used FROM referral_schema.reward WHERE order_id=NEW.order_id AND track='UPLINE';
    IF (used+NEW.amount_paise)*10000 > s.food_paise::numeric*p.cap_bps THEN
      RAISE EXCEPTION 'REFERRAL_HARD_CAP_BREACH' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.amount_paise<>p.customer_bonus_paise THEN
    RAISE EXCEPTION 'CUSTOMER_BONUS_MISMATCH' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reward_guard BEFORE INSERT OR UPDATE OR DELETE ON referral_schema.reward FOR EACH ROW EXECUTE FUNCTION referral_schema.reward_guard();

CREATE FUNCTION referral_schema.apply_journal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=referral_schema,pg_temp AS $$
BEGIN
  UPDATE referral_schema.wallet SET pending_paise=pending_paise+NEW.pending_delta,
    available_paise=available_paise+NEW.available_delta,reserved_paise=reserved_paise+NEW.reserved_delta,updated_at=now()
    WHERE user_id=NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_ENROLLED' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_balance AFTER INSERT ON referral_schema.journal FOR EACH ROW EXECUTE FUNCTION referral_schema.apply_journal();
CREATE FUNCTION referral_schema.apply_budget() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=referral_schema,pg_temp AS $$
BEGIN
  UPDATE referral_schema.budget SET available_paise=available_paise+NEW.amount_paise WHERE track=NEW.track;
  RETURN NEW;
END $$;
CREATE TRIGGER budget_balance AFTER INSERT ON referral_schema.budget_journal FOR EACH ROW EXECUTE FUNCTION referral_schema.apply_budget();

CREATE FUNCTION referral_schema.reversal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original bigint; reversed numeric;
BEGIN
  SELECT amount_paise INTO STRICT original FROM referral_schema.reward WHERE id=NEW.reward_id FOR UPDATE;
  SELECT COALESCE(sum(amount_paise),0) INTO reversed FROM referral_schema.reversal WHERE reward_id=NEW.reward_id;
  IF reversed+NEW.amount_paise>original THEN RAISE EXCEPTION 'REFERRAL_OVER_REVERSAL' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
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
END $$;
CREATE TRIGGER source_guard BEFORE UPDATE OR DELETE ON referral_schema.order_state FOR EACH ROW EXECUTE FUNCTION referral_schema.source_guard();

CREATE FUNCTION referral_schema.reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RESERVATION_HISTORY_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.kind<>OLD.kind OR NEW.amount_paise<>OLD.amount_paise
    OR NEW.checkout_id IS DISTINCT FROM OLD.checkout_id OR NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
    OR NEW.requested_at<>OLD.requested_at
    OR (OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id)
    OR (OLD.approved_by IS NOT NULL AND (NEW.approved_by,NEW.net_paise,NEW.withholding_paise,NEW.approval_ref)
       IS DISTINCT FROM (OLD.approved_by,OLD.net_paise,OLD.withholding_paise,OLD.approval_ref))
    OR NOT ((OLD.status='RESERVED' AND NEW.status IN ('APPROVED','SPENT','RELEASED'))
      OR (OLD.status='APPROVED' AND NEW.status IN ('SUBMITTED','RELEASED'))
      OR (OLD.status='SUBMITTED' AND NEW.status IN ('PAID','RELEASED','UNKNOWN'))
      OR (OLD.status='UNKNOWN' AND NEW.status IN ('PAID','RELEASED'))) THEN
    RAISE EXCEPTION 'INVALID_RESERVATION_TRANSITION' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reservation_guard BEFORE UPDATE OR DELETE ON referral_schema.reservation FOR EACH ROW EXECUTE FUNCTION referral_schema.reservation_guard();

REVOKE ALL ON ALL TABLES IN SCHEMA referral_schema FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA referral_schema FROM PUBLIC;
