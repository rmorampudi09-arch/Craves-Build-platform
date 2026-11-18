-- The fleet stage's stored next look (R22 4.8): when the order's next dispatch look is due, so a sweeper can find a stage
-- whose message never came (FleetStageSweeper, CRAVES_FLEET_STAGE_SWEEPER). NULL: the stage's deadline is its next look.
-- Additive: nothing reads or writes the column until that switch is on.
SET LOCAL lock_timeout = '5s';

ALTER TABLE fleet_schema.trip_stage ADD COLUMN IF NOT EXISTS next_match_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS trip_stage_wake ON fleet_schema.trip_stage (COALESCE(next_match_at, deadline_at))
    WHERE state = 'OPEN' AND provider = 'CRAVES_FLEET';
