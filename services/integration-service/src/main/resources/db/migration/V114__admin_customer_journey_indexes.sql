CREATE INDEX IF NOT EXISTS ix_payment_order_customer_created_desc
    ON payment_schema.payment_order (customer_identity_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_payment_order_customer_status_created_desc
    ON payment_schema.payment_order (customer_identity_id, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_refund_customer_created_desc
    ON payment_schema.refund (customer_identity_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_refund_customer_status_created_desc
    ON payment_schema.refund (customer_identity_id, status, created_at DESC, id DESC);

COMMENT ON INDEX payment_schema.ix_payment_order_customer_created_desc IS
    'Supports bounded administrator Customer 360 payment-history reads by customer identity.';

COMMENT ON INDEX payment_schema.ix_refund_customer_created_desc IS
    'Supports bounded administrator Customer 360 refund-history reads by customer identity.';
