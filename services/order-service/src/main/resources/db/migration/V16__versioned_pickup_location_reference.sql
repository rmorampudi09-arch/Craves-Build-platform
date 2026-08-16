-- New orders snapshot the active versioned chef pickup location. Existing rows deliberately remain
-- NULL and continue to fall back to kitchen_id, preserving historical delivery behavior.
ALTER TABLE order_schema.customer_order
    ADD COLUMN pickup_location_id UUID;

CREATE INDEX ix_customer_order_pickup_location_id
    ON order_schema.customer_order (pickup_location_id)
    WHERE pickup_location_id IS NOT NULL;
