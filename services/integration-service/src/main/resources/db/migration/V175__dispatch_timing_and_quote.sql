-- Phase B of the rider work (R16 items 10 and 17). Only adds nullable columns and an index: older code ignores them.

-- The ready time the chef promised on accepting. ready_at moves when an early "ready" tap brings dispatch forward, so the
-- promise is kept here to compare the tap with (pilot_health.sql ready_vs_promise) and to correct per kitchen
-- (craves.delivery-command.ready-correction-enabled). Earlier commands keep ready_at, the best record there is of them.
ALTER TABLE delivery_schema.delivery_command ADD COLUMN IF NOT EXISTS promised_ready_at TIMESTAMPTZ;
UPDATE delivery_schema.delivery_command SET promised_ready_at = ready_at WHERE promised_ready_at IS NULL;

-- The kitchen's orders, for the per-kitchen numbers above.
CREATE INDEX IF NOT EXISTS ix_finance_snapshot_chef ON payment_schema.finance_issued_snapshot (chef_identity_id);

-- The couriers' quote for the order, asked with round 1 and reused by every later round's cost guard (one quote per order).
ALTER TABLE fleet_schema.trip ADD COLUMN IF NOT EXISTS courier_quote_paise BIGINT;
