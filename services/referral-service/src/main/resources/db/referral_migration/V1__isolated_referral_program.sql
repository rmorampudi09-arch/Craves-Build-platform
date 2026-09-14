-- New referral schema only. Not in an existing service's Flyway location.
-- This migration has never been released to a runtime database.
CREATE SCHEMA IF NOT EXISTS referral_schema;
CREATE TABLE referral_schema.policy (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 l1_bps INTEGER NOT NULL CHECK(l1_bps>=0), l2_bps INTEGER NOT NULL CHECK(l2_bps>=0), l3_bps INTEGER NOT NULL CHECK(l3_bps>=0),
 cap_bps INTEGER NOT NULL CHECK(cap_bps BETWEEN 1 AND 400), hold_days INTEGER NOT NULL CHECK(hold_days BETWEEN 1 AND 365),
 minimum_paise BIGINT NOT NULL CHECK(minimum_paise BETWEEN 1 AND 1000000000000),
 customer_bonus_paise BIGINT NOT NULL CHECK(customer_bonus_paise BETWEEN 0 AND 1000000000000),
 invitee_discount_paise BIGINT NOT NULL CHECK(invitee_discount_paise BETWEEN 0 AND 1000000000000),
 approvals JSONB NOT NULL DEFAULT '{}', created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(l1_bps+l2_bps+l3_bps<=cap_bps)
);
INSERT INTO referral_schema.policy(l1_bps,l2_bps,l3_bps,cap_bps,hold_days,minimum_paise,customer_bonus_paise,invitee_discount_paise)
VALUES(200,120,80,400,14,80000,40000,25000);
CREATE TABLE referral_schema.policy_activation (
 policy_id BIGINT PRIMARY KEY REFERENCES referral_schema.policy(id), effective_at TIMESTAMPTZ NOT NULL UNIQUE,
 approved_by UUID NOT NULL, activated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE referral_schema.member (
 user_id UUID PRIMARY KEY, code VARCHAR(16) NOT NULL UNIQUE CHECK(code ~ '^[2-9A-HJ-NP-Z]{16}$'),
 parent_id UUID REFERENCES referral_schema.member(user_id), path UUID[] NOT NULL, registered_at TIMESTAMPTZ NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT true, source_version INTEGER NOT NULL DEFAULT 1 CHECK(source_version>0),
 contact_hash VARCHAR(64), device_hash VARCHAR(64), payment_hash VARCHAR(64),
 fingerprint_consent BOOLEAN NOT NULL DEFAULT false, terms_version VARCHAR(100) NOT NULL,
 CHECK(parent_id IS NULL OR parent_id<>user_id),
 CHECK(cardinality(path) BETWEEN 1 AND 10000 AND path[cardinality(path)]=user_id),
 CHECK(device_hash IS NULL OR fingerprint_consent),
 CHECK(contact_hash IS NULL OR contact_hash ~ '^[0-9a-f]{64}$'),
 CHECK(device_hash IS NULL OR device_hash ~ '^[0-9a-f]{64}$'),
 CHECK(payment_hash IS NULL OR payment_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX member_parent ON referral_schema.member(parent_id,user_id);
CREATE INDEX member_path ON referral_schema.member USING gin(path);
CREATE INDEX member_contact ON referral_schema.member(contact_hash) WHERE contact_hash IS NOT NULL;
CREATE INDEX member_device ON referral_schema.member(device_hash) WHERE device_hash IS NOT NULL;
CREATE INDEX member_payment ON referral_schema.member(payment_hash) WHERE payment_hash IS NOT NULL;
CREATE TABLE referral_schema.checkout (
 checkout_id UUID PRIMARY KEY, buyer_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
 food_paise BIGINT NOT NULL CHECK(food_paise BETWEEN 0 AND 1000000000000),
 payable_paise BIGINT NOT NULL CHECK(payable_paise BETWEEN 0 AND 1000000000000),
 chef_order_count INTEGER NOT NULL CHECK(chef_order_count BETWEEN 1 AND 100),
 policy_id BIGINT NOT NULL REFERENCES referral_schema.policy(id), created_at TIMESTAMPTZ NOT NULL,
 first_qualifying_confirmed BOOLEAN NOT NULL DEFAULT false, full_refund BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE referral_schema.order_snapshot (
 order_id UUID PRIMARY KEY, checkout_id UUID NOT NULL REFERENCES referral_schema.checkout(checkout_id),
 seller_id UUID NOT NULL REFERENCES referral_schema.member(user_id), food_paise BIGINT NOT NULL CHECK(food_paise BETWEEN 0 AND 1000000000000),
 ancestor_ids UUID[] NOT NULL CHECK(cardinality(ancestor_ids)<=3),
 source_hash VARCHAR(64) NOT NULL CHECK(source_hash ~ '^[0-9a-f]{64}$'), created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX order_snapshot_checkout ON referral_schema.order_snapshot(checkout_id,order_id);
CREATE TABLE referral_schema.order_state (
 order_id UUID PRIMARY KEY REFERENCES referral_schema.order_snapshot(order_id), delivered_at TIMESTAMPTZ,
 delivery_version INTEGER NOT NULL DEFAULT 0, refunded_food_paise BIGINT NOT NULL DEFAULT 0 CHECK(refunded_food_paise>=0),
 refund_version INTEGER NOT NULL DEFAULT 0, finance_version INTEGER NOT NULL DEFAULT 0, verified_capture BOOLEAN NOT NULL DEFAULT false,
 finance_observed_at TIMESTAMPTZ, commission_budget_paise BIGINT NOT NULL DEFAULT 0 CHECK(commission_budget_paise>=0),
 confirmed_refund_paise BIGINT NOT NULL DEFAULT 0 CHECK(confirmed_refund_paise>=0), awarded BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX order_pending_award ON referral_schema.order_state(order_id) WHERE NOT awarded AND delivered_at IS NOT NULL;
CREATE TABLE referral_schema.first_checkout_claim (
 buyer_id UUID PRIMARY KEY REFERENCES referral_schema.member(user_id), checkout_id UUID NOT NULL UNIQUE REFERENCES referral_schema.checkout(checkout_id),
 source_hash VARCHAR(64) NOT NULL, confirmed_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE referral_schema.reward (
 id UUID PRIMARY KEY, business_key VARCHAR(180) NOT NULL UNIQUE, order_id UUID REFERENCES referral_schema.order_snapshot(order_id),
 checkout_id UUID NOT NULL REFERENCES referral_schema.checkout(checkout_id), beneficiary_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
 track VARCHAR(20) NOT NULL CHECK(track IN ('UPLINE','CUSTOMER')), level SMALLINT NOT NULL,
 rate_bps INTEGER NOT NULL CHECK(rate_bps BETWEEN 0 AND 400), amount_paise BIGINT NOT NULL CHECK(amount_paise BETWEEN 1 AND 1000000000000),
 policy_id BIGINT NOT NULL REFERENCES referral_schema.policy(id), hold_until TIMESTAMPTZ NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CREDITED','CANCELLED','REVERSED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), settled_at TIMESTAMPTZ,
 CHECK((track='UPLINE' AND order_id IS NOT NULL AND level BETWEEN 1 AND 3) OR (track='CUSTOMER' AND order_id IS NULL AND level=0 AND rate_bps=0))
);
CREATE UNIQUE INDEX reward_upline_level ON referral_schema.reward(order_id,level) WHERE track='UPLINE';
CREATE UNIQUE INDEX reward_customer_checkout ON referral_schema.reward(checkout_id) WHERE track='CUSTOMER';
CREATE INDEX reward_owner ON referral_schema.reward(beneficiary_id,created_at DESC,id);
CREATE INDEX reward_due ON referral_schema.reward(hold_until,id) WHERE status='PENDING';
CREATE TABLE referral_schema.reversal (
 id UUID PRIMARY KEY, reward_id UUID NOT NULL REFERENCES referral_schema.reward(id), reason_key VARCHAR(180) NOT NULL UNIQUE,
 amount_paise BIGINT NOT NULL CHECK(amount_paise>0), reason_code VARCHAR(80) NOT NULL, actor_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reversal_reward ON referral_schema.reversal(reward_id);
CREATE TABLE referral_schema.wallet (
 user_id UUID PRIMARY KEY REFERENCES referral_schema.member(user_id), pending_paise BIGINT NOT NULL DEFAULT 0 CHECK(pending_paise>=0),
 available_paise BIGINT NOT NULL DEFAULT 0, reserved_paise BIGINT NOT NULL DEFAULT 0 CHECK(reserved_paise>=0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE referral_schema.journal (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_key VARCHAR(180) NOT NULL UNIQUE,
 user_id UUID NOT NULL REFERENCES referral_schema.wallet(user_id), pending_delta BIGINT NOT NULL DEFAULT 0,
 available_delta BIGINT NOT NULL DEFAULT 0, reserved_delta BIGINT NOT NULL DEFAULT 0, counterparty_delta BIGINT NOT NULL DEFAULT 0,
 counterparty VARCHAR(32) NOT NULL CHECK(counterparty IN ('UPLINE_EXPENSE','MARKETING_EXPENSE','INTERNAL_TRANSFER','PAYOUT_CLEARING','WITHHOLDING_CLEARING','CHECKOUT_CLEARING')),
 reward_id UUID REFERENCES referral_schema.reward(id), reference_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(pending_delta::numeric+available_delta+reserved_delta+counterparty_delta=0)
);
CREATE INDEX journal_owner ON referral_schema.journal(user_id,id DESC);
CREATE TABLE referral_schema.budget (
 track VARCHAR(12) PRIMARY KEY CHECK(track IN ('CUSTOMER','DISCOUNT')), available_paise BIGINT NOT NULL DEFAULT 0 CHECK(available_paise>=0)
);
INSERT INTO referral_schema.budget(track) VALUES('CUSTOMER'),('DISCOUNT');
CREATE TABLE referral_schema.budget_journal (
 event_key VARCHAR(180) PRIMARY KEY, track VARCHAR(12) NOT NULL REFERENCES referral_schema.budget(track),
 amount_paise BIGINT NOT NULL CHECK(amount_paise<>0), evidence_ref VARCHAR(180) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE referral_schema.fraud_case (
 id UUID PRIMARY KEY, case_key VARCHAR(180) NOT NULL UNIQUE, user_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
 reason_code VARCHAR(80) NOT NULL, status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLEARED','CONFIRMED')),
 evidence_ref VARCHAR(180) NOT NULL, opened_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ, resolved_by UUID
);
CREATE INDEX fraud_open ON referral_schema.fraud_case(user_id) WHERE status IN ('OPEN','CONFIRMED');
CREATE TABLE referral_schema.credited_referral (
 beneficiary_id UUID NOT NULL REFERENCES referral_schema.member(user_id), referred_user_id UUID NOT NULL REFERENCES referral_schema.member(user_id),
 first_credited_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(beneficiary_id,referred_user_id)
);
CREATE INDEX credited_week ON referral_schema.credited_referral(beneficiary_id,first_credited_at);
CREATE TABLE referral_schema.recipient_assessment (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES referral_schema.member(user_id), financial_year VARCHAR(9) NOT NULL,
 kyc_verified BOOLEAN NOT NULL, kyc_expires_at TIMESTAMPTZ NOT NULL, destination_ref VARCHAR(180) NOT NULL, tax_assessment_ref VARCHAR(180) NOT NULL,
 tax_handling VARCHAR(30) NOT NULL CHECK(tax_handling IN ('REVIEWED_AT_REWARD_CREDIT','REVIEWED_AT_CASHOUT')),
 cashout_allowed BOOLEAN NOT NULL, annual_limit_paise BIGINT NOT NULL CHECK(annual_limit_paise>0), assessed_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX assessment_owner ON referral_schema.recipient_assessment(user_id,assessed_at DESC);
CREATE TABLE referral_schema.reservation (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES referral_schema.member(user_id), kind VARCHAR(12) NOT NULL CHECK(kind IN ('CASHOUT','SPEND')),
 checkout_id UUID, amount_paise BIGINT NOT NULL CHECK(amount_paise BETWEEN 1 AND 1000000000000),
 status VARCHAR(12) NOT NULL CHECK(status IN ('RESERVED','APPROVED','SUBMITTED','PAID','SPENT','RELEASED','UNKNOWN')),
 assessment_id UUID REFERENCES referral_schema.recipient_assessment(id), net_paise BIGINT, withholding_paise BIGINT,
 approved_by UUID, approval_ref VARCHAR(180), attempt_id UUID UNIQUE, provider_ref VARCHAR(180),
 requested_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
 CHECK((kind='CASHOUT' AND checkout_id IS NULL AND assessment_id IS NOT NULL) OR (kind='SPEND' AND checkout_id IS NOT NULL AND assessment_id IS NULL)),
 CHECK(net_paise IS NULL OR (net_paise>=0 AND withholding_paise>=0 AND net_paise+withholding_paise=amount_paise))
);
CREATE UNIQUE INDEX spend_once ON referral_schema.reservation(user_id,checkout_id) WHERE kind='SPEND' AND status<>'RELEASED';
CREATE INDEX reservation_owner ON referral_schema.reservation(user_id,requested_at DESC);
CREATE INDEX reservation_batch ON referral_schema.reservation(requested_at,id) WHERE kind='CASHOUT' AND status='APPROVED';
CREATE TABLE referral_schema.discount_reservation (
 id UUID PRIMARY KEY, buyer_id UUID NOT NULL REFERENCES referral_schema.member(user_id), checkout_id UUID NOT NULL,
 policy_id BIGINT NOT NULL REFERENCES referral_schema.policy(id), amount_paise BIGINT NOT NULL CHECK(amount_paise>0),
 status VARCHAR(12) NOT NULL CHECK(status IN ('RESERVED','CONSUMED','RELEASED')), created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX discount_buyer_once ON referral_schema.discount_reservation(buyer_id) WHERE status<>'RELEASED';
CREATE UNIQUE INDEX discount_checkout_once ON referral_schema.discount_reservation(checkout_id) WHERE status<>'RELEASED';
CREATE TABLE referral_schema.inbox (
 source VARCHAR(12) NOT NULL CHECK(source IN ('auth','order','finance')), event_id UUID NOT NULL, aggregate_id UUID NOT NULL,
 event_type VARCHAR(50) NOT NULL, payload_hash VARCHAR(64) NOT NULL, payload JSONB NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','APPLIED','DEAD')), attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(), received_at TIMESTAMPTZ NOT NULL DEFAULT now(), applied_at TIMESTAMPTZ, last_error VARCHAR(80),
 PRIMARY KEY(source,event_id)
);
CREATE INDEX inbox_due ON referral_schema.inbox(next_attempt_at,received_at) WHERE status='RECEIVED';
CREATE INDEX inbox_aggregate ON referral_schema.inbox(aggregate_id,status);
CREATE TABLE referral_schema.outbox (
 id UUID PRIMARY KEY, event_key VARCHAR(180) NOT NULL UNIQUE, event_type VARCHAR(50) NOT NULL, payload JSONB NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','LEASED','ACKED','DEAD')), lease_id UUID, lease_until TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), acknowledged_at TIMESTAMPTZ
);
CREATE INDEX outbox_due ON referral_schema.outbox(created_at,id) WHERE status IN ('PENDING','LEASED');
CREATE TABLE referral_schema.audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor VARCHAR(100) NOT NULL, action VARCHAR(80) NOT NULL, target VARCHAR(180) NOT NULL,
 detail JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_date ON referral_schema.audit(created_at,id);
REVOKE ALL ON ALL TABLES IN SCHEMA referral_schema FROM PUBLIC;
