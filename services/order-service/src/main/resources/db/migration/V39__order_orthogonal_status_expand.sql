-- CH-05 expand step. One overloaded `status` mixes lifecycle and refund progress, has no CHECK, and has no version
-- (audit F1-12). This step changes no writer:
--   * version: bumped by trigger on every status change (unless a writer already bumped it), for optimistic locking.
--   * payment_status / refund_status: generated from today's columns, so every existing writer keeps them correct.
--     delivery_status already exists (V9) and is the delivery projection.
--   * chk_customer_order_status_values: the allowed lifecycle values, added only when no unknown value exists.
-- Contract step (later): DROP EXPRESSION on payment_status/refund_status, let their single owners write them, move
-- refund values out of `status`, then narrow the CHECK to the 12 lifecycle values.
SET LOCAL lock_timeout = '5s';

ALTER TABLE order_schema.customer_order
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(24) GENERATED ALWAYS AS (
        CASE
            WHEN status IN ('PAYMENT_PENDING', 'CREATED') THEN 'PENDING'
            WHEN status = 'REFUNDED' THEN 'REFUNDED'
            WHEN status = 'CANCELLED' AND chef_acceptance_requested_at IS NULL THEN 'EXPIRED'
            ELSE 'CAPTURED'
        END
    ) STORED,
    ADD COLUMN IF NOT EXISTS refund_status VARCHAR(24) GENERATED ALWAYS AS (
        CASE
            WHEN status = 'REFUND_PENDING' THEN 'PROCESSING'
            WHEN status = 'REFUNDED' THEN 'SUCCEEDED'
            WHEN status = 'REFUND_FAILED' THEN 'FAILED'
            WHEN refund_requested_at IS NOT NULL THEN 'REQUESTED'
            ELSE 'NONE'
        END
    ) STORED;

CREATE OR REPLACE FUNCTION order_schema.bump_customer_order_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.version = OLD.version THEN
        NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_order_version ON order_schema.customer_order;
CREATE TRIGGER trg_customer_order_version
    BEFORE UPDATE OF status ON order_schema.customer_order
    FOR EACH ROW EXECUTE FUNCTION order_schema.bump_customer_order_version();

DO $$
DECLARE
    unknown_values TEXT;
BEGIN
    SELECT string_agg(DISTINCT status, ', ')
      INTO unknown_values
      FROM order_schema.customer_order
     WHERE status NOT IN (
        'PAYMENT_PENDING', 'CHEF_ACCEPTANCE_PENDING', 'CHEF_ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP',
        'OUT_FOR_DELIVERY', 'ARRIVED_AT_DROP', 'DELIVERED', 'CANCELLED', 'DELIVERY_FAILED', 'PAYMENT_EXPIRED',
        'CHEF_REJECTED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED', 'PAID', 'CREATED');
    IF unknown_values IS NULL THEN
        ALTER TABLE order_schema.customer_order
            ADD CONSTRAINT chk_customer_order_status_values CHECK (status IN (
                'PAYMENT_PENDING', 'CHEF_ACCEPTANCE_PENDING', 'CHEF_ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP',
                'OUT_FOR_DELIVERY', 'ARRIVED_AT_DROP', 'DELIVERED', 'CANCELLED', 'DELIVERY_FAILED', 'PAYMENT_EXPIRED',
                'CHEF_REJECTED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED', 'PAID', 'CREATED')) NOT VALID;
        ALTER TABLE order_schema.customer_order VALIDATE CONSTRAINT chk_customer_order_status_values;
    ELSE
        -- Never break a deploy over unexpected history: skip the CHECK and say why; a later migration adds it.
        RAISE WARNING 'CH-05: chk_customer_order_status_values not added; unexpected status values: %', unknown_values;
    END IF;
END;
$$;
