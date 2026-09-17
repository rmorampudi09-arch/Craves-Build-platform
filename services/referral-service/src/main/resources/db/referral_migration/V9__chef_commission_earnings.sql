-- Additive chef program. No historical customer-wallet policy is activated or rewritten.
ALTER TABLE referral_schema.policy ADD COLUMN program_kind VARCHAR(32) NOT NULL DEFAULT 'LEGACY';
ALTER TABLE referral_schema.policy ADD CONSTRAINT chef_policy_exact CHECK(program_kind='LEGACY' OR
 (program_kind='CHEF_COMMISSION_20260916' AND l1_bps=200 AND l2_bps=120 AND l3_bps=80 AND cap_bps=400
 AND hold_days=1 AND minimum_paise=25000 AND customer_bonus_paise=0 AND invitee_discount_paise=0));
ALTER TABLE referral_schema.order_state ADD COLUMN verified_paid_at TIMESTAMPTZ;
-- Chef rewards concern seller ancestry; a customer need not enrol in referrals to buy food.
ALTER TABLE referral_schema.checkout DROP CONSTRAINT checkout_buyer_id_fkey;
CREATE FUNCTION referral_schema.checkout_buyer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind TEXT;
BEGIN
 SELECT program_kind INTO STRICT kind FROM referral_schema.policy WHERE id=NEW.policy_id;
 IF kind='LEGACY' AND NOT EXISTS(SELECT 1 FROM referral_schema.member WHERE user_id=NEW.buyer_id) THEN
  RAISE EXCEPTION 'LEGACY_BUYER_MEMBERSHIP_REQUIRED';
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER checkout_buyer_guard BEFORE INSERT ON referral_schema.checkout FOR EACH ROW EXECUTE FUNCTION referral_schema.checkout_buyer_guard();
ALTER TABLE referral_schema.worker_schedule DROP CONSTRAINT worker_schedule_kind_check;
ALTER TABLE referral_schema.worker_schedule ADD CONSTRAINT worker_schedule_kind_check CHECK(kind IN ('AWARD','CUSTOMER','CREDIT','PAYOUT','CHEF_EARN'));

