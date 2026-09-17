-- Internal idempotency evidence only, not an excess reward, liability or balance.
-- A zero decision prevents skipped rewards from resurfacing after a month reset.
CREATE TABLE referral_schema.chef_cap_decision (
 reward_id UUID PRIMARY KEY REFERENCES referral_schema.chef_reward(id),
 month DATE NOT NULL CHECK(extract(day FROM month)=1),
 credited_paise BIGINT NOT NULL CHECK(credited_paise BETWEEN 0 AND 150000),
 decided_at TIMESTAMPTZ NOT NULL,
 CHECK(month=date_trunc('month',decided_at AT TIME ZONE 'Asia/Kolkata')::date)
);
CREATE TRIGGER chef_cap_decision_immutable BEFORE UPDATE OR DELETE
 ON referral_schema.chef_cap_decision FOR EACH ROW EXECUTE FUNCTION referral_schema.immutable();
CREATE TRIGGER chef_cap_decision_no_truncate BEFORE TRUNCATE
 ON referral_schema.chef_cap_decision FOR EACH STATEMENT EXECUTE FUNCTION referral_schema.immutable();
REVOKE ALL ON referral_schema.chef_cap_decision FROM PUBLIC;
