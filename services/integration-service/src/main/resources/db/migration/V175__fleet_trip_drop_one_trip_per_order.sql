-- Contract for V166 (WORKPLAN P2-06 f). Since V166, one current trip per order is the trip_current_per_order index, so
-- the old one-trip-per-order constraint goes and ops can give a trip before pickup to another rider. Ship this only once
-- no integration-service image older than V166's release can run or be rolled back to: those insert trips with
-- ON CONFLICT (chef_sub_order_id), which needs this constraint.
SET LOCAL lock_timeout = '5s';

ALTER TABLE fleet_schema.trip DROP CONSTRAINT IF EXISTS trip_chef_sub_order_id_key;
