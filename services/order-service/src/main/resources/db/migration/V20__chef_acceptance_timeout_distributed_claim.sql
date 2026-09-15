ALTER TABLE order_schema.customer_order
    ADD COLUMN IF NOT EXISTS chef_acceptance_timeout_claim_token UUID,
    ADD COLUMN IF NOT EXISTS chef_acceptance_timeout_claimed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS chef_acceptance_timeout_attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS chef_acceptance_timeout_last_error VARCHAR(1000);

CREATE INDEX IF NOT EXISTS idx_customer_order_acceptance_timeout_claim
    ON order_schema.customer_order (
        chef_acceptance_expires_at,
        chef_acceptance_timeout_claimed_at,
        id
    )
    WHERE status = 'CHEF_ACCEPTANCE_PENDING'
      AND chef_acceptance_expires_at IS NOT NULL;

COMMENT ON COLUMN order_schema.customer_order.chef_acceptance_timeout_claim_token IS
    'Ephemeral worker claim used to distribute expired chef-acceptance work safely across Order Service replicas.';

COMMENT ON COLUMN order_schema.customer_order.chef_acceptance_timeout_claimed_at IS
    'UTC timestamp of the current timeout worker claim; stale claims are reclaimable.';

COMMENT ON COLUMN order_schema.customer_order.chef_acceptance_timeout_attempt_count IS
    'Number of distributed timeout claims made for this chef-specific order; retained for production readiness and alerting.';

COMMENT ON COLUMN order_schema.customer_order.chef_acceptance_timeout_last_error IS
    'Last bounded timeout-processing error. This is operational evidence only and must never contain secrets.';
