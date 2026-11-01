SET LOCAL lock_timeout = '5s';

-- 14-day bills. Every bill is whole repeats of the chef's one-week menu.
ALTER TABLE subscription_schema.subscription_plan DROP CONSTRAINT IF EXISTS ck_subscription_plan_billing_period;
ALTER TABLE subscription_schema.subscription_plan ADD CONSTRAINT ck_subscription_plan_billing_period
    CHECK (billing_period IN ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY'));

-- Pause allowance per paid bill (weekly 1 day, 14-day 3, 28-day 7). paused_from/pause_auto_resume_date are set only
-- while a customer pause is running; pauses from before this release keep them NULL and are never auto-resumed.
ALTER TABLE subscription_schema.customer_subscription
    ADD COLUMN pause_bill_start DATE,
    ADD COLUMN pause_days_used INTEGER NOT NULL DEFAULT 0
        CONSTRAINT ck_customer_subscription_pause_days_used CHECK (pause_days_used >= 0),
    ADD COLUMN paused_from DATE,
    ADD COLUMN pause_auto_resume_date DATE;

CREATE INDEX ix_customer_subscription_auto_resume
    ON subscription_schema.customer_subscription (pause_auto_resume_date)
    WHERE status = 'PAUSED' AND pause_auto_resume_date IS NOT NULL;
