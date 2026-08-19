-- Cursor pagination uses created_at plus id as a deterministic tie-breaker.
-- The existing V1 indexes remain valid; these v2 indexes extend them for stable
-- keyset pagination and optional status filtering.
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

CREATE INDEX IF NOT EXISTS idx_order_kitchen_history_cursor_v2
    ON order_schema.customer_order (
        kitchen_id,
        created_at DESC,
        id DESC
    );

CREATE INDEX IF NOT EXISTS idx_order_kitchen_history_status_cursor_v2
    ON order_schema.customer_order (
        kitchen_id,
        status,
        created_at DESC,
        id DESC
    );
