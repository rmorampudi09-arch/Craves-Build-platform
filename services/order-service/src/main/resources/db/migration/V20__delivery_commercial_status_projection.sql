-- Keep the commercial order status visible to existing Customer/Chef APIs while
-- retaining the provider-neutral delivery_* projection as the source of delivery detail.
--
-- This migration only repairs states that are unambiguous from already-processed
-- delivery events. Cancellation/refund/rejection states are deliberately untouched.

WITH active_candidates AS (
    SELECT id, status
    FROM order_schema.customer_order
    WHERE status = 'READY_FOR_PICKUP'
      AND delivery_status IN ('PICKED_UP', 'IN_TRANSIT', 'AT_DROPOFF')
), active_history AS (
    INSERT INTO order_schema.order_status_history (
        id, order_id, old_status, new_status,
        actor_identity_id, reason, created_at
    )
    SELECT
        (
            substr(md5(c.id::text || ':v20:out-for-delivery'), 1, 8) || '-' ||
            substr(md5(c.id::text || ':v20:out-for-delivery'), 9, 4) || '-' ||
            substr(md5(c.id::text || ':v20:out-for-delivery'), 13, 4) || '-' ||
            substr(md5(c.id::text || ':v20:out-for-delivery'), 17, 4) || '-' ||
            substr(md5(c.id::text || ':v20:out-for-delivery'), 21, 12)
        )::uuid,
        c.id,
        c.status,
        'OUT_FOR_DELIVERY',
        NULL,
        'Delivery lifecycle backfill from existing delivery projection',
        now()
    FROM active_candidates c
    ON CONFLICT (id) DO NOTHING
    RETURNING order_id
)
UPDATE order_schema.customer_order o
SET status = 'OUT_FOR_DELIVERY',
    updated_at = now()
WHERE o.id IN (SELECT id FROM active_candidates)
  AND o.status = 'READY_FOR_PICKUP';

WITH delivered_candidates AS (
    SELECT id, status
    FROM order_schema.customer_order
    WHERE status IN ('READY_FOR_PICKUP', 'OUT_FOR_DELIVERY')
      AND delivery_status = 'DELIVERED'
), delivered_history AS (
    INSERT INTO order_schema.order_status_history (
        id, order_id, old_status, new_status,
        actor_identity_id, reason, created_at
    )
    SELECT
        (
            substr(md5(c.id::text || ':v20:delivered'), 1, 8) || '-' ||
            substr(md5(c.id::text || ':v20:delivered'), 9, 4) || '-' ||
            substr(md5(c.id::text || ':v20:delivered'), 13, 4) || '-' ||
            substr(md5(c.id::text || ':v20:delivered'), 17, 4) || '-' ||
            substr(md5(c.id::text || ':v20:delivered'), 21, 12)
        )::uuid,
        c.id,
        c.status,
        'DELIVERED',
        NULL,
        'Delivery lifecycle backfill from existing DELIVERED projection',
        now()
    FROM delivered_candidates c
    ON CONFLICT (id) DO NOTHING
    RETURNING order_id
)
UPDATE order_schema.customer_order o
SET status = 'DELIVERED',
    updated_at = now()
WHERE o.id IN (SELECT id FROM delivered_candidates)
  AND o.status IN ('READY_FOR_PICKUP', 'OUT_FOR_DELIVERY');
