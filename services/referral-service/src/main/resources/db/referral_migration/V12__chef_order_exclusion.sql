-- Chef commission rewards depend only on the selling chef's ancestry, so a checkout is bound
-- even when the buyer or some selling chefs never enrolled. A chef order whose seller is not a
-- member is recorded once, immutably, as not applicable. Its later delivery, refund and finance
-- events then apply as no-ops instead of retrying into dead letters. Additive only.
CREATE TABLE referral_schema.order_exclusion (
 order_id UUID PRIMARY KEY, checkout_id UUID NOT NULL, seller_id UUID NOT NULL,
 policy_id BIGINT NOT NULL REFERENCES referral_schema.policy(id),
 reason VARCHAR(40) NOT NULL CHECK(reason='SELLER_NOT_ENROLLED'),
 binding_hash VARCHAR(64) NOT NULL CHECK(binding_hash ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_exclusion_checkout ON referral_schema.order_exclusion(checkout_id);

CREATE FUNCTION referral_schema.order_exclusion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM referral_schema.order_snapshot WHERE order_id=NEW.order_id)
  OR EXISTS(SELECT 1 FROM referral_schema.member WHERE user_id=NEW.seller_id)
  OR NOT EXISTS(SELECT 1 FROM referral_schema.policy WHERE id=NEW.policy_id AND program_kind='CHEF_COMMISSION_20260916') THEN
  RAISE EXCEPTION 'INVALID_ORDER_EXCLUSION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER order_exclusion_guard BEFORE INSERT ON referral_schema.order_exclusion
 FOR EACH ROW EXECUTE FUNCTION referral_schema.order_exclusion_guard();

-- An excluded order can never later gain a reward-bearing snapshot.
CREATE FUNCTION referral_schema.order_snapshot_not_excluded() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM referral_schema.order_exclusion WHERE order_id=NEW.order_id) THEN
  RAISE EXCEPTION 'ORDER_ALREADY_EXCLUDED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER order_snapshot_not_excluded BEFORE INSERT ON referral_schema.order_snapshot
 FOR EACH ROW EXECUTE FUNCTION referral_schema.order_snapshot_not_excluded();

CREATE TRIGGER order_exclusion_immutable BEFORE UPDATE OR DELETE ON referral_schema.order_exclusion
 FOR EACH ROW EXECUTE FUNCTION referral_schema.immutable();
CREATE TRIGGER order_exclusion_no_truncate BEFORE TRUNCATE ON referral_schema.order_exclusion
 FOR EACH STATEMENT EXECUTE FUNCTION referral_schema.immutable();
REVOKE ALL ON referral_schema.order_exclusion FROM PUBLIC;
REVOKE ALL ON FUNCTION referral_schema.order_exclusion_guard(), referral_schema.order_snapshot_not_excluded() FROM PUBLIC;
