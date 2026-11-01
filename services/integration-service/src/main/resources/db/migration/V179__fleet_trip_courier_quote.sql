-- Phase B of the rider work, on fleet_schema.trip only (each hot table has its own migration, so no lock on one is held
-- while another is awaited). Additive: older code ignores the column and the index.
SET LOCAL lock_timeout = '5s';

-- R16 item 17: the couriers' quote for the order, asked with round 1 and reused by every later round's cost guard (one
-- quote per order). Nullable without a default, so adding it rewrites nothing.
ALTER TABLE fleet_schema.trip ADD COLUMN IF NOT EXISTS courier_quote_paise BIGINT;

-- Rain mode's automatic switch reads the last 30 minutes' rides to the door (FleetRain). Built after the column, under the
-- lock it already holds (never upgraded mid-migration); the trip table is small when this applies, so it builds in moments.
CREATE INDEX IF NOT EXISTS trip_arrived_drop ON fleet_schema.trip (arrived_drop_at) WHERE arrived_drop_at IS NOT NULL;
