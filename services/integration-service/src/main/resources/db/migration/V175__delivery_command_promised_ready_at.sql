-- Phase B of the rider work (R16 item 10): the ready time the chef promised on accepting. ready_at moves when an early
-- "ready" tap brings dispatch forward, so the promise is kept here to compare the tap with (pilot_health.sql
-- ready_vs_promise) and to correct per kitchen (craves.delivery-command.ready-correction-enabled). No backfill: an earlier
-- command's ready_at may be a tap, not the promise, so earlier commands stay NULL and every reader leaves them out.
-- Nullable without a default, so adding it rewrites nothing and older code ignores it.
SET LOCAL lock_timeout = '5s';

ALTER TABLE delivery_schema.delivery_command ADD COLUMN IF NOT EXISTS promised_ready_at TIMESTAMPTZ;