CREATE TABLE referral_schema.chef_membership (
 user_id UUID PRIMARY KEY REFERENCES referral_schema.member(user_id), version INTEGER NOT NULL CHECK(version>0),
 eligible BOOLEAN NOT NULL, observed_at TIMESTAMPTZ NOT NULL, source_hash CHAR(64) NOT NULL
);
CREATE TABLE referral_schema.chef_reward (
 id UUID PRIMARY KEY, order_id UUID NOT NULL REFERENCES referral_schema.order_snapshot(order_id),
 beneficiary_id UUID NOT NULL REFERENCES referral_schema.member(user_id), level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 3),
 amount_paise BIGINT NOT NULL CHECK(amount_paise>0), eligible_at TIMESTAMPTZ NOT NULL,
 policy_id BIGINT NOT NULL REFERENCES referral_schema.policy(id), created_at TIMESTAMPTZ NOT NULL,
 UNIQUE(order_id,level)
);
CREATE TABLE referral_schema.chef_month (
 beneficiary_id UUID NOT NULL REFERENCES referral_schema.member(user_id), month DATE NOT NULL CHECK(extract(day FROM month)=1),
 posted_paise BIGINT NOT NULL DEFAULT 0 CHECK(posted_paise>=0), reversed_paise BIGINT NOT NULL DEFAULT 0 CHECK(reversed_paise>=0),
 PRIMARY KEY(beneficiary_id,month), CHECK(reversed_paise<=posted_paise AND posted_paise-reversed_paise<=150000)
);
CREATE TABLE referral_schema.chef_posting (
 id UUID PRIMARY KEY, event_key VARCHAR(180) NOT NULL UNIQUE,
 reward_id UUID NOT NULL REFERENCES referral_schema.chef_reward(id), beneficiary_id UUID NOT NULL,
 month DATE NOT NULL, amount_paise BIGINT NOT NULL CHECK(amount_paise<>0),
 original_id UUID REFERENCES referral_schema.chef_posting(id), posted_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(beneficiary_id,month) REFERENCES referral_schema.chef_month(beneficiary_id,month),
 CHECK((amount_paise>0 AND original_id IS NULL) OR (amount_paise<0 AND original_id IS NOT NULL))
);
CREATE UNIQUE INDEX chef_reward_credit_once ON referral_schema.chef_posting(reward_id) WHERE amount_paise>0;
CREATE INDEX chef_posting_owner ON referral_schema.chef_posting(beneficiary_id,posted_at);
CREATE TABLE referral_schema.chef_reward_review (
 reward_id UUID PRIMARY KEY REFERENCES referral_schema.chef_reward(id), reason VARCHAR(50) NOT NULL,
 first_observed_at TIMESTAMPTZ NOT NULL
);
CREATE FUNCTION referral_schema.chef_reward_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot referral_schema.order_snapshot%ROWTYPE; policy referral_schema.policy%ROWTYPE; expected BIGINT;
BEGIN
 SELECT * INTO STRICT snapshot FROM referral_schema.order_snapshot WHERE order_id=NEW.order_id;
 SELECT p.* INTO STRICT policy FROM referral_schema.policy p JOIN referral_schema.checkout c ON c.policy_id=p.id WHERE c.checkout_id=snapshot.checkout_id;
 expected:=floor((snapshot.food_paise::numeric*(CASE NEW.level WHEN 1 THEN 200 WHEN 2 THEN 120 ELSE 80 END)+5000)/10000);
 IF policy.program_kind<>'CHEF_COMMISSION_20260916' OR NEW.policy_id<>policy.id OR snapshot.food_paise<=25000
  OR snapshot.ancestor_ids[NEW.level] IS DISTINCT FROM NEW.beneficiary_id OR NEW.amount_paise>expected THEN
  RAISE EXCEPTION 'INVALID_CHEF_REWARD_SOURCE';
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER chef_reward_source_guard BEFORE INSERT ON referral_schema.chef_reward FOR EACH ROW EXECUTE FUNCTION referral_schema.chef_reward_guard();
CREATE FUNCTION referral_schema.chef_posting_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reward referral_schema.chef_reward%ROWTYPE; original referral_schema.chef_posting%ROWTYPE; reversed BIGINT;
BEGIN
 SELECT * INTO STRICT reward FROM referral_schema.chef_reward WHERE id=NEW.reward_id FOR UPDATE;
 IF NEW.beneficiary_id<>reward.beneficiary_id THEN RAISE EXCEPTION 'CHEF_BENEFICIARY_MISMATCH'; END IF;
 PERFORM 1 FROM referral_schema.chef_month WHERE beneficiary_id=NEW.beneficiary_id AND month=NEW.month FOR UPDATE;
 IF NEW.amount_paise>0 THEN
  IF NEW.amount_paise>reward.amount_paise OR NEW.posted_at<reward.eligible_at OR
     NEW.month<>date_trunc('month',NEW.posted_at AT TIME ZONE 'Asia/Kolkata')::date THEN
   RAISE EXCEPTION 'INVALID_CHEF_CREDIT';
  END IF;
  UPDATE referral_schema.chef_month SET posted_paise=posted_paise+NEW.amount_paise
   WHERE beneficiary_id=NEW.beneficiary_id AND month=NEW.month;
 ELSE
  SELECT * INTO STRICT original FROM referral_schema.chef_posting WHERE id=NEW.original_id;
  SELECT coalesce(-sum(amount_paise),0) INTO reversed FROM referral_schema.chef_posting WHERE original_id=NEW.original_id;
  IF original.amount_paise<=0 OR original.reward_id<>NEW.reward_id OR original.beneficiary_id<>NEW.beneficiary_id
   OR original.month<>NEW.month OR reversed-NEW.amount_paise>original.amount_paise OR NEW.posted_at<original.posted_at THEN
   RAISE EXCEPTION 'INVALID_CHEF_REVERSAL';
  END IF;
  UPDATE referral_schema.chef_month SET reversed_paise=reversed_paise-NEW.amount_paise
   WHERE beneficiary_id=NEW.beneficiary_id AND month=NEW.month;
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER chef_posting_guard BEFORE INSERT ON referral_schema.chef_posting FOR EACH ROW EXECUTE FUNCTION referral_schema.chef_posting_guard();
CREATE FUNCTION referral_schema.publish_chef_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reward referral_schema.chef_reward%ROWTYPE; snapshot referral_schema.order_snapshot%ROWTYPE;
BEGIN
 SELECT * INTO STRICT reward FROM referral_schema.chef_reward WHERE id=NEW.reward_id;
 SELECT * INTO STRICT snapshot FROM referral_schema.order_snapshot WHERE order_id=reward.order_id;
 INSERT INTO referral_schema.outbox(id,event_key,event_type,payload) VALUES(gen_random_uuid(),'chef-posting:'||NEW.id,
  'referral.chef.earning',jsonb_build_object('postingId',NEW.id,'rewardId',NEW.reward_id,'chefOrderId',reward.order_id,
   'checkoutId',snapshot.checkout_id,'sellingChefId',snapshot.seller_id,'beneficiaryId',NEW.beneficiary_id,
   'amountPaise',NEW.amount_paise::text,'originalPostingId',NEW.original_id,'postingMonth',NEW.month::text,
   'postedAt',NEW.posted_at,'policyVersion','CHEF_COMMISSION_20260916','currency','INR'));
 RETURN NULL;
END;$$;
CREATE TRIGGER publish_chef_posting AFTER INSERT ON referral_schema.chef_posting FOR EACH ROW EXECUTE FUNCTION referral_schema.publish_chef_posting();
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['chef_reward','chef_posting','chef_reward_review'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON referral_schema.%I FOR EACH ROW EXECUTE FUNCTION referral_schema.immutable()',t||'_immutable',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON referral_schema.%I FOR EACH STATEMENT EXECUTE FUNCTION referral_schema.immutable()',t||'_no_truncate',t);
 END LOOP;
END;$$;
REVOKE ALL ON referral_schema.chef_membership,referral_schema.chef_month,referral_schema.chef_reward,
 referral_schema.chef_posting,referral_schema.chef_reward_review FROM PUBLIC;
