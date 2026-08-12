CREATE INDEX IF NOT EXISTS ix_subscription_payment_subscription_cycle
    ON payment_schema.subscription_payment_intent (subscription_id, cycle_start DESC, created_at DESC);
