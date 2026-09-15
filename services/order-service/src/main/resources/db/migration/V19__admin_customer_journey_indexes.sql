CREATE INDEX IF NOT EXISTS ix_customer_order_customer_created_desc
    ON order_schema.customer_order (customer_identity_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_customer_order_customer_status_created_desc
    ON order_schema.customer_order (customer_identity_id, status, created_at DESC, id DESC);

COMMENT ON INDEX order_schema.ix_customer_order_customer_created_desc IS
    'Supports bounded administrator Customer 360 order-history reads by customer identity.';
