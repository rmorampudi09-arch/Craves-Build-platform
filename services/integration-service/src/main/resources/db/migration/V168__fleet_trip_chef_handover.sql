-- WORKPLAN P2-05: the chef handed the food to the order's rider (order-service ORDER_HANDED_OVER). The watchdog never
-- hands a trip back after it: the rider has the food. Nullable; nothing else changes.
ALTER TABLE fleet_schema.trip ADD COLUMN IF NOT EXISTS chef_handed_over_at TIMESTAMPTZ;
