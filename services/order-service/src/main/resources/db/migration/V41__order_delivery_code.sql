-- Delivery code the customer tells a Craves rider at the door. Made when the chef accepts the order.
-- The customer reads it back, so it is stored as is. It is never logged, put in an event,
-- or returned by chef, admin or kitchen endpoints.

-- Fail fast instead of queueing behind long-running order transactions while the foreign key locks customer_order.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS order_schema.order_delivery_code (
    order_id UUID PRIMARY KEY REFERENCES order_schema.customer_order(id),
    code CHAR(4) NOT NULL CHECK (code ~ '^[0-9]{4}$'),
    failed_attempts SMALLINT NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE order_schema.order_delivery_code IS
    '4-digit code a Craves rider checks at the door. Shown only to the owning customer while a Craves rider carries the order.';
COMMENT ON COLUMN order_schema.order_delivery_code.failed_attempts IS
    'Wrong codes entered by the rider. At 5 the code is locked.';
COMMENT ON COLUMN order_schema.order_delivery_code.verified_at IS
    'When the rider entered the right code. Set once; does not change order status.';
