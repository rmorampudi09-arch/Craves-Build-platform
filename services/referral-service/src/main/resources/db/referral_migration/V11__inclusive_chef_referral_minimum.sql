-- Include exactly INR 250.00 without changing rates, provenance guards or history.
-- Forward-only correction: do not edit the already-applied V9 migration.
CREATE OR REPLACE FUNCTION referral_schema.chef_reward_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot referral_schema.order_snapshot%ROWTYPE; policy referral_schema.policy%ROWTYPE; expected BIGINT;
BEGIN
 SELECT * INTO STRICT snapshot FROM referral_schema.order_snapshot WHERE order_id=NEW.order_id;
 SELECT p.* INTO STRICT policy FROM referral_schema.policy p JOIN referral_schema.checkout c ON c.policy_id=p.id WHERE c.checkout_id=snapshot.checkout_id;
 expected:=floor((snapshot.food_paise::numeric*(CASE NEW.level WHEN 1 THEN 200 WHEN 2 THEN 120 ELSE 80 END)+5000)/10000);
 IF policy.program_kind<>'CHEF_COMMISSION_20260916' OR NEW.policy_id<>policy.id OR snapshot.food_paise<25000
  OR snapshot.ancestor_ids[NEW.level] IS DISTINCT FROM NEW.beneficiary_id OR NEW.amount_paise>expected THEN
  RAISE EXCEPTION 'INVALID_CHEF_REWARD_SOURCE';
 END IF;
 RETURN NEW;
END;$$;
