-- Order History v2 persists chef ownership into Order Service's own schema.
-- Existing rows are backfilled once from Catalog because both schemas currently
-- live in the approved Business PostgreSQL database. New inserts are snapshotted
-- by the trigger below so history reads never need a runtime join to Catalog.
ALTER TABLE order_schema.customer_order
    ADD COLUMN IF NOT EXISTS chef_identity_id UUID;

UPDATE order_schema.customer_order o
SET chef_identity_id = kp.identity_id
FROM catalog_schema.kitchen_profile kp
WHERE o.chef_identity_id IS NULL
  AND kp.id = o.kitchen_id;

CREATE OR REPLACE FUNCTION order_schema.resolve_customer_order_chef_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.chef_identity_id IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.kitchen_id IS DISTINCT FROM OLD.kitchen_id) THEN
        SELECT kp.identity_id
          INTO NEW.chef_identity_id
          FROM catalog_schema.kitchen_profile kp
         WHERE kp.id = NEW.kitchen_id;
    END IF;

    IF NEW.chef_identity_id IS NULL THEN
        RAISE EXCEPTION 'Cannot resolve chef identity for kitchen %', NEW.kitchen_id
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_customer_order_chef_identity
    ON order_schema.customer_order;

CREATE TRIGGER trg_order_customer_order_chef_identity
BEFORE INSERT OR UPDATE OF kitchen_id
ON order_schema.customer_order
FOR EACH ROW
EXECUTE FUNCTION order_schema.resolve_customer_order_chef_identity();

COMMENT ON COLUMN order_schema.customer_order.chef_identity_id IS
    'Immutable-at-order-time chef ownership snapshot used by Order Service read models.';

-- Cursor pagination uses created_at plus id as a deterministic tie-breaker.
CREATE INDEX IF NOT EXISTS idx_order_customer_history_cursor_v2
    ON order_schema.customer_order (
        customer_identity_id,
        created_at DESC,
        id DESC
    );

CREATE INDEX IF NOT EXISTS idx_order_customer_history_status_cursor_v2
    ON order_schema.customer_order (
        customer_identity_id,
        status,
        created_at DESC,
        id DESC
    );

CREATE INDEX IF NOT EXISTS idx_order_chef_history_cursor_v2
    ON order_schema.customer_order (
        chef_identity_id,
        created_at DESC,
        id DESC
    );

CREATE INDEX IF NOT EXISTS idx_order_chef_history_status_cursor_v2
    ON order_schema.customer_order (
        chef_identity_id,
        status,
        created_at DESC,
        id DESC
    );
