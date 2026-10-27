-- The shift's heartbeat (docs/riders/BLUEPRINT.md A1, A6): every /locations call is recorded, with or without new fixes.
-- rider_position_latest.received_at only moves when a newer fix arrives, so a phone that kept calling but had no new
-- fix looked silent to dispatch and the watchdog. last_seen_at is the time of the shift's last call.
ALTER TABLE fleet_schema.rider_shift ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Survival numbers for the pilot (PILOT-HEALTH.md): the longest gap between two calls, and how many gaps passed 60 s.
-- The first gap of a shift is counted from started_at.
ALTER TABLE fleet_schema.rider_shift ADD COLUMN IF NOT EXISTS max_silence_seconds INTEGER NOT NULL DEFAULT 0
    CHECK (max_silence_seconds >= 0);
ALTER TABLE fleet_schema.rider_shift ADD COLUMN IF NOT EXISTS silences_over_60s INTEGER NOT NULL DEFAULT 0
    CHECK (silences_over_60s >= 0);

-- Shifts open at deploy start from their latest fix's arrival, so the watchdog and dispatch don't see them as silent
-- before their next call reaches the new code.
UPDATE fleet_schema.rider_shift s SET last_seen_at = p.received_at
FROM fleet_schema.rider_position_latest p
WHERE s.ended_at IS NULL AND s.last_seen_at IS NULL AND p.rider_id = s.rider_id AND p.shift_id = s.id;
