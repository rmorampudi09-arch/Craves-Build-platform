SET LOCAL lock_timeout = '5s';

-- 14-day bills. Every bill is whole repeats of the chef's one-week menu.
ALTER TABLE subscription_schema.subscription_plan DROP CONSTRAINT IF EXISTS ck_subscription_plan_billing_period;
ALTER TABLE subscription_schema.subscription_plan ADD CONSTRAINT ck_subscription_plan_billing_period
    CHECK (billing_period IN ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY'));
