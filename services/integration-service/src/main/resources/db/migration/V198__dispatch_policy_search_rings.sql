-- Search rings (R22 3-3; docs/riders/DISPATCH.md §2, "Search rings"): for the first ring_1_seconds of an order's fleet stage
-- only riders within ring_1_m of the kitchen may hear of it, then within ring_2_m until ring_2_seconds, then within
-- radius_m as before. All 0, the default every existing version takes: no rings, the one radius from the start, so
-- nothing changes here. Additive, with defaults: code that does not know the columns is unaffected.
-- They are rules: V192's trigger covers every column not on its list, so a version that changes one needs 14 days' notice
-- once a rate card is published. No row is updated here, so the trigger does not fire.
-- Give up rather than queue behind a long transaction.
SET LOCAL lock_timeout = '5s';
ALTER TABLE fleet_schema.dispatch_policy
    ADD COLUMN IF NOT EXISTS ring_1_m INTEGER NOT NULL DEFAULT 0 CHECK (ring_1_m BETWEEN 0 AND 20000),
    ADD COLUMN IF NOT EXISTS ring_1_seconds INTEGER NOT NULL DEFAULT 0 CHECK (ring_1_seconds BETWEEN 0 AND 3600),
    ADD COLUMN IF NOT EXISTS ring_2_m INTEGER NOT NULL DEFAULT 0 CHECK (ring_2_m BETWEEN 0 AND 20000),
    ADD COLUMN IF NOT EXISTS ring_2_seconds INTEGER NOT NULL DEFAULT 0 CHECK (ring_2_seconds BETWEEN 0 AND 3600);
