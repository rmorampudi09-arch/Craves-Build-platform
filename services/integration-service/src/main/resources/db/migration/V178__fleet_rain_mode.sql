-- Rain mode (R16 item 19; docs/riders/DISPATCH.md, "Rain mode"). Built switched off: the row starts at off and every
-- top-up at 0. While it is on, offers give at least 45 s to accept and run at most 2 rounds, the search for a rider starts
-- 5 minutes earlier and offers add the rate card's rain top-up; severe sends new orders straight to Borzo or Pidge. It
-- changes how orders are offered, so riders are told 14 days before its first use (Telangana Act 21 of 2026, s.13(2)).
-- Additive: older code ignores the new columns, and the trip table is small when this applies, so the index builds in moments.
SET LOCAL lock_timeout = '5s';

-- The ops switch: one row. Ops set it from the console; a weather feed, once one is chosen, can write the same row.
CREATE TABLE IF NOT EXISTS fleet_schema.rain_mode (
    id          BOOLEAN      PRIMARY KEY DEFAULT true CHECK (id),
    level       VARCHAR(6)   NOT NULL DEFAULT 'off' CHECK (level IN ('off', 'on', 'severe')),
    set_by      UUID,
    set_by_name VARCHAR(200),
    set_at      TIMESTAMPTZ
);
INSERT INTO fleet_schema.rain_mode (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Paid on each order offered while rain mode is on, as a line of the locked offer; the trip's final pay repeats the
-- accepted offer's line. Part of the riders' pay terms, so it arrives on a rate card with the usual 14 days' notice.
ALTER TABLE fleet_schema.rate_card
    ADD COLUMN IF NOT EXISTS rain_top_up_paise BIGINT NOT NULL DEFAULT 0 CHECK (rain_top_up_paise >= 0);

-- The automatic switch reads the last 30 minutes' rides to the door (FleetRain).
CREATE INDEX IF NOT EXISTS trip_arrived_drop ON fleet_schema.trip (arrived_drop_at) WHERE arrived_drop_at IS NOT NULL;
