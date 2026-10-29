-- "You're offline. Tap to go back online" (docs/riders/BLUEPRINT.md A7): when a shift's phone has been silent for
-- 3 minutes while the shift is still open, FleetDispatchJobs sends one push, at most every 30 minutes per shift.
ALTER TABLE fleet_schema.rider_shift ADD COLUMN IF NOT EXISTS last_nudge_at TIMESTAMPTZ;
