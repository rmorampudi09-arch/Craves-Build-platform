-- Provider-native exact ETA timestamps for customer/chef delivery reads.
-- These are additive to the V17 ETA window fields.

ALTER TABLE order_schema.customer_order
    ADD COLUMN IF NOT EXISTS delivery_estimated_pickup_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivery_estimated_dropoff_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_customer_order_delivery_estimated_dropoff_at
    ON order_schema.customer_order (delivery_estimated_dropoff_at)
    WHERE delivery_estimated_dropoff_at IS NOT NULL;
